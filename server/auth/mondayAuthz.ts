import { TtlCache } from './cache'
import type { AuthState, ApprovalStatus, PermissionOverrideInput, PlatformRole, ResolvedPermissions } from './permissions'
import { resolvePermissions } from './permissions'

const MONDAY_API_URL = 'https://api.monday.com/v2'
const AUTHZ_CACHE_TTL_MS = 60 * 1000

const authzCache = new TtlCache<string, MondayAuthResolution>(AUTHZ_CACHE_TTL_MS)

interface MondayColumnValue {
  id: string
  text: string | null
  value: string | null
  display_value?: string | null
  linked_item_ids?: Array<string | number> | null
}

interface MondayAuthBoardItem {
  id: string
  name: string
  column_values: MondayColumnValue[]
}

interface MondayBoard {
  id: string
  name: string
  items_page: {
    items: MondayAuthBoardItem[]
  }
}

interface MondaySimpleItem {
  id: string
  name: string
}

export interface MondayAuthzEnv {
  mondayApiToken: string
  mondayAuthBoardId: string
  roleColumnId: string
  approvalColumnId: string
  emailColumnId: string
  phoneColumnId: string
  googleSubColumnId: string
  roleStatusMap: Partial<Record<string, PlatformRole>>
  approvalStatusMap: Partial<Record<string, ApprovalStatus>>
  assignedClientsColumnId: string
  assignedFacilitiesColumnId: string
  toggleAssistantColumnId: string
  toggleCalendarColumnId: string
  toggleClientsColumnId: string
  toggleTeamColumnId: string
  toggleEquipmentColumnId: string
  toggleAiAskColumnId: string
}

export interface AuthScope {
  clientIds: string[]
  facilityIds: string[]
  scopedRole: boolean
  scopeConfigured: boolean
  scopeConfigMissingReason: string | null
}

export interface ResolvedAuthUser {
  boardItemId: string
  email: string
  displayName: string
  phone: string
  role: PlatformRole
  approval: ApprovalStatus
  googleSub: string
  permissions: ResolvedPermissions
  scope: AuthScope
}

export interface MondayAuthResolution {
  authState: AuthState
  user: ResolvedAuthUser | null
  errorCode?: string
  errorMessage?: string
  cachedAt: string
}

export interface AuthBoardUserRecord {
  boardItemId: string
  email: string
  displayName: string
  phone: string
  role: PlatformRole
  approval: ApprovalStatus
  googleSub: string
  permissions: ResolvedPermissions
  scope: AuthScope
  screenAccess: {
    assistant: boolean | null
    calendar: boolean | null
    clients: boolean | null
    team: boolean | null
    equipment: boolean | null
    aiAsk: boolean | null
  }
}

export interface AuthBoardUpdatePatch {
  role?: PlatformRole
  approval?: ApprovalStatus
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().normalize('NFC')
}

function normalizeStatusKey(value: string): string {
  return value.trim().toLowerCase().normalize('NFC')
}

function getColumn(item: MondayAuthBoardItem, columnId: string): MondayColumnValue | null {
  if (!columnId) return null
  return item.column_values.find((entry) => entry.id === columnId) ?? null
}

function getColumnText(item: MondayAuthBoardItem, columnId: string): string {
  const column = getColumn(item, columnId)
  if (!column) return ''

  const textValue = String(column.text ?? '').trim()
  if (textValue) return textValue

  const displayValue = String(column.display_value ?? '').trim()
  if (displayValue) return displayValue

  return String(column.value ?? '').trim()
}

function getColumnValueRaw(item: MondayAuthBoardItem, columnId: string): string {
  const column = getColumn(item, columnId)
  if (!column) return ''
  return String(column.value ?? '').trim()
}

async function mondayRequest(query: string, variables: unknown, token: string): Promise<any> {
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`Monday API HTTP ${response.status}: ${await response.text()}`)
  }

  const body = (await response.json()) as { data?: any; errors?: unknown[] }
  if (body.errors?.length) {
    throw new Error(`Monday API errors: ${JSON.stringify(body.errors)}`)
  }

  return body.data
}

