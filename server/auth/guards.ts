import type { ServerResponse } from 'node:http'
import { hasAllPermissions, type PermissionKey } from './permissions'
import type { MondayAuthResolution, MondayAuthzEnv } from './mondayAuthz'
import { resolveUserAuthzByEmail } from './mondayAuthz'
import { clearSessionCookie, destroySession, getSessionIdFromRequest, getSessionUser } from './session'

export interface GuardEnv extends MondayAuthzEnv {
  isProduction: boolean
}

export interface GuardContext {
  auth: MondayAuthResolution
  user: NonNullable<MondayAuthResolution['user']>
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function clearSession(reqSessionId: string | null, res: ServerResponse, isProduction: boolean): void {
  destroySession(reqSessionId)
  clearSessionCookie(res, isProduction)
}

export async function requireApprovedPermissions(options: {
  req: any
  res: ServerResponse
  env: GuardEnv
  requiredPermissions: PermissionKey[]
}): Promise<GuardContext | null> {
  const { req, res, env, requiredPermissions } = options
  const sessionUser = getSessionUser(req)

  if (!sessionUser) {
    clearSessionCookie(res, env.isProduction)
    sendJson(res, 401, {
      error: {
        code: 'SESSION_MISSING_OR_EXPIRED',
        message: 'Login required',
      },
    })
    return null
  }

  const auth = await resolveUserAuthzByEmail({
    email: sessionUser.email,
    googleSub: sessionUser.googleSub,
    env,
  })

  if (auth.authState === 'not_eligible') {
    clearSession(getSessionIdFromRequest(req), res, env.isProduction)
    sendJson(res, 401, {
      error: {
        code: auth.errorCode ?? 'AUTH_NOT_ELIGIBLE',
        message: auth.errorMessage ?? 'Not eligible for access',
        authState: 'not_authorized',
      },
    })
    return null
  }

  if (!auth.user) {
    clearSession(getSessionIdFromRequest(req), res, env.isProduction)
    sendJson(res, 401, {
      error: {
        code: 'AUTH_DENIED',
        message: 'Authorization resolution failed',
      },
    })
    return null
  }

  if (auth.authState === 'blocked') {
    clearSession(getSessionIdFromRequest(req), res, env.isProduction)
    sendJson(res, 403, {
      error: {
        code: 'AUTH_BLOCKED',
        message: 'User is blocked',
        authState: 'blocked',
      },
    })
    return null
  }

  if (auth.authState !== 'approved') {
    sendJson(res, 403, {
      error: {
        code: 'AUTH_NOT_APPROVED',
        message: 'User is not approved for operational API access',
      },
    })
    return null
  }

  if (!hasAllPermissions(auth.user.permissions.keys, requiredPermissions)) {
    sendJson(res, 403, {
      error: {
        code: 'AUTH_PERMISSION_DENIED',
        message: 'Missing required permissions',
        requiredPermissions,
      },
    })
    return null
  }

  return {
    auth,
    user: auth.user,
  }
}
