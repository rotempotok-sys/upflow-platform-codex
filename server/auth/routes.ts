import type { IncomingMessage, ServerResponse } from 'node:http'
import type { MondayAuthzEnv } from './mondayAuthz'
import { AUTHZ_CACHE_TTL_SECONDS, resolveUserAuthzByEmail } from './mondayAuthz'
import { normalizeIdentityEmail, verifyGoogleIdToken } from './google'
import { clearSessionCookie, createSession, destroySession, getSessionIdFromRequest, getSessionUser, setSessionCookie } from './session'

export interface AuthRouteEnv extends MondayAuthzEnv {
  googleClientId: string
  isProduction: boolean
}

interface GoogleLoginRequestBody {
  idToken?: string
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
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

export async function handleAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  env: AuthRouteEnv,
): Promise<boolean> {
  if (req.url === '/api/auth/google/login' && req.method === 'POST') {
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

  if (req.url === '/api/auth/logout' && req.method === 'POST') {
    const sessionId = getSessionIdFromRequest(req)
    destroySession(sessionId)
    clearSessionCookie(res, env.isProduction)
    res.statusCode = 204
    res.end()
    return true
  }

  return false
}
