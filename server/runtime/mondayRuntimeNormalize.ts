import type { MondayMappingInventory } from '../monday/mappingInventory'

interface MondayColumnValue {
  id: string
  type?: string | null
  text?: string | null
  value?: string | null
  display_value?: string | null
  linked_item_ids?: Array<string | number> | null
  linked_items?: Array<{ id?: string | number } | string | number> | null
}

interface MondayItem {
  id: string
  name?: string | null
  group?: {
    id?: string | null
    title?: string | null
  } | null
  column_values?: MondayColumnValue[]
}

interface MondayBoardColumn {
  id: string
  title?: string | null
  type?: string | null
}

interface MondayBoard {
  id: string
  name?: string | null
  columns?: MondayBoardColumn[]
  items_page?: {
    items?: MondayItem[]
  }
}

export interface RuntimeUserSnapshotRow {
  email: string
  displayName: string
  role: string | null
  approval: string | null
  metadata: Record<string, unknown>
}

export interface RuntimeOperationSnapshotRow {
  id: string
  shortOperationId: string | null
  requestPurposeRaw: string | null
  operationCategory: string | null
  businessStatus: string | null
  operationStatus: string | null
  operationGroupStatus: string | null
  isOpen: boolean
  clientItemId: string | null
  facilityItemId: string | null
  facilityLinkageState:
    | 'resolved_unique_client_facility_link'
    | 'ambiguous_client_facility_link'
    | 'missing_client_facility_link'
  technicianLinkageState:
    | 'canonical_schedule_email'
    | 'canonical_operations_email_fallback'
    | 'legacy_schedule_dropdown_resolved'
    | 'legacy_schedule_dropdown_fallback_pending'
    | 'unlinked'
  assignedTechnicianEmail: string | null
  executionStatus: string | null
  metadata: Record<string, unknown>
}

export interface RuntimeOperationAssignmentSnapshotRow {
  operationId: string
  userEmail: string
  role: 'performer'
  metadata: Record<string, unknown>
}
export interface RuntimeScheduleEntrySnapshotRow {
  id: string
  operationIdRef: string
  operationId: string | null
  taskType: string | null
  canonicalTechnicianEmail: string | null
  legacyTechnicianDropdownValue: string | null
  plannedDate: string | null
  plannedDateTime: string | null
  plannedDateTimeSource: 'calendar' | 'monday_date' | 'missing'
  calendarEventRef: string | null
  scheduleStatus: string | null
  calendarSyncStatus: string | null
  controlStatus: string | null
  technicianLinkageState: 'canonical_email' | 'legacy_dropdown_resolved' | 'unresolved'
  technicianLinkageSource: 'canonical_relation_email' | 'legacy_dropdown' | 'unresolved'
  metadata: Record<string, unknown>
}

export interface RuntimeReportSnapshotRow {
  id: string
  operationIdRef: string
  operationId: string | null
  scheduleEntryIdRef: string | null
  scheduleEntryId: string | null
  technicianEmail: string | null
  flowStatus: string | null
  qaStatus: string | null
  executedAt: string | null
  metadata: Record<string, unknown>
}

export interface UsersNormalizationDiagnostics {
  boardId: string
  boardName: string
  fetchedItems: number
  normalizedUsers: number
  skipped: {
    missingEmail: number
    invalidEmail: number
    missingEmployeeStatus: number
    inactiveEmployee: number
    notApproved: number
    irrelevantRole: number
    duplicateEmail: number
  }
  payloadSamples?: {
    auth: Array<Record<string, unknown>>
  }
}

export interface OperationsNormalizationDiagnostics {
  boardId: string
  boardName: string
  fetchedItems: number
  normalizedOperations: number
  normalizedAssignments: number
  skipped: {
    missingOperationId: number
    assignmentMissingEmail: number
    assignmentUserNotIncluded: number
    duplicateOperation: number
    duplicateAssignment: number
    facilityResolvedUniqueClientFacilityLink: number
    facilityAmbiguousClientFacilityLink: number
    facilityMissingClientFacilityLink: number
    technicianAmbiguousCanonicalEmail: number
    technicianCanonicalScheduleEmail: number
    technicianCanonicalOperationsEmailFallback: number
    technicianLegacyDropdownResolved: number
    technicianLegacyFallbackPending: number
    technicianUnlinked: number
    openStateDerivedOpen: number
    openStateDerivedClosed: number
  }
  payloadSamples?: {
    operationsClientRelation: Array<Record<string, unknown>>
    clientsFacilitiesRelation: Array<Record<string, unknown>>
  }
}

export interface ScheduleNormalizationDiagnostics {
  boardId: string
  boardName: string
  fetchedItems: number
  normalizedScheduleEntries: number
  skipped: {
    missingScheduleItemId: number
    missingOperationIdRef: number
    unresolvedOperationLink: number
    resolvedOperationLink: number
    technicianCanonicalEmail: number
    technicianLegacyResolved: number
    technicianUnresolved: number
    plannedDateTimeFromCalendar: number
    plannedDateTimeFromMondayDate: number
    plannedDateTimeMissing: number
    duplicateScheduleItem: number
  }
}

export interface ReportsNormalizationDiagnostics {
  boardId: string
  boardName: string
  fetchedItems: number
  normalizedReports: number
  skipped: {
    missingReportId: number
    missingOperationIdRef: number
    unresolvedOperationLink: number
    resolvedOperationLink: number
    unresolvedScheduleLink: number
    duplicateReportId: number
  }
}
interface ScheduleEntryContext {
  scheduleItemId: string
  operationIdRef: string
  technicianCanonicalEmail: string
  technicianLegacyLabel: string
  groupId: string
}