async function fetchBoardWithColumns(token: string, boardId: string): Promise<MondayBoard> {
  const query = `
    query ($boardId: [ID!]) {
      boards(ids: $boardId) {
        id
        name
        items_page(limit: 500) {
          items {
            id
            name
            column_values {
              id
              text
              value
              ... on MirrorValue { display_value }
              ... on BoardRelationValue { display_value linked_item_ids }
              ... on DependencyValue { display_value }
              ... on FormulaValue { display_value }
              ... on SubtasksValue { display_value }
            }
          }
        }
      }
    }
  `

  const data = await mondayRequest(query, { boardId: [String(boardId)] }, token)
  const board = data?.boards?.[0] as MondayBoard | undefined

  if (!board) {
    throw new Error(`Board ${boardId} not found`)
  }

  return board
}

async function fetchSimpleBoardItems(token: string, boardId: string): Promise<MondaySimpleItem[]> {
  const query = `
    query ($boardId: [ID!]) {
      boards(ids: $boardId) {
        items_page(limit: 500) {
          items {
            id
            name
          }
        }
      }
    }
  `

  const data = await mondayRequest(query, { boardId: [String(boardId)] }, token)
  const items = (data?.boards?.[0]?.items_page?.items ?? []) as MondaySimpleItem[]
  return items.map((item) => ({ id: String(item.id), name: String(item.name ?? '').trim() }))
}

function resolveRole(rawRoleStatus: string, roleStatusMap: Partial<Record<string, PlatformRole>>): PlatformRole | null {
  const key = normalizeStatusKey(rawRoleStatus)
  if (!key) return null
  return roleStatusMap[key] ?? null
}

function resolveApproval(rawApprovalStatus: string, approvalStatusMap: Partial<Record<string, ApprovalStatus>>): ApprovalStatus | null {
  const key = normalizeStatusKey(rawApprovalStatus)
  if (!key) return null
  return approvalStatusMap[key] ?? null
}

function resolveAuthState(approval: ApprovalStatus): Exclude<AuthState, 'not_eligible'> {
  if (approval === 'Approved') return 'approved'
  if (approval === 'Pending') return 'pending'
  return 'blocked'
}

function validateStatusMappingConfig(env: MondayAuthzEnv): void {
  if (Object.keys(env.roleStatusMap).length === 0) {
    throw new Error('AUTH_MAPPING_CONFIG_MISSING: role status map is empty (TODO configure AUTH_ROLE_STATUS_MAP_JSON)')
  }

  if (Object.keys(env.approvalStatusMap).length === 0) {
    throw new Error('AUTH_MAPPING_CONFIG_MISSING: approval status map is empty (TODO configure AUTH_APPROVAL_STATUS_MAP_JSON)')
  }
}

function parseCheckboxValue(item: MondayAuthBoardItem, columnId: string): boolean | null {
  if (!columnId) return null

  const text = getColumnText(item, columnId).toLowerCase()
  if (text === 'true' || text === 'false') return text === 'true'
  if (text === 'yes' || text === 'no') return text === 'yes'
  if (text === '1' || text === '0') return text === '1'

  const raw = getColumnValueRaw(item, columnId)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const checked = parsed.checked
    if (typeof checked === 'string') return checked.toLowerCase() === 'true'
    if (typeof checked === 'boolean') return checked
  } catch {
    return null
  }

  return null
}

