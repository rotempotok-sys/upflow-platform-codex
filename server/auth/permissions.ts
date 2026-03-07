export type PlatformRole = 'Admin' | 'Operations' | 'Technician' | 'Viewer'

export type AuthState = 'approved' | 'pending' | 'blocked' | 'not_eligible'

export type ApprovalStatus = 'Approved' | 'Pending' | 'Blocked'

export const PERMISSION_KEYS = [
  'screen.assistant',
  'screen.calendar',
  'screen.clients',
  'screen.team',
  'screen.equipment',
  'screen.permissions',
  'ai.ask',
  'users.manage',
  'users.manage_admin',
  'users.manage_non_admin',
  'roles.assign_non_admin',
  'scope.assign',
  'users.block_non_admin',
  'screens.toggle',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

const ADMIN_PERMISSIONS: PermissionKey[] = [...PERMISSION_KEYS]

const OPERATIONS_PERMISSIONS: PermissionKey[] = [
  'screen.assistant',
  'screen.calendar',
  'screen.clients',
  'screen.team',
  'screen.equipment',
  'screen.permissions',
  'ai.ask',
  'users.manage',
  'users.manage_non_admin',
  'roles.assign_non_admin',
  'scope.assign',
  'users.block_non_admin',
  'screens.toggle',
]

const TECHNICIAN_PERMISSIONS: PermissionKey[] = [
  'screen.assistant',
  'screen.calendar',
  'screen.equipment',
  'ai.ask',
]

const VIEWER_PERMISSIONS: PermissionKey[] = []

const ROLE_DEFAULTS: Record<PlatformRole, PermissionKey[]> = {
  Admin: ADMIN_PERMISSIONS,
  Operations: OPERATIONS_PERMISSIONS,
  Technician: TECHNICIAN_PERMISSIONS,
  Viewer: VIEWER_PERMISSIONS,
}

export interface ResolvedPermissions {
  keys: PermissionKey[]
  configurableOverrides: Record<
    'screen.assistant' | 'screen.calendar' | 'screen.clients' | 'screen.team' | 'screen.equipment' | 'ai.ask',
    boolean
  >
}

export interface PermissionOverrideInput {
  screenAssistant?: boolean | null
  screenCalendar?: boolean | null
  screenClients?: boolean | null
  screenTeam?: boolean | null
  screenEquipment?: boolean | null
  aiAsk?: boolean | null
}

export function resolvePermissions(
  role: PlatformRole,
  options?: {
    overrides?: PermissionOverrideInput
    failClosedConfig?: boolean
  },
): ResolvedPermissions {
  const defaults = ROLE_DEFAULTS[role]
  const keySet = new Set<PermissionKey>(defaults)
  const overrides = options?.overrides
  const failClosed = options?.failClosedConfig === true

  const applyToggle = (permission: PermissionKey, value: boolean | null | undefined) => {
    if (typeof value !== 'boolean') {
      if (failClosed) keySet.delete(permission)
      return
    }

    if (value) keySet.add(permission)
    else keySet.delete(permission)
  }

  applyToggle('screen.assistant', overrides?.screenAssistant)
  applyToggle('screen.calendar', overrides?.screenCalendar)
  applyToggle('screen.clients', overrides?.screenClients)
  applyToggle('screen.team', overrides?.screenTeam)
  applyToggle('screen.equipment', overrides?.screenEquipment)
  applyToggle('ai.ask', overrides?.aiAsk)

  return {
    keys: Array.from(keySet),
    configurableOverrides: {
      'screen.assistant': keySet.has('screen.assistant'),
      'screen.calendar': keySet.has('screen.calendar'),
      'screen.clients': keySet.has('screen.clients'),
      'screen.team': keySet.has('screen.team'),
      'screen.equipment': keySet.has('screen.equipment'),
      'ai.ask': keySet.has('ai.ask'),
    },
  }
}

export function hasPermission(keys: PermissionKey[], required: PermissionKey): boolean {
  return keys.includes(required)
}

export function hasAllPermissions(keys: PermissionKey[], required: PermissionKey[]): boolean {
  return required.every((permission) => keys.includes(permission))
}