const RELEVANT_RUNTIME_ROLES = new Set(['admin', 'operations', 'technician', 'viewer'])
const OPEN_OPERATION_GROUP_IDS = new Set(['topics', 'group_title'])
const OPEN_SCHEDULE_GROUP_IDS = new Set(['topics', 'group_mknb6571', 'new_group_mkmbgrz9'])
const CLOSED_STATUS_KEYWORDS = ['סגור', 'סגורה', 'נסגר', 'הושלם', 'בוצע', 'closed', 'done', 'completed', 'cancelled', 'canceled']


function mapOperationGroupStatus(groupId: string): string {
  if (groupId === 'topics') return 'נכנסות'
  if (groupId === 'group_title') return 'בטיפול'
  if (groupId === 'new_group_mkmm1b2v') return 'נסגר'
  return 'לא ממופה'
}

function normalizedText(value: unknown) {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : ''
}

function normalizedEmail(value: unknown) {
  const email = normalizedText(value).toLowerCase()
  if (!email) return ''
  return email
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isApprovedPlatformAccess(value: string): boolean {
  const normalized = normalizedText(value).toLowerCase()
  if (!normalized) return false
  return (
    normalized === 'approved' ||
    normalized.includes('approve') ||
    normalized === 'מאושר' ||
    normalized.includes('אושר')
  )
}

function isActiveEmployeeStatus(value: string): { active: boolean; missing: boolean } {
  const normalized = normalizedText(value).toLowerCase()
  if (!normalized) return { active: false, missing: true }

  if (
    normalized.includes('לא פעיל') ||
    normalized.includes('inactive') ||
    normalized.includes('blocked') ||
    normalized.includes('terminated') ||
    normalized.includes('former') ||
    normalized.includes('עזב') ||
    normalized.includes('לא עובד')
  ) {
    return { active: false, missing: false }
  }

  if (normalized === 'active' || normalized.includes('פעיל') || normalized.includes('עובד')) {
    return { active: true, missing: false }
  }

  return { active: false, missing: false }
}

function normalizeRuntimeRole(value: string): string {
  const normalized = normalizedText(value)
  if (!normalized) return ''

  const key = normalized.toLowerCase()
  if (key.includes('admin') || key.includes('מנהל')) return 'Admin'
  if (key.includes('operations') || key.includes('תפעול') || key.includes('אופר')) return 'Operations'
  if (key.includes('technician') || key.includes('טכנאי')) return 'Technician'
  if (key.includes('viewer') || key.includes('צפ') || key.includes('view')) return 'Viewer'
  return ''
}

function getColumn(item: MondayItem, columnId: string): MondayColumnValue | undefined {
  return (item.column_values ?? []).find((entry) => String(entry.id) === columnId)
}

function getColumnText(item: MondayItem, columnId: string) {
  const column = getColumn(item, columnId)
  if (!column) return ''

  const display = normalizedText(column.display_value)
  if (display) return display

  const text = normalizedText(column.text)
  if (text) return text

  return ''
}

function getColumnRawValue(item: MondayItem, columnId: string) {
  const column = getColumn(item, columnId)
  return column?.value ?? null
}

function extractRelationIds(raw: unknown): string[] {
  const out = new Set<string>()
  const visited = new WeakSet<object>()

  const push = (value: unknown) => {
    const normalized = normalizedText(value)
    if (normalized) out.add(normalized)
  }

  const walk = (value: unknown): void => {
    if (value == null) return

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return

      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          walk(JSON.parse(trimmed))
          return
        } catch {
          // ignore JSON parse failure and continue scalar handling
        }
      }

      if (/^\d+$/.test(trimmed)) push(trimmed)
      return
    }

    if (typeof value === 'number') {
      push(value)
      return
    }

    if (Array.isArray(value)) {
      for (const entry of value) walk(entry)
      return
    }

    if (typeof value !== 'object') return

    const parsed = value as Record<string, unknown>
    if (visited.has(parsed)) return
    visited.add(parsed)

    if (Array.isArray(parsed.linked_item_ids)) {
      for (const entry of parsed.linked_item_ids) walk(entry)
    }

    if (Array.isArray(parsed.linked_items)) {
      for (const entry of parsed.linked_items) {
        if (entry && typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
          walk((entry as Record<string, unknown>).id)
        } else {
          walk(entry)
        }
      }
    }

    if (Array.isArray(parsed.item_ids)) {
      for (const entry of parsed.item_ids) walk(entry)
    }

    if (Array.isArray(parsed.linkedPulseIds)) {
      for (const entry of parsed.linkedPulseIds) {
        if (entry && typeof entry === 'object' && 'linkedPulseId' in (entry as Record<string, unknown>)) {
          walk((entry as Record<string, unknown>).linkedPulseId)
        } else {
          walk(entry)
        }
      }
    }

    if ('linked_item_id' in parsed) walk(parsed.linked_item_id)
    if ('item_id' in parsed) walk(parsed.item_id)
    if ('id' in parsed) walk(parsed.id)
    if ('value' in parsed) walk(parsed.value)
    if ('data' in parsed) walk(parsed.data)
  }

  walk(raw)
  return Array.from(out)
}

function extractRelationIdsFromColumn(column: MondayColumnValue | undefined): string[] {
  if (!column) return []

  if (Array.isArray(column.linked_item_ids) && column.linked_item_ids.length > 0) {
    return Array.from(
      new Set(
        column.linked_item_ids
          .map((entry) => normalizedText(entry))
          .filter((entry) => Boolean(entry)),
      ),
    )
  }

  if (Array.isArray(column.linked_items) && column.linked_items.length > 0) {
    return Array.from(
      new Set(
        column.linked_items
          .map((entry) => {
            if (entry && typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
              return normalizedText((entry as Record<string, unknown>).id)
            }
            return normalizedText(entry)
          })
          .filter((entry) => Boolean(entry)),
      ),
    )
  }

  return extractRelationIds(column.value)
}