function parseRelationIds(item: MondayAuthBoardItem, columnId: string): string[] {
  if (!columnId) return []

  const column = getColumn(item, columnId)
  if (!column) return []

  const collected = new Set<string>()

  const pushId = (value: unknown) => {
    const normalized = String(value ?? '').trim()
    if (!normalized) return
    collected.add(normalized)
  }

  const collectFromArray = (value: unknown) => {
    if (!Array.isArray(value)) return
    for (const entry of value) {
      if (typeof entry === 'string' || typeof entry === 'number') {
        pushId(entry)
        continue
      }

      if (entry && typeof entry === 'object') {
        const entity = entry as Record<string, unknown>
        pushId(entity.linkedPulseId)
        pushId(entity.linkedPulseID)
        pushId(entity.item_id)
        pushId(entity.itemId)
        pushId(entity.id)
      }
    }
  }

  const collectFromScalar = (value: unknown) => {
    if (typeof value === 'string') {
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((entry) => pushId(entry))
      return
    }

    if (typeof value === 'number') {
      pushId(value)
    }
  }

  collectFromArray(column.linked_item_ids)

  const raw = String(column.value ?? '').trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      collectFromArray(parsed.linkedPulseIds)
      collectFromArray(parsed.item_ids)
      collectFromArray(parsed.itemIds)
      collectFromArray(parsed.linked_item_ids)
      collectFromArray(parsed.linkedItemIds)
      collectFromScalar(parsed.item_ids)
      collectFromScalar(parsed.itemIds)
      collectFromScalar(parsed.linked_item_ids)
      collectFromScalar(parsed.linkedItemIds)

      if (parsed.linked_item_ids_by_board && typeof parsed.linked_item_ids_by_board === 'object') {
        for (const value of Object.values(parsed.linked_item_ids_by_board as Record<string, unknown>)) {
          collectFromArray(value)
        }
      }
    } catch {
      // fall through
    }
  }

  if (collected.size > 0) return Array.from(collected)

  const text = getColumnText(item, columnId)
  if (!text) return []

  return Array.from(
    new Set(
      text
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  )
}

function scopedRole(role: PlatformRole): boolean {
  return role === 'Technician' || role === 'Viewer'
}

function toggleConfigPresent(env: MondayAuthzEnv): boolean {
  return Boolean(
    env.toggleAssistantColumnId &&
      env.toggleCalendarColumnId &&
      env.toggleClientsColumnId &&
      env.toggleTeamColumnId &&
      env.toggleEquipmentColumnId &&
      env.toggleAiAskColumnId,
  )
}

function assignmentConfigPresent(env: MondayAuthzEnv): boolean {
  return Boolean(env.assignedClientsColumnId && env.assignedFacilitiesColumnId)
}

function buildScope(item: MondayAuthBoardItem, role: PlatformRole, env: MondayAuthzEnv): AuthScope {
  if (!scopedRole(role)) {
    return {
      clientIds: [],
      facilityIds: [],
      scopedRole: false,
      scopeConfigured: true,
      scopeConfigMissingReason: null,
    }
  }

  if (!assignmentConfigPresent(env)) {
    return {
      clientIds: [],
      facilityIds: [],
      scopedRole: true,
      scopeConfigured: false,
      scopeConfigMissingReason: 'TODO configure AUTH_ASSIGNED_CLIENTS_COLUMN_ID and AUTH_ASSIGNED_FACILITIES_COLUMN_ID',
    }
  }

  return {
    clientIds: parseRelationIds(item, env.assignedClientsColumnId),
    facilityIds: parseRelationIds(item, env.assignedFacilitiesColumnId),
    scopedRole: true,
    scopeConfigured: true,
    scopeConfigMissingReason: null,
  }
}

function buildToggleOverrides(item: MondayAuthBoardItem, env: MondayAuthzEnv): PermissionOverrideInput {
  return {
    screenAssistant: parseCheckboxValue(item, env.toggleAssistantColumnId),
    screenCalendar: parseCheckboxValue(item, env.toggleCalendarColumnId),
    screenClients: parseCheckboxValue(item, env.toggleClientsColumnId),
    screenTeam: parseCheckboxValue(item, env.toggleTeamColumnId),
    screenEquipment: parseCheckboxValue(item, env.toggleEquipmentColumnId),
    aiAsk: parseCheckboxValue(item, env.toggleAiAskColumnId),
  }
}

