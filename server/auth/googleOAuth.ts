/**
 * Google OAuth2 Authorization Code Flow utilities.
 *
 * Handles:
 * - Building the authorization URL (redirect to Google)
 * - Exchanging an authorization code for tokens
 * - Refreshing an access token using a refresh token
 * - Decoding ID token claims (JWT)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string // Only returned on first authorization (access_type=offline)
  id_token: string
  expires_in: number
  token_type: string
  scope: string
}

export interface GoogleRefreshResponse {
  access_token: string
  expires_in: number
  token_type: string
  scope: string
}

export interface GoogleIdTokenClaims {
  email: string
  email_verified: boolean
  sub: string
  name: string
  picture?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
].join(' ')

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

export function buildAuthorizationUrl(
  config: GoogleOAuthConfig,
  state: string,
  options?: { prompt?: string },
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    state,
    prompt: options?.prompt || 'select_account',
    include_granted_scopes: 'true',
  })

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Token Exchange (authorization code → tokens)
// ---------------------------------------------------------------------------

export async function exchangeCodeForTokens(
  config: GoogleOAuthConfig,
  code: string,
): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OAUTH_TOKEN_EXCHANGE_FAILED: ${response.status} ${errorBody}`)
  }

  return response.json() as Promise<GoogleTokenResponse>
}

// ---------------------------------------------------------------------------
// Refresh Access Token
// ---------------------------------------------------------------------------

export async function refreshAccessToken(
  config: Pick<GoogleOAuthConfig, 'clientId' | 'clientSecret'>,
  refreshToken: string,
): Promise<GoogleRefreshResponse> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    // Google returns 400 with error=invalid_grant when token is revoked
    if (response.status === 400 && errorBody.includes('invalid_grant')) {
      throw new Error('OAUTH_REFRESH_TOKEN_REVOKED')
    }
    throw new Error(`OAUTH_REFRESH_FAILED: ${response.status} ${errorBody}`)
  }

  return response.json() as Promise<GoogleRefreshResponse>
}

// ---------------------------------------------------------------------------
// Revoke Token (fire-and-forget)
// ---------------------------------------------------------------------------

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  } catch {
    // Best-effort revocation — don't throw
  }
}

// ---------------------------------------------------------------------------
// Decode ID Token Claims (JWT)
// ---------------------------------------------------------------------------

/**
 * Decodes the ID token JWT payload without verifying the signature.
 * This is safe because the token was just received directly from Google's
 * token endpoint over HTTPS — we trust it implicitly.
 */
export function decodeIdTokenClaims(idToken: string): GoogleIdTokenClaims {
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    throw new Error('OAUTH_INVALID_ID_TOKEN: Malformed JWT')
  }

  const payload = JSON.parse(
    Buffer.from(parts[1], 'base64url').toString('utf-8'),
  )

  const email = String(payload.email ?? '').trim().toLowerCase()
  if (!email) {
    throw new Error('OAUTH_INVALID_ID_TOKEN: Missing email claim')
  }

  return {
    email,
    email_verified: Boolean(payload.email_verified),
    sub: String(payload.sub ?? ''),
    name: String(payload.name ?? ''),
    picture: payload.picture ? String(payload.picture) : undefined,
  }
}