function getColumnRelationIds(item: MondayItem, columnId: string): string[] {
  return extractRelationIdsFromColumn(getColumn(item, columnId))
}

function normalizeOperationCategory(requestPurposeRaw: string): string {
  const value = normalizedText(requestPurposeRaw).toLowerCase()

  if (!value) return 'General'
  if (value.includes('׳©׳™׳¨׳•׳×') || value.includes('׳×׳—׳–׳•׳§׳”') || value.includes('service')) return 'Service'
  if (value.includes('׳׳•׳’׳™׳¡׳˜׳™׳§׳”') || value.includes('׳׳¡׳™׳¨׳×') || value.includes('logistics')) return 'Logistics'
  if (value.includes('׳₪׳¨׳•׳™׳§׳˜') || value.includes('׳”׳§׳׳”') || value.includes('project')) return 'Project'
  if (value.includes('׳¨׳›׳©') || value.includes('procurement')) return 'Procurement'
  if (value.includes('׳׳›׳™׳¨׳”') || value.includes('sales')) return 'Sales'
  if (value.includes('׳×׳™׳§׳•׳') || value.includes('repair')) return 'Repair'

  return 'General'
}
function normalizePlannedDate(raw: string): string | null {
  const value = normalizedText(raw)
  if (!value) return null

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  const localMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value)
  if (localMatch) {
    const day = localMatch[1].padStart(2, '0')
    const month = localMatch[2].padStart(2, '0')
    const year = localMatch[3]
    return `${year}-${month}-${day}`
  }

  return null
}

function normalizeIsoDateTime(raw: string): string | null {
  const value = normalizedText(raw)
  if (!value) return null
  const asDate = new Date(value)
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString()
  return null
}

function extractDateTimeCandidate(raw: unknown): string | null {
  if (typeof raw === 'string') return normalizeIsoDateTime(raw)
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const candidate = extractDateTimeCandidate(entry)
      if (candidate) return candidate
    }
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const keys = ['startDateTime', 'start_date_time', 'startDate', 'start_date', 'dateTime', 'date_time', 'start', 'from', 'date']
  for (const key of keys) {
    const candidate = extractDateTimeCandidate(obj[key])
    if (candidate) return candidate
  }
  for (const value of Object.values(obj)) {
    const candidate = extractDateTimeCandidate(value)
    if (candidate) return candidate
  }
  return null
}

function derivePlannedDateTime(item: MondayItem, mapping: MondayMappingInventory): {
  plannedDate: string | null
  plannedDateTime: string | null
  source: 'calendar' | 'monday_date' | 'missing'
} {
  const calendarText = getColumnText(item, mapping.columns.schedule.calendarEventRef)
  const calendarRaw = getColumnRawValue(item, mapping.columns.schedule.calendarEventRef)

  let plannedDateTime = extractDateTimeCandidate(calendarText)
  if (!plannedDateTime) {
    const rawText = String(calendarRaw ?? '').trim()
    if (rawText) {
      try {
        plannedDateTime = extractDateTimeCandidate(JSON.parse(rawText))
      } catch {
        plannedDateTime = extractDateTimeCandidate(rawText)
      }
    }
  }

  if (plannedDateTime) return { plannedDate: plannedDateTime.slice(0, 10), plannedDateTime, source: 'calendar' }

  const mondayDate = normalizePlannedDate(getColumnText(item, mapping.columns.schedule.plannedDate))
  if (mondayDate) return { plannedDate: mondayDate, plannedDateTime: `${mondayDate}T00:00:00.000Z`, source: 'monday_date' }

  return { plannedDate: null, plannedDateTime: null, source: 'missing' }
}

function normalizeExecutedAt(raw: string): string | null {
  const planned = normalizePlannedDate(raw)
  if (!planned) return null
  return `${planned}T00:00:00.000Z`
}

function assertBoardHasColumns(board: MondayBoard, boardLabel: string, requiredColumnIds: string[]) {
  const existing = new Set((board.columns ?? []).map((column) => String(column.id)))
  const missing = requiredColumnIds.filter((columnId) => !existing.has(columnId))

  if (missing.length > 0) {
    throw new Error(`MAPPING_CONFIG_MISSING: ${boardLabel} is missing required columns: ${missing.join(', ')}`)
  }
}

function maskEmailLike(value: string): string {
  const text = normalizedText(value)
  const m = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(text)
  if (!m) return text
  if (m[1].length <= 2) return `**@${m[2]}`
  return `${m[1].slice(0, 2)}***@${m[2]}`
}

function sampleColumnPayload(items: MondayItem[], columnId: string, limit = 3): Array<Record<string, unknown>> {
  const sample: Array<Record<string, unknown>> = []
  for (const item of items) {
    const column = (item.column_values ?? []).find((entry) => String(entry.id) === columnId)
    if (!column) continue
    sample.push({
      itemId: normalizedText(item.id),
      itemName: normalizedText(item.name),
      columnId,
      columnType: normalizedText(column.type),
      text: maskEmailLike(normalizedText(column.text)),
      displayValue: maskEmailLike(normalizedText(column.display_value)),
      valuePreview: normalizedText(String(column.value ?? '')).slice(0, 220),
    })
    if (sample.length >= limit) break
  }
  return sample
}