function buildUserRecord(item: MondayAuthBoardItem, env: MondayAuthzEnv): AuthBoardUserRecord | null {
  const rawRole = getColumnText(item, env.roleColumnId)
  const rawApproval = getColumnText(item, env.approvalColumnId)
  const mappedRole = resolveRole(rawRole, env.roleStatusMap)
  const mappedApproval = resolveApproval(rawApproval, env.approvalStatusMap)

  if (!mappedRole || !mappedApproval) return null

  const isScoped = scopedRole(mappedRole)
  const scope = buildScope(item, mappedRole, env)
  const togglesConfigured = toggleConfigPresent(env)
  const toggleOverrides = buildToggleOverrides(item, env)
  const permissions = resolvePermissions(mappedRole, {
    overrides: toggleOverrides,
    failClosedConfig: isScoped && !togglesConfigured,
  })

  return {
    boardItemId: item.id,
    email: normalizeEmail(getColumnText(item, env.emailColumnId)),
    displayName: item.name.trim(),
    phone: getColumnText(item, env.phoneColumnId),
    role: mappedRole,
    approval: mappedApproval,
    googleSub: env.googleSubColumnId ? getColumnText(item, env.googleSubColumnId) : '',
    permissions,
    scope,
    screenAccess: {
      assistant: toggleOverrides.screenAssistant ?? null,
      calendar: toggleOverrides.screenCalendar ?? null,
      clients: toggleOverrides.screenClients ?? null,
      team: toggleOverrides.screenTeam ?? null,
      equipment: toggleOverrides.screenEquipment ?? null,
      aiAsk: toggleOverrides.aiAsk ?? null,
    },
  }
}

function reverseStatusMap<T extends string>(map: Partial<Record<string, T>>, target: T): string | null {
  for (const [label, value] of Object.entries(map)) {
    if (value === target) return label
  }
  return null
}

function buildColumnUpdatePayload(env: MondayAuthzEnv, patch: AuthBoardUpdatePatch): Record<string, unknown> {
  const updates: Record<string, unknown> = {}

  if (patch.role) {
    const roleLabel = reverseStatusMap(env.roleStatusMap, patch.role)
    if (!roleLabel) throw new Error('AUTH_MAPPING_UNRESOLVED: Missing reverse role mapping label for update')
    updates[env.roleColumnId] = { label: roleLabel }
  }

  if (patch.approval) {
    const approvalLabel = reverseStatusMap(env.approvalStatusMap, patch.approval)
    if (!approvalLabel) throw new Error('AUTH_MAPPING_UNRESOLVED: Missing reverse approval mapping label for update')
    updates[env.approvalColumnId] = { label: approvalLabel }
  }

  if (patch.screenAccess) {
    const mapPairs: Array<[string, boolean | undefined]> = [
      [env.toggleAssistantColumnId, patch.screenAccess.assistant],
      [env.toggleCalendarColumnId, patch.screenAccess.calendar],
      [env.toggleClientsColumnId, patch.screenAccess.clients],
      [env.toggleTeamColumnId, patch.screenAccess.team],
      [env.toggleEquipmentColumnId, patch.screenAccess.equipment],
      [env.toggleAiAskColumnId, patch.screenAccess.aiAsk],
    ]

    for (const [columnId, value] of mapPairs) {
      if (!columnId || typeof value !== 'boolean') continue
      updates[columnId] = { checked: value ? 'true' : 'false' }
    }
  }

  if (patch.assignments?.clientIds && env.assignedClientsColumnId) {
    updates[env.assignedClientsColumnId] = {
      item_ids: patch.assignments.clientIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
    }
  }

  if (patch.assignments?.facilityIds && env.assignedFacilitiesColumnId) {
    updates[env.assignedFacilitiesColumnId] = {
      item_ids: patch.assignments.facilityIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
    }
  }

  return updates
}

async function updateAuthBoardItemById(env: MondayAuthzEnv, itemId: string, patch: AuthBoardUpdatePatch): Promise<void> {
  const columnValues = buildColumnUpdatePayload(env, patch)
  if (Object.keys(columnValues).length === 0) return

  const query = `
    mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
        id
      }
    }
  `

  await mondayRequest(
    query,
    {
      boardId: String(env.mondayAuthBoardId),
      itemId: String(itemId),
      columnValues: JSON.stringify(columnValues),
    },
    env.mondayApiToken,
  )
}

export function clearAuthzCacheForEmail(email: string): void {
  authzCache.delete(normalizeEmail(email))
}

export function clearAuthzCacheAll(): void {
  authzCache.clear()
}

