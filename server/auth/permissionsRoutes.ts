import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  clearAuthzCacheForEmail,
  getAuthBoardUserByEmail,
  getScopeOptions,
  listAuthBoardUsers,
  updateAuthBoardUserByEmail,
  type MondayAuthzEnv,
} from './mondayAuthz'
import { requireApprovedPermissions, type GuardEnv } from './guards'
import type { ApprovalStatus, PlatformRole } from './permissions'

export interface PermissionsRouteEnv extends GuardEnv {
  mondayClientsBoardId: string
  mondayEquipmentBoardId: string
}

interface PermissionsPatchBody {
  approval?: ApprovalStatus
  role?: PlatformRole
  block?: boolean
  screenAccess?: {
    assistant?: boolean
    calendar?: boolean
    clients?: boolean
    team?: boolean
    equipment?: boolean
    aiAsk?: boolean
  }
  assignments?: {
    clientIds?: string[]
    facilityIds?: string[]
  }
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase().normalize('NFC')
}

function parseRequestUrl(req: IncomingMessage): URL {
  return new URL(req.url || '/', 'http://127.0.0.1')
}

function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = ''

    req.on('data', (chunk) => {
      raw += chunk.toString()
    })

    req.on('end', () => {
      if (!raw.trim()) {
        resolve({} as T)
        return
      }

      try {
        resolve(JSON.parse(raw) as T)
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })

    req.on('error', () => reject(new Error('Failed reading request body')))
  })
}

function mapUserListItem(user: Awaited<ReturnType<typeof listAuthBoardUsers>>[number]) {
  return {
    email: user.email,
    displayName: user.displayName,
    phone: user.phone,
    approval: user.approval,
    role: user.role,
    screenAccess: {
      assistant: user.permissions.configurableOverrides['screen.assistant'],
      calendar: user.permissions.configurableOverrides['screen.calendar'],
      clients: user.permissions.configurableOverrides['screen.clients'],
      team: user.permissions.configurableOverrides['screen.team'],
      equipment: user.permissions.configurableOverrides['screen.equipment'],
      aiAsk: user.permissions.configurableOverrides['ai.ask'],
    },
    assignments: {
      clientIds: user.scope.clientIds,
      facilityIds: user.scope.facilityIds,
    },
    isAdmin: user.role === 'Admin',
  }
}

function resolveApprovalForPatch(currentApproval: ApprovalStatus, body: PermissionsPatchBody): ApprovalStatus | undefined {
  if (typeof body.block === 'boolean') {
    if (body.block) return 'Blocked'
    if (currentApproval === 'Blocked') return body.approval ?? 'Pending'
  }

  return body.approval
}

function canActorMutateTarget(actorRole: PlatformRole, targetRole: PlatformRole): boolean {
  if (actorRole === 'Admin') return true
  if (actorRole === 'Operations') return targetRole !== 'Admin'
  return false
}

function canActorSetRole(actorRole: PlatformRole, nextRole: PlatformRole | undefined): boolean {
  if (!nextRole) return true
  if (actorRole === 'Admin') return true
  if (actorRole === 'Operations') return nextRole !== 'Admin'
  return false
}

async function guardPermissionsAccess(req: IncomingMessage, res: ServerResponse, env: GuardEnv) {
  return requireApprovedPermissions({
    req,
    res,
    env,
    requiredPermissions: ['screen.permissions', 'users.manage'],
  })
}

export async function handlePermissionsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  env: PermissionsRouteEnv,
): Promise<boolean> {
  const url = parseRequestUrl(req)

  if (url.pathname === '/api/admin/permissions/users' && req.method === 'GET') {
    const guard = await guardPermissionsAccess(req, res, env)
    if (!guard) return true

    try {
      const query = url.searchParams.get('query')?.trim().toLowerCase() || ''
      const roleFilter = url.searchParams.get('role')?.trim() || ''
      const approvalFilter = url.searchParams.get('approval')?.trim() || ''

      const users = await listAuthBoardUsers(env as MondayAuthzEnv)
      const filtered = users.filter((user) => {
        if (query) {
          const inQuery =
            user.email.toLowerCase().includes(query) ||
            user.displayName.toLowerCase().includes(query) ||
            user.phone.toLowerCase().includes(query)
          if (!inQuery) return false
        }

        if (roleFilter && user.role !== roleFilter) return false
        if (approvalFilter && user.approval !== approvalFilter) return false
        return true
      })

      json(res, 200, {
        items: filtered.map(mapUserListItem),
        nextCursor: null,
      })
      return true
    } catch (error) {
      json(res, 500, {
        error: {
          code: 'AUTH_PERMISSIONS_LIST_FAILED',
          message: error instanceof Error ? error.message : 'Failed listing permission users',
        },
      })
      return true
    }
  }

  if (url.pathname === '/api/admin/permissions/options' && req.method === 'GET') {
    const guard = await guardPermissionsAccess(req, res, env)
    if (!guard) return true

    try {
      const options = await getScopeOptions(env, env.mondayClientsBoardId, env.mondayEquipmentBoardId)
      json(res, 200, options)
      return true
    } catch (error) {
      json(res, 500, {
        error: {
          code: 'AUTH_PERMISSIONS_OPTIONS_FAILED',
          message: error instanceof Error ? error.message : 'Failed loading options',
        },
      })
      return true
    }
  }

  if (url.pathname.startsWith('/api/admin/permissions/users/') && req.method === 'PATCH') {
    const guard = await guardPermissionsAccess(req, res, env)
    if (!guard) return true

    const encodedEmail = url.pathname.slice('/api/admin/permissions/users/'.length)
    const targetEmail = normalizeEmail(decodeURIComponent(encodedEmail))

    if (!targetEmail) {
      json(res, 400, {
        error: {
          code: 'AUTH_BAD_REQUEST',
          message: 'Missing target email in route',
        },
      })
      return true
    }

    try {
      const body = await parseJsonBody<PermissionsPatchBody>(req)
      const target = await getAuthBoardUserByEmail(env, targetEmail)

      if (!target) {
        json(res, 404, {
          error: {
            code: 'AUTH_TARGET_NOT_FOUND',
            message: 'Target user not found',
          },
        })
        return true
      }

      if (!canActorMutateTarget(guard.user.role, target.role)) {
        json(res, 403, {
          error: {
            code: 'PERMISSION_DENIED_ADMIN_TARGET',
            message: 'Operations cannot modify Admin users',
          },
        })
        return true
      }

      if (!canActorSetRole(guard.user.role, body.role)) {
        json(res, 403, {
          error: {
            code: 'PERMISSION_DENIED_ROLE_ASSIGN',
            message: 'Operations cannot assign Admin role',
          },
        })
        return true
      }

      const approval = resolveApprovalForPatch(target.approval, body)
      const updated = await updateAuthBoardUserByEmail(env, target.email, {
        role: body.role,
        approval,
        screenAccess: body.screenAccess,
        assignments: body.assignments,
      })

      clearAuthzCacheForEmail(target.email)

      json(res, 200, {
        updated: true,
        item: mapUserListItem(updated),
      })
      return true
    } catch (error) {
      json(res, 500, {
        error: {
          code: 'AUTH_PERMISSIONS_UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Failed updating permissions user',
        },
      })
      return true
    }
  }

  return false
}
