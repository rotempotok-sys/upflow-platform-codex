export interface GoogleIdentity {
  email: string
  emailVerified: boolean
  sub: string
  name: string
}

interface GoogleTokenInfoResponse {
  aud?: string
  azp?: string
  email?: string
  email_verified?: string
  exp?: string
  iss?: string
  sub?: string
  name?: string
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase().normalize('NFC')
}

export function normalizeIdentityEmail(email: string): string {
  return normalizeEmail(email)
}

export async function verifyGoogleIdToken(options: {
  idToken: string
  clientId: string
}): Promise<GoogleIdentity> {
  const { idToken, clientId } = options

  if (!idToken.trim()) {
    throw new Error('AUTH_GOOGLE_INVALID: Missing idToken')
  }

  if (!clientId.trim()) {
    throw new Error('AUTH_GOOGLE_CONFIG: Missing GOOGLE client id on server')
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)

  if (!response.ok) {
    throw new Error('AUTH_GOOGLE_INVALID: tokeninfo rejected token')
  }

  const payload = (await response.json()) as GoogleTokenInfoResponse

  const aud = String(payload.aud ?? '')
  const iss = String(payload.iss ?? '')
  const exp = Number(payload.exp ?? 0)
  const sub = String(payload.sub ?? '').trim()
  const emailRaw = String(payload.email ?? '')
  const email = normalizeEmail(emailRaw)
  const emailVerified = String(payload.email_verified ?? '').toLowerCase() === 'true'

  if (aud !== clientId) {
    throw new Error('AUTH_GOOGLE_INVALID: Audience mismatch')
  }

  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') {
    throw new Error('AUTH_GOOGLE_INVALID: Issuer mismatch')
  }

  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
    throw new Error('AUTH_GOOGLE_INVALID: Token expired')
  }

  if (!email || !emailVerified || !sub) {
    throw new Error('AUTH_GOOGLE_INVALID: Missing required identity claims')
  }

  return {
    email,
    emailVerified,
    sub,
    name: String(payload.name ?? '').trim(),
  }
}
