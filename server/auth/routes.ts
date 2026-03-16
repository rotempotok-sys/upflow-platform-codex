import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { MondayAuthzEnv } from './mondayAuthz'
import { AUTHZ_CACHE_TTL_SECONDS, resolveUserAuthzByEmail } from './mondayAuthz'
import { normalizeIdentityEmail, verifyGoogleIdToken } from './google'
import { clearSessionCookie, createSession, destroySession, getSessionIdFromRequest, getSessionUser, setSessionCookie } from './session'
import { buildAuthorizationUrl, exchangeCodeForTokens, decodeIdTokenClaims, revokeToken, type GoogleOAuthConfig } from './googleOAuth'
import { saveTokens, deleteTokens, getFreshAccessToken, getTokens } from './tokenStore'
import type { SupabaseRuntimeConfig } from '../runtime/supabase'
import { readSupabaseRuntimeConfig } from '../runtime/supabase'

export interface AuthRouteEnv extends MondayAuthzEnv {
  googleClientId: string
  googleClientSecret: string
  googleRedirectUri: string
  isProduction: boolean
  // Supabase config for token store
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  supabaseDbSchema: string
}

interface GoogleLoginRequestBody {
  idToken?: string
}

// ---------------------------------------------------------------------------
// CSRF state store (in-memory, short-lived)
// ---------------------------------------------------------------------------

interface OAuthState {
  createdAtMs: number
  returnTo: string
}

const pendingStates = new Map<string, OAuthState>()
const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function cleanExpiredStates(): void {
  const now = Date.now()
  for (const [key, state] of pendingStates) {
    if (now - state.createdAtMs > STATE_TTL_MS) {
      pendingStates.delete(key)
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function redirect(res: ServerResponse, url: string): void {
  res.statusCode = 302
  res.setHeader('Location', url)
  res.end()
}

function parseErrorCode(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : 'Unknown auth error'

  if (message.includes('AUTH_GOOGLE_INVALID')) return { code: 'AUTH_GOOGLE_INVALID', message }
  if (message.includes('AUTH_GOOGLE_CONFIG')) return { code: 'AUTH_GOOGLE_CONFIG', message }
  if (message.includes('AUTH_CONFIG_MISSING')) return { code: 'AUTH_CONFIG_MISSING', message }
  if (message.includes('AUTH_MAPPING_CONFIG_MISSING')) return { code: 'AUTH_MAPPING_CONFIG_MISSING', message }
  if (message.includes('AUTH_MAPPING_UNRESOLVED')) return { code: 'AUTH_MAPPING_UNRESOLVED', message }

  return { code: 'AUTH_INTERNAL_ERROR', message }
}

function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ''

    req.on('data', (chunk) => {
      raw += chunk.toString()
    })

    req.on('end', () => resolve(raw))
    req.on('error', () => reject(new Error('Failed reading request body')))
  })
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const raw = await readRawBody(req)
  if (!raw.trim()) return {} as T

  return JSON.parse(raw) as T
}

function authUserResponse(user: NonNullable<Awaited<ReturnType<typeof resolveUserAuthzByEmail>>['user']>) {
  return {
    email: user.email,
    displayName: user.displayName,
    phone: user.phone,
    role: user.role,
    approval: user.approval,
  }
}

