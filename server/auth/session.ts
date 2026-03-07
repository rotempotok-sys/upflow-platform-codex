import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

interface SessionRecord {
  id: string
  email: string
  googleSub: string
  createdAtMs: number
  lastSeenAtMs: number
}

const SESSION_COOKIE_NAME = 'upflow_session'
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000
const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000

const sessions = new Map<string, SessionRecord>()

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {}

  const pairs = cookieHeader.split(';')
  const parsed: Record<string, string> = {}

  for (const pair of pairs) {
    const [rawKey, ...rawValueParts] = pair.trim().split('=')
    if (!rawKey || rawValueParts.length === 0) continue
    parsed[rawKey] = rawValueParts.join('=')
  }

  return parsed
}

function serializeCookie(options: {
  name: string
  value: string
  httpOnly: boolean
  sameSite: 'Lax' | 'Strict' | 'None'
  secure: boolean
  path: string
  maxAgeSeconds?: number
}): string {
  const parts = [`${options.name}=${options.value}`, `Path=${options.path}`, `SameSite=${options.sameSite}`]

  if (typeof options.maxAgeSeconds === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`)
  }

  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')

  return parts.join('; ')
}

function nowMs() {
  return Date.now()
}

function isSessionExpired(session: SessionRecord, now: number): boolean {
  const idleExpired = now - session.lastSeenAtMs > IDLE_TIMEOUT_MS
  const absoluteExpired = now - session.createdAtMs > ABSOLUTE_TIMEOUT_MS
  return idleExpired || absoluteExpired
}

export function createSession(email: string, googleSub: string): SessionRecord {
  const now = nowMs()
  const id = randomBytes(32).toString('hex')
  const session: SessionRecord = {
    id,
    email,
    googleSub,
    createdAtMs: now,
    lastSeenAtMs: now,
  }

  sessions.set(id, session)
  return session
}

export function destroySession(sessionId: string | null): void {
  if (!sessionId) return
  sessions.delete(sessionId)
}

export function getSessionIdFromRequest(req: IncomingMessage): string | null {
  const cookies = parseCookieHeader(req.headers.cookie)
  const sessionId = cookies[SESSION_COOKIE_NAME]
  if (!sessionId) return null
  return sessionId
}

export function getValidatedSession(req: IncomingMessage): SessionRecord | null {
  const sessionId = getSessionIdFromRequest(req)
  if (!sessionId) return null

  const session = sessions.get(sessionId)
  if (!session) return null

  const now = nowMs()
  if (isSessionExpired(session, now)) {
    sessions.delete(session.id)
    return null
  }

  session.lastSeenAtMs = now
  sessions.set(session.id, session)
  return session
}

export function setSessionCookie(res: ServerResponse, sessionId: string, isProduction: boolean): void {
  const cookie = serializeCookie({
    name: SESSION_COOKIE_NAME,
    value: sessionId,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProduction,
    maxAgeSeconds: ABSOLUTE_TIMEOUT_MS / 1000,
  })

  res.setHeader('Set-Cookie', cookie)
}

export function clearSessionCookie(res: ServerResponse, isProduction: boolean): void {
  const cookie = serializeCookie({
    name: SESSION_COOKIE_NAME,
    value: '',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProduction,
    maxAgeSeconds: 0,
  })

  res.setHeader('Set-Cookie', cookie)
}

export interface SessionUser {
  email: string
  googleSub: string
}

export function getSessionUser(req: IncomingMessage): SessionUser | null {
  const session = getValidatedSession(req)
  if (!session) return null

  return {
    email: session.email,
    googleSub: session.googleSub,
  }
}