export async function listAuthBoardUsers(env: MondayAuthzEnv): Promise<AuthBoardUserRecord[]> {
  validateStatusMappingConfig(env)
  const board = await fetchBoardWithColumns(env.mondayApiToken, env.mondayAuthBoardId)
  const users = board.items_page.items
    .map((item) => buildUserRecord(item, env))
    .filter((entry): entry is AuthBoardUserRecord => entry !== null)
    .filter((entry) => Boolean(entry.email))

  users.sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'))
  return users
}

export async function getAuthBoardUserByEmail(env: MondayAuthzEnv, email: string): Promise<AuthBoardUserRecord | null> {
  const normalized = normalizeEmail(email)
  const users = await listAuthBoardUsers(env)
  return users.find((user) => user.email === normalized) ?? null
}

export async function updateAuthBoardUserByEmail(env: MondayAuthzEnv, email: string, patch: AuthBoardUpdatePatch): Promise<AuthBoardUserRecord> {
  const target = await getAuthBoardUserByEmail(env, email)
  if (!target) {
    throw new Error('AUTH_TARGET_NOT_FOUND: Target user not found')
  }

  await updateAuthBoardItemById(env, target.boardItemId, patch)
  clearAuthzCacheForEmail(target.email)

  const refreshed = await getAuthBoardUserByEmail(env, target.email)
  if (!refreshed) {
    throw new Error('AUTH_TARGET_NOT_FOUND: Updated target could not be reloaded')
  }

  clearAuthzCacheForEmail(refreshed.email)
  return refreshed
}

export async function getScopeOptions(env: MondayAuthzEnv, clientsBoardId: string, facilitiesBoardId: string): Promise<{
  clients: Array<{ id: string; name: string }>
  facilities: Array<{ id: string; name: string }>
}> {
  const [clients, facilities] = await Promise.all([
    fetchSimpleBoardItems(env.mondayApiToken, clientsBoardId),
    fetchSimpleBoardItems(env.mondayApiToken, facilitiesBoardId),
  ])

  return {
    clients,
    facilities,
  }
}

export async function resolveUserAuthzByEmail(options: {
  email: string
  googleSub: string
  env: MondayAuthzEnv
}): Promise<MondayAuthResolution> {
  const normalizedEmail = normalizeEmail(options.email)
  const cached = authzCache.get(normalizedEmail)
  if (cached) return cached

  const { env } = options
  if (!env.mondayApiToken.trim()) {
    throw new Error('AUTH_CONFIG_MISSING: MONDAY_API_TOKEN is required for auth endpoints')
  }

  validateStatusMappingConfig(env)

  const users = await listAuthBoardUsers(env)
  const match = users.find((user) => user.email === normalizedEmail)

  if (!match) {
    const resolution: MondayAuthResolution = {
      authState: 'not_eligible',
      user: null,
      errorCode: 'AUTH_NOT_ELIGIBLE',
      errorMessage: 'Email not found in Monday authorization board',
      cachedAt: new Date().toISOString(),
    }

    authzCache.set(normalizedEmail, resolution)
    return resolution
  }

  if (match.googleSub && match.googleSub !== options.googleSub) {
    const mismatch: MondayAuthResolution = {
      authState: 'not_eligible',
      user: null,
      errorCode: 'AUTH_IDENTITY_MISMATCH',
      errorMessage: 'google_sub mismatch; contact admin',
      cachedAt: new Date().toISOString(),
    }

    authzCache.set(normalizedEmail, mismatch)
    return mismatch
  }

  const user: ResolvedAuthUser = {
    boardItemId: match.boardItemId,
    email: match.email,
    displayName: match.displayName,
    phone: match.phone,
    role: match.role,
    approval: match.approval,
    googleSub: match.googleSub,
    permissions: match.permissions,
    scope: match.scope,
  }

  const resolution: MondayAuthResolution = {
    authState: resolveAuthState(match.approval),
    user,
    cachedAt: new Date().toISOString(),
  }

  authzCache.set(normalizedEmail, resolution)
  return resolution
}

export const AUTHZ_CACHE_TTL_SECONDS = AUTHZ_CACHE_TTL_MS / 1000