function parseUrl(req: IncomingMessage): { pathname: string; searchParams: URLSearchParams } {
  const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`)
  return { pathname: url.pathname, searchParams: url.searchParams }
}

function getOAuthConfig(env: AuthRouteEnv): GoogleOAuthConfig {
  return {
    clientId: env.googleClientId,
    clientSecret: env.googleClientSecret,
    redirectUri: env.googleRedirectUri,
  }
}

function getSupabaseConfig(env: AuthRouteEnv): SupabaseRuntimeConfig {
  return readSupabaseRuntimeConfig({
    SUPABASE_URL: env.supabaseUrl,
    SUPABASE_ANON_KEY: env.supabaseAnonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.supabaseServiceRoleKey,
    SUPABASE_DB_SCHEMA: env.supabaseDbSchema,
  })
}

function isValidReturnTo(path: string): boolean {
  // Must be a relative path starting with /
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('..')
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function handleAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  env: AuthRouteEnv,
): Promise<boolean> {
  const { pathname, searchParams } = parseUrl(req)

  // =========================================================================
  // GET /api/auth/google/start — Initiate OAuth2 redirect
  // =========================================================================
  if (pathname === '/api/auth/google/start' && req.method === 'GET') {
    if (!env.googleClientId || !env.googleClientSecret) {
      json(res, 500, {
        error: {
          code: 'OAUTH_CONFIG_MISSING',
          message: 'Google OAuth client ID or secret not configured',
        },
      })
      return true
    }

    cleanExpiredStates()

    const state = randomBytes(24).toString('hex')
    const returnTo = searchParams.get('returnTo') || '/'
    const promptOverride = searchParams.get('prompt') || undefined

    pendingStates.set(state, {
      createdAtMs: Date.now(),
      returnTo: isValidReturnTo(returnTo) ? returnTo : '/',
    })

    // Determine prompt: if explicitly set via query param, use that.
    // Otherwise, check if user already has a refresh token in Supabase.
    // If no stored refresh token → force consent (so Google returns one).
    // If refresh token exists → select_account (fast re-login, no consent).
    let resolvedPrompt = promptOverride
    if (!resolvedPrompt) {
      const sessionUser = getSessionUser(req)
      if (sessionUser) {
        try {
          const existing = await getTokens(getSupabaseConfig(env), sessionUser.email)
          if (!existing?.refresh_token) {
            resolvedPrompt = 'consent'
          }
        } catch {
          // Non-fatal — fall through to default (select_account)
        }
      }
    }

    const authUrl = buildAuthorizationUrl(getOAuthConfig(env), state, {
      prompt: resolvedPrompt,
    })

    redirect(res, authUrl)
    return true
  }

  // =========================================================================
  // GET /api/auth/google/callback — Handle OAuth2 callback
  // =========================================================================
  if (pathname === '/api/auth/google/callback' && req.method === 'GET') {
    try {
      const code = searchParams.get('code') || ''
      const stateParam = searchParams.get('state') || ''
      const errorParam = searchParams.get('error') || ''

      // Google returned an error (user denied consent, etc.)
      if (errorParam) {
        redirect(res, `/?auth_error=${encodeURIComponent(errorParam)}`)
        return true
      }

      // Validate CSRF state
      const storedState = pendingStates.get(stateParam)
      if (!storedState) {
        redirect(res, '/?auth_error=invalid_state')
        return true
      }
      pendingStates.delete(stateParam)

      if (Date.now() - storedState.createdAtMs > STATE_TTL_MS) {
        redirect(res, '/?auth_error=state_expired')
        return true
      }

      if (!code) {
        redirect(res, '/?auth_error=missing_code')
        return true
      }

      // Exchange code for tokens
      const oauthConfig = getOAuthConfig(env)
      const tokens = await exchangeCodeForTokens(oauthConfig, code)

      // Decode ID token to get user identity
      const identity = decodeIdTokenClaims(tokens.id_token)
      const normalizedEmail = normalizeIdentityEmail(identity.email)

      // Resolve authorization via Monday board (existing logic)
      const auth = await resolveUserAuthzByEmail({
        email: normalizedEmail,
        googleSub: identity.sub,
        env,
      })

      // Not eligible
      if (auth.authState === 'not_eligible') {
        clearSessionCookie(res, env.isProduction)
        redirect(res, '/?auth_error=not_authorized')
        return true
      }

      if (!auth.user) {
        clearSessionCookie(res, env.isProduction)
        redirect(res, '/?auth_error=not_authorized')
        return true
      }

      // Blocked
      if (auth.authState === 'blocked') {
        clearSessionCookie(res, env.isProduction)
        redirect(res, '/?auth_error=blocked')
        return true
      }

      // Create session
      const session = createSession(normalizedEmail, identity.sub)
      setSessionCookie(res, session.id, env.isProduction)

      // Save tokens to Supabase (if refresh_token is present)
      if (tokens.refresh_token) {
        try {
          await saveTokens(getSupabaseConfig(env), {
            email: normalizedEmail,
            googleSub: identity.sub,
            refreshToken: tokens.refresh_token,
            accessToken: tokens.access_token,
            expiresInSeconds: tokens.expires_in,
            scopes: tokens.scope || '',
          })
        } catch (tokenError) {
          console.error('[auth.callback] Failed to save tokens to Supabase:', tokenError)
          // Non-fatal — user can still use the app, just Calendar won't work
        }
      }

      // Redirect to app
      if (auth.authState === 'pending') {
        redirect(res, '/?auth_state=pending')
      } else {
        redirect(res, storedState.returnTo)
      }
      return true
    } catch (error) {
      console.error('[auth.callback] OAuth callback error:', error)
      redirect(res, '/?auth_error=callback_failed')
      return true
    }
  }

  // =========================================================================
  // GET /api/auth/google/token — Get fresh access token for Calendar API
  // =========================================================================
  if (pathname === '/api/auth/google/token' && req.method === 'GET') {
    try {
      const sessionUser = getSessionUser(req)
      if (!sessionUser) {
        json(res, 401, { error: { code: 'SESSION_MISSING', message: 'Login required' } })
        return true
      }

      const freshToken = await getFreshAccessToken(
        getSupabaseConfig(env),
        sessionUser.email,
        { clientId: env.googleClientId, clientSecret: env.googleClientSecret },
      )

      if (!freshToken) {
        json(res, 200, {
          error: 'NO_GOOGLE_TOKEN',
          message: 'No Google OAuth token available. User needs to re-authenticate.',
        })
        return true
      }

      json(res, 200, {
        accessToken: freshToken.accessToken,
        expiresAt: freshToken.expiresAt,
      })
      return true
    } catch (error) {
      console.error('[auth.token] Failed to get fresh access token:', error)
      json(res, 500, {
        error: { code: 'TOKEN_REFRESH_FAILED', message: 'Failed to refresh Google access token' },
      })
      return true
    }
  }

  // =========================================================================
  // POST /api/auth/google/login — LEGACY (deprecated, kept for transition)
  // =========================================================================
  if (req.url === '/api/auth/google/login' && req.method === 'POST') {
    res.setHeader('X-Deprecated', 'Use GET /api/auth/google/start instead')
    try {
      const body = await readJsonBody<GoogleLoginRequestBody>(req)
      const idToken = String(body.idToken ?? '').trim()
      if (!idToken) {
        json(res, 400, {
          error: {
            code: 'AUTH_BAD_REQUEST',
            message: 'Missing idToken',
          },
        })
        return true
      }

      const googleIdentity = await verifyGoogleIdToken({
        idToken,
        clientId: env.googleClientId,
      })

      const auth = await resolveUserAuthzByEmail({
        email: normalizeIdentityEmail(googleIdentity.email),
        googleSub: googleIdentity.sub,
        env,
      })

      if (auth.authState === 'not_eligible') {
        clearSessionCookie(res, env.isProduction)
        json(res, 403, {
          error: {
            code: auth.errorCode ?? 'AUTH_NOT_ELIGIBLE',
            message: auth.errorMessage ?? 'Not eligible for access',
            authState: 'not_authorized',
          },
        })
        return true
      }

      if (!auth.user) {
        clearSessionCookie(res, env.isProduction)
        json(res, 403, {
          error: {
            code: 'AUTH_DENIED',
            message: 'Authorization resolution failed',
          },
        })
        return true
      }

      if (auth.authState === 'blocked') {
        clearSessionCookie(res, env.isProduction)
        json(res, 403, {
          error: {
            code: 'AUTH_BLOCKED',
            message: 'User is blocked',
            authState: 'blocked',
          },
        })
        return true
      }

      const session = createSession(auth.user.email, googleIdentity.sub)
      setSessionCookie(res, session.id, env.isProduction)

      if (auth.authState === 'pending') {
        json(res, 200, {
          authState: 'pending',
          user: authUserResponse(auth.user),
          message: 'Account pending approval',
        })
        return true
      }

      json(res, 200, {
        authState: 'approved',
        user: authUserResponse(auth.user),
        permissions: auth.user.permissions,
        scope: auth.user.scope,
        calendarIdentityPolicy: {
          mode: 'warn_only',
        },
      })
      return true
    } catch (error) {
      const parsed = parseErrorCode(error)
      json(res, parsed.code === 'AUTH_GOOGLE_INVALID' ? 401 : 500, {
        error: {
          code: parsed.code,
          message: parsed.message,
        },
      })
      return true
    }
  }

  // =========================================================================
  // GET /api/auth/me — Validate session (unchanged)
  // =========================================================================
  if (req.url === '/api/auth/me' && req.method === 'GET') {
    try {
      const sessionUser = getSessionUser(req)
      if (!sessionUser) {
        clearSessionCookie(res, env.isProduction)
        json(res, 401, {
          authenticated: false,
          error: {
            code: 'SESSION_MISSING_OR_EXPIRED',
            message: 'Login required',
          },
        })
        return true
      }

      const auth = await resolveUserAuthzByEmail({
        email: sessionUser.email,
        googleSub: sessionUser.googleSub,
        env,
      })

      if (auth.authState === 'not_eligible') {
        const sessionId = getSessionIdFromRequest(req)
        destroySession(sessionId)
        clearSessionCookie(res, env.isProduction)
        json(res, 401, {
          authenticated: false,
          error: {
            code: auth.errorCode ?? 'AUTH_NOT_ELIGIBLE',
            message: auth.errorMessage ?? 'Not eligible for access',
            authState: 'not_authorized',
          },
        })
        return true
      }

      if (!auth.user) {
        const sessionId = getSessionIdFromRequest(req)
        destroySession(sessionId)
        clearSessionCookie(res, env.isProduction)
        json(res, 401, {
          authenticated: false,
          error: {
            code: 'AUTH_DENIED',
            message: 'Authorization resolution failed',
          },
        })
        return true
      }

      if (auth.authState === 'blocked') {
        const sessionId = getSessionIdFromRequest(req)
        destroySession(sessionId)
        clearSessionCookie(res, env.isProduction)
        json(res, 403, {
          authenticated: false,
          error: {
            code: 'AUTH_BLOCKED',
            message: 'User is blocked',
            authState: 'blocked',
          },
        })
        return true
      }

      if (auth.authState === 'pending') {
        json(res, 200, {
          authenticated: true,
          authState: 'pending',
          user: authUserResponse(auth.user),
          authzResolvedAt: auth.cachedAt,
          authzCacheTtlSeconds: AUTHZ_CACHE_TTL_SECONDS,
        })
        return true
      }

      json(res, 200, {
        authenticated: true,
        authState: 'approved',
        user: authUserResponse(auth.user),
        permissions: auth.user.permissions,
        scope: auth.user.scope,
        authzResolvedAt: auth.cachedAt,
        authzCacheTtlSeconds: AUTHZ_CACHE_TTL_SECONDS,
      })
      return true
    } catch (error) {
      const parsed = parseErrorCode(error)
      json(res, 500, {
        authenticated: false,
        error: {
          code: parsed.code,
          message: parsed.message,
        },
      })
      return true
    }
  }

  // =========================================================================
  // POST /api/auth/logout — Destroy session + revoke tokens
  // =========================================================================
  if (req.url === '/api/auth/logout' && req.method === 'POST') {
    // Get user email before destroying session (for token cleanup)
    const sessionUser = getSessionUser(req)

    const sessionId = getSessionIdFromRequest(req)
    destroySession(sessionId)
    clearSessionCookie(res, env.isProduction)

    // Clean up Google tokens from Supabase (fire-and-forget)
    if (sessionUser) {
      const supabaseConfig = getSupabaseConfig(env)
      deleteTokens(supabaseConfig, sessionUser.email).catch((err) => {
        console.error('[auth.logout] Failed to delete tokens:', err)
      })
    }

    res.statusCode = 204
    res.end()
    return true
  }

  return false
}