function isClosedStatus(value: string | null): boolean {
  const normalized = normalizedText(value).toLowerCase()
  if (!normalized) return false
  return CLOSED_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

function buildScheduleContextIndexes(
  scheduleBoard: MondayBoard,
  mapping: MondayMappingInventory,
): { byOperationId: Map<string, ScheduleEntryContext[]>; byScheduleItemId: Map<string, ScheduleEntryContext> } {
  assertBoardHasColumns(scheduleBoard, 'schedule board', [
    mapping.columns.schedule.operationIdRef,
    mapping.columns.schedule.technicianRelation,
    mapping.columns.schedule.technicianEmailMirror,
    mapping.columns.schedule.technicianLegacyDropdown,
  ])

  const byOperationId = new Map<string, ScheduleEntryContext[]>()
  const byScheduleItemId = new Map<string, ScheduleEntryContext>()

  for (const item of scheduleBoard.items_page?.items ?? []) {
    const operationIdRef = normalizedText(getColumnText(item, mapping.columns.schedule.operationIdRef))
    const scheduleItemId = normalizedText(item.id)
    if (!scheduleItemId) continue

    const context: ScheduleEntryContext = {
      scheduleItemId,
      operationIdRef,
      technicianCanonicalEmail: normalizedEmail(getColumnText(item, mapping.columns.schedule.technicianEmailMirror)),
      technicianLegacyLabel: normalizedText(getColumnText(item, mapping.columns.schedule.technicianLegacyDropdown)),
      groupId: normalizedText(item.group?.id),
    }

    byScheduleItemId.set(scheduleItemId, context)
    if (!operationIdRef) continue

    const current = byOperationId.get(operationIdRef) ?? []
    current.push(context)
    byOperationId.set(operationIdRef, current)
  }

  return { byOperationId, byScheduleItemId }
}

function buildFacilityMapByClientFromClientsBoard(
  clientsBoard: MondayBoard,
  mapping: MondayMappingInventory,
): Map<string, string[]> {
  assertBoardHasColumns(clientsBoard, 'clients board', [mapping.columns.clients.facilitiesRelation])

  const facilitiesByClient = new Map<string, string[]>()
  for (const item of clientsBoard.items_page?.items ?? []) {
    const clientId = normalizedText(item.id)
    if (!clientId) continue
    const facilityIds = getColumnRelationIds(item, mapping.columns.clients.facilitiesRelation)
    facilitiesByClient.set(clientId, facilityIds)
  }

  return facilitiesByClient
}

export function normalizeUsersFromAuthBoard(
  board: MondayBoard,
  mapping: MondayMappingInventory,
): {
  users: RuntimeUserSnapshotRow[]
  diagnostics: UsersNormalizationDiagnostics
} {
  assertBoardHasColumns(board, 'auth board', [
    mapping.columns.auth.email,
    mapping.columns.auth.role,
    mapping.columns.auth.approval,
    mapping.columns.auth.employeeStatus,
  ])

  const dedupe = new Map<string, RuntimeUserSnapshotRow>()

  let missingEmail = 0
  let invalidEmail = 0
  let missingEmployeeStatus = 0
  let inactiveEmployee = 0
  let notApproved = 0
  let irrelevantRole = 0
  let duplicateEmail = 0

  for (const item of board.items_page?.items ?? []) {
    const email = normalizedEmail(getColumnText(item, mapping.columns.auth.email))
    if (!email) {
      missingEmail += 1
      continue
    }

    if (!isValidEmail(email)) {
      invalidEmail += 1
      continue
    }

    const employeeStatus = normalizedText(getColumnText(item, mapping.columns.auth.employeeStatus))
    const activeEmployee = isActiveEmployeeStatus(employeeStatus)
    if (activeEmployee.missing) {
      missingEmployeeStatus += 1
      continue
    }

    if (!activeEmployee.active) {
      inactiveEmployee += 1
      continue
    }

    const approval = normalizedText(getColumnText(item, mapping.columns.auth.approval))
    if (!isApprovedPlatformAccess(approval)) {
      notApproved += 1
      continue
    }

    const role = normalizeRuntimeRole(getColumnText(item, mapping.columns.auth.role))
    if (!role || !RELEVANT_RUNTIME_ROLES.has(role.toLowerCase())) {
      irrelevantRole += 1
      continue
    }

    const row: RuntimeUserSnapshotRow = {
      email,
      displayName: normalizedText(item.name) || email,
      role,
      approval: approval || null,
      metadata: {
        mondayBoardId: board.id,
        mondayItemId: item.id,
        employeeStatus,
      },
    }

    if (dedupe.has(email)) {
      duplicateEmail += 1
    }

    dedupe.set(email, row)
  }

  const uniqueUsers = Array.from(dedupe.values())

  return {
    users: uniqueUsers,
    diagnostics: {
      boardId: normalizedText(board.id),
      boardName: normalizedText(board.name) || 'auth',
      fetchedItems: (board.items_page?.items ?? []).length,
      normalizedUsers: uniqueUsers.length,
      skipped: {
        missingEmail,
        invalidEmail,
        missingEmployeeStatus,
        inactiveEmployee,
        notApproved,
        irrelevantRole,
        duplicateEmail,
      },
      payloadSamples: {
        auth: [
          ...sampleColumnPayload(board.items_page?.items ?? [], mapping.columns.auth.email),
          ...sampleColumnPayload(board.items_page?.items ?? [], mapping.columns.auth.employeeStatus),
          ...sampleColumnPayload(board.items_page?.items ?? [], mapping.columns.auth.role),
          ...sampleColumnPayload(board.items_page?.items ?? [], mapping.columns.auth.approval),
        ],
      },
    },
  }
}

export function normalizeOperationsFromBoard(input: {
  operationsBoard: MondayBoard
  clientsBoard: MondayBoard
  scheduleBoard: MondayBoard
  mapping: MondayMappingInventory
  runtimeUsers: RuntimeUserSnapshotRow[]
}): {
  operations: RuntimeOperationSnapshotRow[]
  assignments: RuntimeOperationAssignmentSnapshotRow[]
  diagnostics: OperationsNormalizationDiagnostics
} {
  const { operationsBoard, clientsBoard, scheduleBoard, mapping, runtimeUsers } = input

  assertBoardHasColumns(operationsBoard, 'operations board', [
    mapping.columns.operations.shortOperationId,
    mapping.columns.operations.requestPurpose,
    mapping.columns.operations.businessStatus,
    mapping.columns.operations.clientRelation,
    mapping.columns.operations.performerRelation,
    mapping.columns.operations.performerEmailMirror,
    mapping.columns.operations.executionStatusCheck,
    mapping.columns.operations.scheduleRelation,
  ])

  const scheduleIndexes = buildScheduleContextIndexes(scheduleBoard, mapping)

  const operations: RuntimeOperationSnapshotRow[] = []
  const assignments: RuntimeOperationAssignmentSnapshotRow[] = []

  const runtimeUserByDisplayName = new Map<string, string>()
  const runtimeUserEmails = new Set<string>()
  for (const row of runtimeUsers) {
    runtimeUserEmails.add(row.email)
    const display = normalizedText(row.displayName).toLowerCase()
    if (display && !runtimeUserByDisplayName.has(display)) {
      runtimeUserByDisplayName.set(display, row.email)
    }
  }

  const facilitiesByClient = buildFacilityMapByClientFromClientsBoard(clientsBoard, mapping)

  let missingOperationId = 0
  let assignmentMissingEmail = 0
  let assignmentUserNotIncluded = 0
  let facilityResolvedUniqueClientFacilityLink = 0
  let facilityAmbiguousClientFacilityLink = 0
  let facilityMissingClientFacilityLink = 0
  let technicianAmbiguousCanonicalEmail = 0
  let technicianCanonicalScheduleEmail = 0
  let technicianCanonicalOperationsEmailFallback = 0
  let technicianLegacyDropdownResolved = 0
  let technicianLegacyFallbackPending = 0
  let technicianUnlinked = 0
  let openStateDerivedOpen = 0
  let openStateDerivedClosed = 0

  for (const item of operationsBoard.items_page?.items ?? []) {
    const operationId = normalizedText(item.id)
    if (!operationId) {
      missingOperationId += 1
      continue
    }

    const requestPurposeRaw = normalizedText(getColumnText(item, mapping.columns.operations.requestPurpose)) || null
    const operationCategory = normalizeOperationCategory(requestPurposeRaw ?? '')
    const businessStatus = normalizedText(getColumnText(item, mapping.columns.operations.businessStatus)) || null
    const operationStatus = businessStatus
    const executionStatus = normalizedText(getColumnText(item, mapping.columns.operations.executionStatusCheck)) || null

    const shortOperationId = normalizedText(getColumnText(item, mapping.columns.operations.shortOperationId)) || null
    const scheduleContextsByOperationId = [ ...(scheduleIndexes.byOperationId.get(operationId) ?? []), ...(shortOperationId ? scheduleIndexes.byOperationId.get(shortOperationId) ?? [] : []) ]
    const linkedScheduleIds = getColumnRelationIds(item, mapping.columns.operations.scheduleRelation)
    const linkedByRelation = linkedScheduleIds
      .map((scheduleId) => scheduleIndexes.byScheduleItemId.get(scheduleId))
      .filter((entry): entry is ScheduleEntryContext => Boolean(entry))
    const scheduleContextMap = new Map<string, ScheduleEntryContext>()
    for (const entry of [...scheduleContextsByOperationId, ...linkedByRelation]) scheduleContextMap.set(entry.scheduleItemId, entry)
    const linkedScheduleContexts = Array.from(scheduleContextMap.values())

    const operationGroupId = normalizedText(item.group?.id)
    const operationGroupStatus = mapOperationGroupStatus(operationGroupId)
    const operationGroupOpen = OPEN_OPERATION_GROUP_IDS.has(operationGroupId)
    const scheduleGroupOpen = linkedScheduleContexts.some((entry) => OPEN_SCHEDULE_GROUP_IDS.has(entry.groupId))
    const closedByStatus = isClosedStatus(businessStatus) || isClosedStatus(executionStatus)
    const isOpen = !closedByStatus && (operationGroupOpen || scheduleGroupOpen)
    if (isOpen) openStateDerivedOpen += 1
    else openStateDerivedClosed += 1

    const clientRelationIds = getColumnRelationIds(item, mapping.columns.operations.clientRelation)
    const clientItemId = clientRelationIds.length === 1 ? clientRelationIds[0] : null

    let facilityItemId: string | null = null
    let facilityLinkageState: RuntimeOperationSnapshotRow['facilityLinkageState'] = 'missing_client_facility_link'

    if (clientRelationIds.length === 0) {
      facilityMissingClientFacilityLink += 1
      facilityLinkageState = 'missing_client_facility_link'
    } else if (clientRelationIds.length > 1) {
      facilityAmbiguousClientFacilityLink += 1
      facilityLinkageState = 'ambiguous_client_facility_link'
    } else {
      const facilitiesForClient = facilitiesByClient.get(clientRelationIds[0]) ?? []
      if (facilitiesForClient.length === 1) {
        facilityItemId = facilitiesForClient[0]
        facilityResolvedUniqueClientFacilityLink += 1
        facilityLinkageState = 'resolved_unique_client_facility_link'
      } else if (facilitiesForClient.length > 1) {
        facilityAmbiguousClientFacilityLink += 1
        facilityLinkageState = 'ambiguous_client_facility_link'
      } else {
        facilityMissingClientFacilityLink += 1
        facilityLinkageState = 'missing_client_facility_link'
      }
    }

    const performerDisplay = normalizedText(getColumnText(item, mapping.columns.operations.performerRelation))
    const operationsEmail = normalizedEmail(getColumnText(item, mapping.columns.operations.performerEmailMirror))

    const canonicalScheduleEmails = new Set(
      linkedScheduleContexts.map((entry) => entry.technicianCanonicalEmail).filter((value) => Boolean(value)),
    )

    let assignedEmail: string | null = null
    let technicianLinkageState: RuntimeOperationSnapshotRow['technicianLinkageState'] = 'unlinked'

    if (canonicalScheduleEmails.size === 1) {
      assignedEmail = Array.from(canonicalScheduleEmails)[0]
      technicianLinkageState = 'canonical_schedule_email'
      technicianCanonicalScheduleEmail += 1
    } else if (canonicalScheduleEmails.size > 1) {
      technicianAmbiguousCanonicalEmail += 1
      technicianLinkageState = 'unlinked'
    } else if (operationsEmail) {
      assignedEmail = operationsEmail
      technicianLinkageState = 'canonical_operations_email_fallback'
      technicianCanonicalOperationsEmailFallback += 1
    } else {
      const legacyLabels = new Set(
        linkedScheduleContexts.map((entry) => normalizedText(entry.technicianLegacyLabel).toLowerCase()).filter((value) => Boolean(value)),
      )

      if (legacyLabels.size === 1) {
        const legacyLabel = Array.from(legacyLabels)[0]
        const resolvedEmail = runtimeUserByDisplayName.get(legacyLabel) ?? null
        if (resolvedEmail) {
          assignedEmail = resolvedEmail
          technicianLinkageState = 'legacy_schedule_dropdown_resolved'
          technicianLegacyDropdownResolved += 1
        } else {
          technicianLinkageState = 'legacy_schedule_dropdown_fallback_pending'
          technicianLegacyFallbackPending += 1
        }
      } else if (legacyLabels.size > 1) {
        technicianLinkageState = 'legacy_schedule_dropdown_fallback_pending'
        technicianLegacyFallbackPending += 1
      } else {
        technicianLinkageState = 'unlinked'
        technicianUnlinked += 1
      }
    }

    operations.push({
      id: operationId,
      shortOperationId,
      requestPurposeRaw,
      operationCategory,
      businessStatus,
      operationStatus,
      operationGroupStatus,
      isOpen,
      clientItemId,
      facilityItemId,
      facilityLinkageState,
      technicianLinkageState,
      assignedTechnicianEmail: assignedEmail,
      executionStatus,
      metadata: {
        mondayBoardId: operationsBoard.id,
        mondayItemId: operationId,
        performerDisplay,
        performerRelationValue: getColumnRawValue(item, mapping.columns.operations.performerRelation),
        scheduleRelationValue: getColumnRawValue(item, mapping.columns.operations.scheduleRelation),
        linkedScheduleIds,
        linkedScheduleItemsCount: linkedScheduleContexts.length,
        operationGroupId,
        operationGroupStatus,
        openStateInputs: {
          operationGroupOpen,
          scheduleGroupOpen,
          closedByStatus,
        },
        requestPurposeRaw,
        operationCategory,
        clientRelationIds,
        clientItemId,
        facilityItemId,
        facilityLinkageState,
        technicianLinkageState,
        technicianCanonicalLinkage: {
          operationsEmailMirror: mapping.columns.operations.performerEmailMirror,
          scheduleTechnicianRelation: mapping.columns.schedule.technicianRelation,
          scheduleTechnicianEmailMirror: mapping.columns.schedule.technicianEmailMirror,
        },
        technicianLegacyFallback: mapping.columns.schedule.technicianLegacyDropdown,
      },
    })

    if (!assignedEmail) {
      assignmentMissingEmail += 1
      continue
    }

    if (!runtimeUserEmails.has(assignedEmail)) {
      assignmentUserNotIncluded += 1
      continue
    }

    assignments.push({
      operationId,
      userEmail: assignedEmail,
      role: 'performer',
      metadata: {
        mondayBoardId: operationsBoard.id,
        mondayItemId: operationId,
        performerDisplay,
      },
    })
  }

  const operationDedupe = new Map<string, RuntimeOperationSnapshotRow>()
  let duplicateOperation = 0
  for (const row of operations) {
    if (operationDedupe.has(row.id)) duplicateOperation += 1
    operationDedupe.set(row.id, row)
  }

  const assignmentDedupe = new Map<string, RuntimeOperationAssignmentSnapshotRow>()
  let duplicateAssignment = 0
  for (const row of assignments) {
    const key = `${row.operationId}::${row.userEmail}::${row.role}`
    if (assignmentDedupe.has(key)) duplicateAssignment += 1
    assignmentDedupe.set(key, row)
  }

  const normalizedOperations = Array.from(operationDedupe.values())
  const normalizedAssignments = Array.from(assignmentDedupe.values())

  return {
    operations: normalizedOperations,
    assignments: normalizedAssignments,
    diagnostics: {
      boardId: normalizedText(operationsBoard.id),
      boardName: normalizedText(operationsBoard.name) || 'operations',
      fetchedItems: (operationsBoard.items_page?.items ?? []).length,
      normalizedOperations: normalizedOperations.length,
      normalizedAssignments: normalizedAssignments.length,
      skipped: {
        missingOperationId,
        assignmentMissingEmail,
        assignmentUserNotIncluded,
        duplicateOperation,
        duplicateAssignment,
        facilityMissingClientFacilityLink,
        
        facilityResolvedUniqueClientFacilityLink,
        facilityAmbiguousClientFacilityLink,
        technicianAmbiguousCanonicalEmail,
        technicianCanonicalScheduleEmail,
        technicianCanonicalOperationsEmailFallback,
        technicianLegacyDropdownResolved,
        technicianLegacyFallbackPending,
        technicianUnlinked,
        openStateDerivedOpen,
        openStateDerivedClosed,
      },
      payloadSamples: {
        operationsClientRelation: sampleColumnPayload(
          operationsBoard.items_page?.items ?? [],
          mapping.columns.operations.clientRelation,
        ),
        clientsFacilitiesRelation: sampleColumnPayload(
          clientsBoard.items_page?.items ?? [],
          mapping.columns.clients.facilitiesRelation,
        ),
      },
    },
  }
}





export function normalizeScheduleEntriesFromBoard(input: {
  scheduleBoard: MondayBoard
  operations: RuntimeOperationSnapshotRow[]
  runtimeUsers: RuntimeUserSnapshotRow[]
  mapping: MondayMappingInventory
}): {
  scheduleEntries: RuntimeScheduleEntrySnapshotRow[]
  diagnostics: ScheduleNormalizationDiagnostics
} {
  const { scheduleBoard, operations, runtimeUsers, mapping } = input

  assertBoardHasColumns(scheduleBoard, 'schedule board', [
    mapping.columns.schedule.operationIdRef,
    mapping.columns.schedule.technicianEmailMirror,
    mapping.columns.schedule.technicianLegacyDropdown,
    mapping.columns.schedule.taskType,
    mapping.columns.schedule.plannedDate,
    mapping.columns.schedule.calendarEventRef,
    mapping.columns.schedule.scheduleStatus,
    mapping.columns.schedule.calendarSyncStatus,
    mapping.columns.schedule.scheduleControlStatus,
  ])

  const operationIds = new Set(operations.map((entry) => entry.id))
  const operationIdsByShort = new Map<string, string>()
  for (const row of operations) {
    const shortId = normalizedText(row.shortOperationId)
    if (!shortId) continue
    if (!operationIdsByShort.has(shortId)) {
      operationIdsByShort.set(shortId, row.id)
    } else {
      operationIdsByShort.set(shortId, '')
    }
  }

  const runtimeUserByDisplayName = new Map<string, string>()
  for (const row of runtimeUsers) {
    const display = normalizedText(row.displayName).toLowerCase()
    if (!display || runtimeUserByDisplayName.has(display)) continue
    runtimeUserByDisplayName.set(display, row.email)
  }

  const normalized: RuntimeScheduleEntrySnapshotRow[] = []

  let missingScheduleItemId = 0
  let missingOperationIdRef = 0
  let unresolvedOperationLink = 0
  let resolvedOperationLink = 0
  let technicianCanonicalEmail = 0
  let technicianLegacyResolved = 0
  let technicianUnresolved = 0
  let plannedDateTimeFromCalendar = 0
  let plannedDateTimeFromMondayDate = 0
  let plannedDateTimeMissing = 0

  for (const item of scheduleBoard.items_page?.items ?? []) {
    const scheduleItemId = normalizedText(item.id)
    if (!scheduleItemId) {
      missingScheduleItemId += 1
      continue
    }

    const operationIdRef = normalizedText(getColumnText(item, mapping.columns.schedule.operationIdRef))
    if (!operationIdRef) {
      missingOperationIdRef += 1
      continue
    }

    let operationId: string | null = null
    if (operationIds.has(operationIdRef)) {
      operationId = operationIdRef
    } else {
      const fromShortId = operationIdsByShort.get(operationIdRef)
      if (fromShortId && fromShortId.trim()) {
        operationId = fromShortId
      }
    }

    if (operationId) resolvedOperationLink += 1
    else unresolvedOperationLink += 1

    const canonicalTechnicianEmail = normalizedEmail(getColumnText(item, mapping.columns.schedule.technicianEmailMirror))
    const legacyTechnicianDropdownValue = normalizedText(getColumnText(item, mapping.columns.schedule.technicianLegacyDropdown)) || null
    const taskType = normalizedText(getColumnText(item, mapping.columns.schedule.taskType)) || null
    const plannedDateDerived = derivePlannedDateTime(item, mapping)
    const plannedDate = plannedDateDerived.plannedDate
    const plannedDateTime = plannedDateDerived.plannedDateTime
    const plannedDateTimeSource = plannedDateDerived.source
    const calendarEventRef = normalizedText(getColumnText(item, mapping.columns.schedule.calendarEventRef)) || null
    const scheduleStatus = normalizedText(getColumnText(item, mapping.columns.schedule.scheduleStatus)) || null
    const calendarSyncStatus = normalizedText(getColumnText(item, mapping.columns.schedule.calendarSyncStatus)) || null
    const controlStatus = normalizedText(getColumnText(item, mapping.columns.schedule.scheduleControlStatus)) || null

    if (plannedDateTimeSource === 'calendar') plannedDateTimeFromCalendar += 1
    else if (plannedDateTimeSource === 'monday_date') plannedDateTimeFromMondayDate += 1
    else plannedDateTimeMissing += 1

    let resolvedTechnicianEmail: string | null = null
    let technicianLinkageState: RuntimeScheduleEntrySnapshotRow['technicianLinkageState'] = 'unresolved'
    let technicianLinkageSource: RuntimeScheduleEntrySnapshotRow['technicianLinkageSource'] = 'unresolved'

    if (canonicalTechnicianEmail) {
      resolvedTechnicianEmail = canonicalTechnicianEmail
      technicianLinkageState = 'canonical_email'
      technicianLinkageSource = 'canonical_relation_email'
      technicianCanonicalEmail += 1
    } else if (legacyTechnicianDropdownValue) {
      const resolvedFromLegacy = runtimeUserByDisplayName.get(legacyTechnicianDropdownValue.toLowerCase()) ?? null
      if (resolvedFromLegacy) {
        resolvedTechnicianEmail = resolvedFromLegacy
        technicianLinkageState = 'legacy_dropdown_resolved'
        technicianLinkageSource = 'legacy_dropdown'
        technicianLegacyResolved += 1
      } else {
        technicianUnresolved += 1
      }
    } else {
      technicianUnresolved += 1
    }

    normalized.push({
      id: scheduleItemId,
      operationIdRef,
      operationId,
      taskType,
      canonicalTechnicianEmail: resolvedTechnicianEmail,
      legacyTechnicianDropdownValue,
      plannedDate,
      plannedDateTime,
      plannedDateTimeSource,
      calendarEventRef,
      scheduleStatus,
      calendarSyncStatus,
      controlStatus,
      technicianLinkageState,
      technicianLinkageSource,
      metadata: {
        mondayBoardId: scheduleBoard.id,
        mondayItemId: scheduleItemId,
        operationIdRef,
        unresolvedOperationLink: !operationId,
      },
    })
  }

  const dedupe = new Map<string, RuntimeScheduleEntrySnapshotRow>()
  let duplicateScheduleItem = 0
  for (const row of normalized) {
    if (dedupe.has(row.id)) duplicateScheduleItem += 1
    dedupe.set(row.id, row)
  }

  const scheduleEntries = Array.from(dedupe.values())

  return {
    scheduleEntries,
    diagnostics: {
      boardId: normalizedText(scheduleBoard.id),
      boardName: normalizedText(scheduleBoard.name) || 'schedule',
      fetchedItems: (scheduleBoard.items_page?.items ?? []).length,
      normalizedScheduleEntries: scheduleEntries.length,
      skipped: {
        missingScheduleItemId,
        missingOperationIdRef,
        unresolvedOperationLink,
        resolvedOperationLink,
        technicianCanonicalEmail,
        technicianLegacyResolved,
        technicianUnresolved,
        plannedDateTimeFromCalendar,
        plannedDateTimeFromMondayDate,
        plannedDateTimeMissing,
        duplicateScheduleItem,
      },
    },
  }
}






export function normalizeReportsFromBoard(input: {
  reportsBoard: MondayBoard
  operations: RuntimeOperationSnapshotRow[]
  scheduleEntries: RuntimeScheduleEntrySnapshotRow[]
  mapping: MondayMappingInventory
}): {
  reports: RuntimeReportSnapshotRow[]
  diagnostics: ReportsNormalizationDiagnostics
} {
  const { reportsBoard, operations, scheduleEntries, mapping } = input

  assertBoardHasColumns(reportsBoard, 'reports board', [
    mapping.columns.reports.operationIdRef,
    mapping.columns.reports.scheduleRelation,
    mapping.columns.reports.technicianEmailMirror,
    mapping.columns.reports.flowStatus,
    mapping.columns.reports.qaStatus,
    mapping.columns.reports.executedAt,
  ])

  const operationIds = new Set(operations.map((entry) => entry.id))
  const operationIdsByShort = new Map<string, string>()
  for (const row of operations) {
    const shortId = normalizedText(row.shortOperationId)
    if (!shortId) continue
    if (!operationIdsByShort.has(shortId)) operationIdsByShort.set(shortId, row.id)
    else operationIdsByShort.set(shortId, '')
  }

  const scheduleIds = new Set(scheduleEntries.map((entry) => entry.id))
  const reports: RuntimeReportSnapshotRow[] = []

  let missingReportId = 0
  let missingOperationIdRef = 0
  let unresolvedOperationLink = 0
  let resolvedOperationLink = 0
  let unresolvedScheduleLink = 0

  for (const item of reportsBoard.items_page?.items ?? []) {
    const reportId = normalizedText(item.id)
    if (!reportId) {
      missingReportId += 1
      continue
    }

    const operationIdRef = normalizedText(getColumnText(item, mapping.columns.reports.operationIdRef))
    if (!operationIdRef) {
      missingOperationIdRef += 1
      continue
    }

    let operationId: string | null = null
    if (operationIds.has(operationIdRef)) {
      operationId = operationIdRef
    } else {
      const fromShort = operationIdsByShort.get(operationIdRef)
      if (fromShort && fromShort.trim()) operationId = fromShort
    }
    if (operationId) resolvedOperationLink += 1
    else unresolvedOperationLink += 1

    const scheduleRefs = getColumnRelationIds(item, mapping.columns.reports.scheduleRelation)
    const scheduleEntryIdRef = scheduleRefs.length > 0 ? scheduleRefs[0] : null
    const scheduleEntryId = scheduleEntryIdRef && scheduleIds.has(scheduleEntryIdRef) ? scheduleEntryIdRef : null
    if (scheduleEntryIdRef && !scheduleEntryId) unresolvedScheduleLink += 1

    reports.push({
      id: reportId,
      operationIdRef,
      operationId,
      scheduleEntryIdRef,
      scheduleEntryId,
      technicianEmail: normalizedEmail(getColumnText(item, mapping.columns.reports.technicianEmailMirror)) || null,
      flowStatus: normalizedText(getColumnText(item, mapping.columns.reports.flowStatus)) || null,
      qaStatus: normalizedText(getColumnText(item, mapping.columns.reports.qaStatus)) || null,
      executedAt: normalizeExecutedAt(getColumnText(item, mapping.columns.reports.executedAt)),
      metadata: {
        mondayBoardId: reportsBoard.id,
        mondayItemId: reportId,
        operationIdRef,
      },
    })
  }

  const dedupe = new Map<string, RuntimeReportSnapshotRow>()
  let duplicateReportId = 0
  for (const row of reports) {
    if (dedupe.has(row.id)) duplicateReportId += 1
    dedupe.set(row.id, row)
  }

  const normalizedReports = Array.from(dedupe.values())

  return {
    reports: normalizedReports,
    diagnostics: {
      boardId: normalizedText(reportsBoard.id),
      boardName: normalizedText(reportsBoard.name) || 'reports',
      fetchedItems: (reportsBoard.items_page?.items ?? []).length,
      normalizedReports: normalizedReports.length,
      skipped: {
        missingReportId,
        missingOperationIdRef,
        unresolvedOperationLink,
        resolvedOperationLink,
        unresolvedScheduleLink,
        duplicateReportId,
      },
    },
  }
}




















