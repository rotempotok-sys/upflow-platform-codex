import { sanitizeRuntimeErrorMessage } from './security'

interface RuntimeClientRow {
  id: string
  name: string
  facility_type: string | null
  facility_status: string | null
  contract_type: string | null
  open_tickets: number | null
  city: string | null
  group_name: string | null
  facilities_relation_ids?: string[] | null
}

interface RuntimeFacilityRow extends RuntimeClientRow {
  client_id?: string | null
  raw_columns: unknown
}

interface RuntimeFacilityColumnValue {
  id: string
  title: string
  type: string
  text: string
  value: string | null
}

interface RuntimeUserRow {
  email: string
  display_name: string | null
  role: string | null
  approval: string | null
  employee_status: string | null
  can_team: boolean | null
  can_calendar: boolean | null
  can_clients: boolean | null
  can_equipment: boolean | null
  can_assistant: boolean | null
  can_ai_ask: boolean | null
}

interface RuntimeOperationRow {
  id: string
  short_operation_id: string | null
  title: string | null
  client_id: string | null
  facility_id: string | null
  assigned_technician_email: string | null
  business_status: string | null
  operation_group_status: string | null
  execution_status: string | null
  request_purpose_raw: string | null
  operation_category: string | null
  is_open: boolean | null
  operation_content: string | null
  metadata: Record<string, unknown> | null
}

interface RuntimeAssignmentRow {
  operation_id: string
  user_email: string | null
  technician_name: string | null
  role: string | null
}

interface RuntimeScheduleEntryRow {
  id: string
  operation_id_ref: string | null
  operation_id: string | null
  technician_email: string | null
  schedule_control_status: string | null
  calendar_sync_status: string | null
  calendar_event_id: string | null
  report_item_id_ref: string | null
  task_type: string | null
  planned_date: string | null
  planned_datetime: string | null
  metadata: Record<string, unknown> | null
}

interface RuntimeReportRow {
  id: string
  operation_id_ref: string | null
  operation_id: string | null
  schedule_entry_id_ref: string | null
  schedule_entry_id: string | null
  technician_email: string | null
  flow_status: string | null
  qa_status: string | null
  executed_at: string | null
  metadata: Record<string, unknown> | null
}

interface RuntimeExceptionRow {
  id: number
  code: string
  severity: string
  operation_id: string | null
  schedule_entry_id: string | null
  report_id: string | null
  technician_email: string | null
  message: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface RuntimeClientSnapshot {
  id: string
  name: string
  facilityType: string
  facilityStatus: string
  contractType: string
  openTickets: number
  city: string
  group: string
  facilitiesRelationIds: string[]
}

export interface RuntimeFacilitySnapshot extends RuntimeClientSnapshot {
  clientId: string | null
  columns: RuntimeFacilityColumnValue[]
}

export interface RuntimeUserSnapshot {
  email: string
  displayName: string
  role: string | null
  approval: string | null
  employeeStatus: string | null
  canTeam: boolean
  canCalendar: boolean
  canClients: boolean
  canEquipment: boolean
  canAssistant: boolean
  canAiAsk: boolean
}

export interface RuntimeOperationSnapshot {
  id: string
  shortOperationId: string | null
  title: string | null
  operationContent: string | null
  requestPurposeRaw: string | null
  operationCategory: string | null
  businessStatus: string | null
  operationStatus: string | null
  operationGroupStatus: string | null
  technicianNameHint: string | null
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
}

export interface RuntimeAssignmentSnapshot {
  operationId: string
  userEmail: string | null
  technicianName: string | null
  role: string | null
}

export interface RuntimeScheduleEntrySnapshot {
  id: string
  operationIdRef: string | null
  operationId: string | null
  technicianEmail: string | null
  taskType: string | null
  legacyTechnicianDropdownValue: string | null
  plannedDate: string | null
  plannedDateTime: string | null
  plannedDateTimeSource: 'calendar' | 'monday_date' | 'missing'
  calendarEventRef: string | null
  reportItemIdRef: string | null
  scheduleStatus: string | null
  calendarSyncStatus: string | null
  controlStatus: string | null
  technicianLinkageState: string | null
  technicianLinkageSource: 'canonical_relation_email' | 'legacy_dropdown' | 'unresolved' | null
}

export interface RuntimeReportSnapshot {
  id: string
  operationIdRef: string | null
  operationId: string | null
  scheduleEntryIdRef: string | null
  scheduleEntryId: string | null
  technicianEmail: string | null
  flowStatus: string | null
  qaStatus: string | null
  executedAt: string | null
}

export interface RuntimeExceptionSnapshot {
  id: number
  code: string
  severity: string
  operationId: string | null
  scheduleEntryId: string | null
  reportId: string | null
  technicianEmail: string | null
  message: string
  createdAt: string
  metadata: Record<string, unknown>
}

export interface RuntimeSnapshotData {
  clients: RuntimeClientSnapshot[]
  facilities: RuntimeFacilitySnapshot[]
  operations: RuntimeOperationSnapshot[]
  assignments: RuntimeAssignmentSnapshot[]
  scheduleEntries: RuntimeScheduleEntrySnapshot[]
  reports: RuntimeReportSnapshot[]
  exceptions: RuntimeExceptionSnapshot[]
  users: RuntimeUserSnapshot[]
  fetchedAt: string
}

export interface ProjectionEmptyState {
  isEmpty: boolean
  code: 'ok' | 'no_rows' | 'no_runtime_data' | 'missing_schedule_runtime'
  message: string
  missingInputs: string[]
}

export interface TechnicianProjectionRow {
  technicianEmail: string
  technicianName: string
  role: string | null
  counts: {
    openOperations: number
    closedOperations: number
    highPriorityOpenOperations: number
    unresolvedLinkageOpenOperations: number
  }
}

export interface FacilityProjectionRow {
  facilityId: string
  facilityName: string
  clientId: string | null
  clientName: string | null
  facilityStatus: string
  counts: {
    openOperations: number
    closedOperations: number
    highPriorityOpenOperations: number
    unassignedOpenOperations: number
  }
}

export interface OperationProjectionRow {
  operationId: string
  shortOperationId: string | null
  category: string | null
  businessStatus: string | null
  executionStatus: string | null
  isOpen: boolean
  technicianEmail: string | null
  technicianName: string | null
  clientId: string | null
  clientName: string | null
  facilityId: string | null
  facilityName: string | null
  linkage: {
    facility: RuntimeOperationSnapshot['facilityLinkageState']
    technician: RuntimeOperationSnapshot['technicianLinkageState']
  }
  flags: {
    needsTechnician: boolean
    needsFacilityResolution: boolean
    highPriority: boolean
  }
}

export interface DailyWeeklyControlSummaryProjection {
  generatedAt: string
  timeframe: {
    today: string
    weeklyWindowStart: string
    weeklyWindowEnd: string
  }
  counts: {
    totalOperations: number
    openOperations: number
    closedOperations: number
    unassignedOpenOperations: number
    pendingFacilityResolution: number
    ambiguousFacilityMapping: number
    techniciansWithOpenLoad: number
    facilitiesWithOpenOperations: number
    usersInRuntime: number
  }
  scheduleReadiness: {
    hasScheduleRuntimeData: boolean
    todayPlannedCount: number | null
    weekPlannedCount: number | null
  }
  emptyState: ProjectionEmptyState
}

export interface RuntimeOperationalProjections {
  source: 'supabase_runtime_projection'
  basedOn: {
    canonicalEntitySet: string[]
    task011RulesApplied: true
  }
  technicianView: {
    rows: TechnicianProjectionRow[]
    counts: {
      technicians: number
      openOperations: number
      highPriorityOpenOperations: number
    }
    emptyState: ProjectionEmptyState
  }
  facilityView: {
    rows: FacilityProjectionRow[]
    counts: {
      facilities: number
      facilitiesWithOpenOperations: number
      openOperations: number
      unassignedOpenOperations: number
    }
    emptyState: ProjectionEmptyState
  }
  operationView: {
    rows: OperationProjectionRow[]
    counts: {
      operations: number
      openOperations: number
      unresolvedTechnician: number
      unresolvedFacility: number
    }
    emptyState: ProjectionEmptyState
  }
  dailyWeeklyControl: DailyWeeklyControlSummaryProjection
}

function normalizeColumns(raw: unknown): RuntimeFacilityColumnValue[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const obj = entry as Record<string, unknown>
      return {
        id: String(obj.id ?? '').trim(),
        title: String(obj.title ?? '').trim(),
        type: String(obj.type ?? '').trim(),
        text: String(obj.text ?? '').trim(),
        value: obj.value == null ? null : String(obj.value),
      }
    })
    .filter((entry): entry is RuntimeFacilityColumnValue => Boolean(entry && entry.id))
}

function mapClient(row: RuntimeClientRow): RuntimeClientSnapshot {
  return {
    id: String(row.id),
    name: String(row.name ?? '').trim(),
    facilityType: String(row.facility_type ?? '').trim() || 'לא הוגדר',
    facilityStatus: String(row.facility_status ?? '').trim() || 'לא הוגדר',
    contractType: String(row.contract_type ?? '').trim() || 'לא הוגדר',
    openTickets: Number.isFinite(Number(row.open_tickets ?? 0)) ? Number(row.open_tickets ?? 0) : 0,
    city: String(row.city ?? '').trim(),
    group: String(row.group_name ?? '').trim() || '??? ?????',
    facilitiesRelationIds: Array.isArray(row.facilities_relation_ids)
      ? row.facilities_relation_ids.map((entry) => String(entry ?? '').trim()).filter((entry) => Boolean(entry))
      : [],
  }
}

function mapOperation(row: RuntimeOperationRow): RuntimeOperationSnapshot {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>

  // Prefer canonical columns; fall back to metadata for backward compatibility with older sync runs
  const requestPurposeRaw = String(row.request_purpose_raw ?? metadata.requestPurposeRaw ?? '').trim() || null
  const operationCategory = String(row.operation_category ?? metadata.operationCategory ?? '').trim() || null
  const isOpen = row.is_open != null ? row.is_open : Boolean(metadata.isOpen === true)

  return {
    id: String(row.id ?? '').trim(),
    shortOperationId: String(row.short_operation_id ?? '').trim() || null,
    title: String(row.title ?? '').trim() || null,
    operationContent: String(row.operation_content ?? '').trim() || null,
    requestPurposeRaw,
    operationCategory,
    businessStatus: String(row.business_status ?? metadata.businessStatus ?? '').trim() || null,
    operationStatus: String(row.business_status ?? metadata.operationStatus ?? metadata.businessStatus ?? '').trim() || null,
    operationGroupStatus: String(row.operation_group_status ?? metadata.operationGroupStatus ?? '').trim() || null,
    technicianNameHint: String(metadata.performerDisplay ?? '').trim() || null,
    isOpen,
    clientItemId: String(row.client_id ?? metadata.clientItemId ?? '').trim() || null,
    facilityItemId: String(row.facility_id ?? metadata.facilityItemId ?? '').trim() || null,
    facilityLinkageState:
      (String(metadata.facilityLinkageState ?? '').trim() as
        | 'resolved_unique_client_facility_link'
        | 'ambiguous_client_facility_link'
        | 'missing_client_facility_link') || 'missing_client_facility_link',
    technicianLinkageState:
      (String(metadata.technicianLinkageState ?? '').trim() as
        | 'canonical_schedule_email'
        | 'canonical_operations_email_fallback'
        | 'legacy_schedule_dropdown_resolved'
        | 'legacy_schedule_dropdown_fallback_pending'
        | 'unlinked') || 'unlinked',
    assignedTechnicianEmail:
      String(row.assigned_technician_email ?? '')
        .trim()
        .toLowerCase() || null,
    executionStatus: String(row.execution_status ?? '').trim() || null,
  }
}

function mapAssignment(row: RuntimeAssignmentRow): RuntimeAssignmentSnapshot {
  return {
    operationId: String(row.operation_id ?? '').trim(),
    userEmail:
      String(row.user_email ?? '')
        .trim()
        .toLowerCase() || null,
    technicianName: String(row.technician_name ?? '').trim() || null,
    role: String(row.role ?? '').trim() || null,
  }
}

function mapScheduleEntry(row: RuntimeScheduleEntryRow): RuntimeScheduleEntrySnapshot {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>

  // Prefer canonical columns; fall back to metadata for backward compatibility with older sync runs
  const taskType = String(row.task_type ?? metadata.taskType ?? '').trim() || null
  const plannedDate = String(row.planned_date ?? metadata.plannedDate ?? '').trim() || null
  const plannedDateTime = String(row.planned_datetime ?? metadata.plannedDateTime ?? '').trim() || null

  return {
    id: String(row.id ?? '').trim(),
    operationIdRef: String(row.operation_id_ref ?? '').trim() || null,
    operationId: String(row.operation_id ?? '').trim() || null,
    technicianEmail: String(row.technician_email ?? '').trim().toLowerCase() || null,
    taskType,
    legacyTechnicianDropdownValue: String(metadata.legacyTechnicianDropdownValue ?? '').trim() || null,
    plannedDate,
    plannedDateTime,
    plannedDateTimeSource:
      (String(metadata.plannedDateTimeSource ?? '').trim() as 'calendar' | 'monday_date' | 'missing') || 'missing',
    calendarEventRef: String(row.calendar_event_id ?? '').trim() || null,
    reportItemIdRef: String(row.report_item_id_ref ?? '').trim() || null,
    scheduleStatus: String(metadata.scheduleStatus ?? '').trim() || null,
    calendarSyncStatus: String(row.calendar_sync_status ?? '').trim() || null,
    controlStatus: String(row.schedule_control_status ?? '').trim() || null,
    technicianLinkageState: String(metadata.technicianLinkageState ?? '').trim() || null,
    technicianLinkageSource:
      (String(metadata.technicianLinkageSource ?? '').trim() as 'canonical_relation_email' | 'legacy_dropdown' | 'unresolved') ||
      null,
  }
}


function mapReport(row: RuntimeReportRow): RuntimeReportSnapshot {
  return {
    id: String(row.id ?? '').trim(),
    operationIdRef: String(row.operation_id_ref ?? '').trim() || null,
    operationId: String(row.operation_id ?? '').trim() || null,
    scheduleEntryIdRef: String(row.schedule_entry_id_ref ?? '').trim() || null,
    scheduleEntryId: String(row.schedule_entry_id ?? '').trim() || null,
    technicianEmail: String(row.technician_email ?? '').trim().toLowerCase() || null,
    flowStatus: String(row.flow_status ?? '').trim() || null,
    qaStatus: String(row.qa_status ?? '').trim() || null,
    executedAt: String(row.executed_at ?? '').trim() || null,
  }
}

function mapException(row: RuntimeExceptionRow): RuntimeExceptionSnapshot {
  return {
    id: Number(row.id),
    code: String(row.code ?? '').trim(),
    severity: String(row.severity ?? '').trim(),
    operationId: String(row.operation_id ?? '').trim() || null,
    scheduleEntryId: String(row.schedule_entry_id ?? '').trim() || null,
    reportId: String(row.report_id ?? '').trim() || null,
    technicianEmail: String(row.technician_email ?? '').trim().toLowerCase() || null,
    message: String(row.message ?? '').trim(),
    createdAt: String(row.created_at ?? '').trim(),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  }
}function mapUser(row: RuntimeUserRow): RuntimeUserSnapshot {
  const email = String(row.email ?? '')
    .trim()
    .toLowerCase()

  return {
    email,
    displayName: String(row.display_name ?? '').trim() || email,
    role: String(row.role ?? '').trim() || null,
    approval: String(row.approval ?? '').trim() || null,
    employeeStatus: String(row.employee_status ?? '').trim() || null,
    canTeam: row.can_team === true,
    canCalendar: row.can_calendar === true,
    canClients: row.can_clients === true,
    canEquipment: row.can_equipment === true,
    canAssistant: row.can_assistant === true,
    canAiAsk: row.can_ai_ask === true,
  }
}

function isHighPriorityOperation(operation: RuntimeOperationSnapshot): boolean {
  const text = `${operation.businessStatus ?? ''} ${operation.executionStatus ?? ''} ${operation.requestPurposeRaw ?? ''}`.toLowerCase()
  return ['דחוף', 'חירום', 'urgent', 'exception', 'error', 'תקלה'].some((marker) => text.includes(marker))
}

function createEmptyState(input: {
  hasRows: boolean
  hasRuntimeData: boolean
  scheduleDataAvailable: boolean
  message: string
  missingInputs?: string[]
}): ProjectionEmptyState {
  if (!input.hasRuntimeData) {
    return {
      isEmpty: true,
      code: 'no_runtime_data',
      message: 'Runtime snapshot has no rows yet.',
      missingInputs: ['operations', 'users', 'facilities'],
    }
  }

  if (!input.hasRows) {
    return {
      isEmpty: true,
      code: 'no_rows',
      message: input.message,
      missingInputs: input.missingInputs ?? [],
    }
  }

  if (!input.scheduleDataAvailable) {
    return {
      isEmpty: false,
      code: 'missing_schedule_runtime',
      message: 'Schedule runtime entities are not populated yet; date-window counts are unavailable.',
      missingInputs: ['schedule_entries'],
    }
  }

  return {
    isEmpty: false,
    code: 'ok',
    message: 'Projection populated.',
    missingInputs: [],
  }
}

export function buildRuntimeOperationalProjections(snapshot: RuntimeSnapshotData): RuntimeOperationalProjections {
  const now = new Date()
  const todayIso = now.toISOString().slice(0, 10)
  const weeklyStart = new Date(now)
  const day = weeklyStart.getUTCDay()
  const offset = day === 0 ? -6 : 1 - day
  weeklyStart.setUTCDate(weeklyStart.getUTCDate() + offset)
  const weeklyEnd = new Date(weeklyStart)
  weeklyEnd.setUTCDate(weeklyStart.getUTCDate() + 6)

  const usersByEmail = new Map(snapshot.users.map((entry) => [entry.email.toLowerCase(), entry]))
  const clientsById = new Map(snapshot.clients.map((entry) => [entry.id, entry]))
  const facilitiesById = new Map(snapshot.facilities.map((entry) => [entry.id, entry]))
  const assignmentsByOperation = new Map<string, RuntimeAssignmentSnapshot[]>()
  for (const assignment of snapshot.assignments) {
    const current = assignmentsByOperation.get(assignment.operationId) ?? []
    current.push(assignment)
    assignmentsByOperation.set(assignment.operationId, current)
  }

  const technicianRollup = new Map<string, TechnicianProjectionRow>()
  for (const operation of snapshot.operations) {
    const assignmentEmail = (assignmentsByOperation.get(operation.id) ?? [])
      .map((entry) => String(entry.userEmail ?? '').trim().toLowerCase())
      .find((email) => Boolean(email))
    const email = String(operation.assignedTechnicianEmail ?? assignmentEmail ?? '').trim().toLowerCase()
    if (!email) continue

    const user = usersByEmail.get(email)
    const existing = technicianRollup.get(email) ?? {
      technicianEmail: email,
      technicianName: user?.displayName ?? email,
      role: user?.role ?? null,
      counts: {
        openOperations: 0,
        closedOperations: 0,
        highPriorityOpenOperations: 0,
        unresolvedLinkageOpenOperations: 0,
      },
    }

    if (operation.isOpen) {
      existing.counts.openOperations += 1
      if (isHighPriorityOperation(operation)) existing.counts.highPriorityOpenOperations += 1
      if (operation.technicianLinkageState === 'legacy_schedule_dropdown_fallback_pending' || operation.technicianLinkageState === 'unlinked') {
        existing.counts.unresolvedLinkageOpenOperations += 1
      }
    } else {
      existing.counts.closedOperations += 1
    }

    technicianRollup.set(email, existing)
  }

  const technicianRows = Array.from(technicianRollup.values()).sort(
    (a, b) => b.counts.openOperations - a.counts.openOperations || a.technicianName.localeCompare(b.technicianName, 'he'),
  )

  const facilityRollup = new Map<string, FacilityProjectionRow>()
  for (const facility of snapshot.facilities) {
    const client = facility.clientId ? clientsById.get(facility.clientId) : null
    facilityRollup.set(facility.id, {
      facilityId: facility.id,
      facilityName: facility.name,
      clientId: facility.clientId,
      clientName: client?.name ?? null,
      facilityStatus: facility.facilityStatus,
      counts: {
        openOperations: 0,
        closedOperations: 0,
        highPriorityOpenOperations: 0,
        unassignedOpenOperations: 0,
      },
    })
  }

  for (const operation of snapshot.operations) {
    if (!operation.facilityItemId) continue
    const row = facilityRollup.get(operation.facilityItemId)
    if (!row) continue

    if (operation.isOpen) {
      row.counts.openOperations += 1
      if (isHighPriorityOperation(operation)) row.counts.highPriorityOpenOperations += 1
      if (!operation.assignedTechnicianEmail) row.counts.unassignedOpenOperations += 1
    } else {
      row.counts.closedOperations += 1
    }
  }

  const facilityRows = Array.from(facilityRollup.values()).sort(
    (a, b) => b.counts.openOperations - a.counts.openOperations || a.facilityName.localeCompare(b.facilityName, 'he'),
  )

  const operationRows: OperationProjectionRow[] = snapshot.operations
    .map((operation) => {
      const client = operation.clientItemId ? clientsById.get(operation.clientItemId) : null
      const facility = operation.facilityItemId ? facilitiesById.get(operation.facilityItemId) : null
      const technicianEmail = String(operation.assignedTechnicianEmail ?? '').trim().toLowerCase() || null
      const technicianName = technicianEmail ? usersByEmail.get(technicianEmail)?.displayName ?? technicianEmail : null

      return {
        operationId: operation.id,
        shortOperationId: operation.shortOperationId,
        category: operation.operationCategory,
        businessStatus: operation.businessStatus,
        executionStatus: operation.executionStatus,
        isOpen: operation.isOpen,
        technicianEmail,
        technicianName,
        clientId: operation.clientItemId,
        clientName: client?.name ?? null,
        facilityId: operation.facilityItemId,
        facilityName: facility?.name ?? null,
        linkage: {
          facility: operation.facilityLinkageState,
          technician: operation.technicianLinkageState,
        },
        flags: {
          needsTechnician: operation.isOpen && !technicianEmail,
          needsFacilityResolution: operation.isOpen && operation.facilityLinkageState !== 'resolved_unique_client_facility_link',
          highPriority: operation.isOpen && isHighPriorityOperation(operation),
        },
      }
    })
    .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || a.operationId.localeCompare(b.operationId, 'en'))

  const openOperations = operationRows.filter((row) => row.isOpen)
  const unassignedOpenOperations = openOperations.filter((row) => row.flags.needsTechnician).length
  const pendingFacilityResolution = openOperations.filter((row) => row.linkage.facility === 'missing_client_facility_link').length
  const ambiguousFacilityMapping = openOperations.filter((row) => row.linkage.facility === 'ambiguous_client_facility_link').length

  const hasRuntimeRows = snapshot.operations.length + snapshot.users.length + snapshot.facilities.length > 0
  const scheduleDataAvailable = snapshot.scheduleEntries.length > 0

  let todayPlannedCount: number | null = null
  let weekPlannedCount: number | null = null
  if (scheduleDataAvailable) {
    todayPlannedCount = 0
    weekPlannedCount = 0
    const today = todayIso
    const weekStart = weeklyStart.toISOString().slice(0, 10)
    const weekEnd = weeklyEnd.toISOString().slice(0, 10)
    for (const entry of snapshot.scheduleEntries) {
      const plannedBase = String(entry.plannedDateTime ?? entry.plannedDate ?? '').trim()
      const planned = plannedBase.slice(0, 10)
      if (!planned) continue
      if (planned === today) todayPlannedCount += 1
      if (planned >= weekStart && planned <= weekEnd) weekPlannedCount += 1
    }
  }

  return {
    source: 'supabase_runtime_projection',
    basedOn: {
      canonicalEntitySet: ['users', 'operations', 'assignments', 'clients', 'facilities'],
      task011RulesApplied: true,
    },
    technicianView: {
      rows: technicianRows,
      counts: {
        technicians: technicianRows.length,
        openOperations: technicianRows.reduce((sum, row) => sum + row.counts.openOperations, 0),
        highPriorityOpenOperations: technicianRows.reduce((sum, row) => sum + row.counts.highPriorityOpenOperations, 0),
      },
      emptyState: createEmptyState({
        hasRows: technicianRows.length > 0,
        hasRuntimeData: hasRuntimeRows,
        scheduleDataAvailable,
        message: 'No technician projection rows after current scope filtering.',
        missingInputs: ['operations.assignedTechnicianEmail', 'assignments.userEmail'],
      }),
    },
    facilityView: {
      rows: facilityRows,
      counts: {
        facilities: facilityRows.length,
        facilitiesWithOpenOperations: facilityRows.filter((row) => row.counts.openOperations > 0).length,
        openOperations: facilityRows.reduce((sum, row) => sum + row.counts.openOperations, 0),
        unassignedOpenOperations: facilityRows.reduce((sum, row) => sum + row.counts.unassignedOpenOperations, 0),
      },
      emptyState: createEmptyState({
        hasRows: facilityRows.length > 0,
        hasRuntimeData: hasRuntimeRows,
        scheduleDataAvailable,
        message: 'No facility projection rows after current scope filtering.',
        missingInputs: ['facilities', 'operations.facilityItemId'],
      }),
    },
    operationView: {
      rows: operationRows,
      counts: {
        operations: operationRows.length,
        openOperations: openOperations.length,
        unresolvedTechnician: openOperations.filter((row) => row.flags.needsTechnician).length,
        unresolvedFacility: openOperations.filter((row) => row.flags.needsFacilityResolution).length,
      },
      emptyState: createEmptyState({
        hasRows: operationRows.length > 0,
        hasRuntimeData: hasRuntimeRows,
        scheduleDataAvailable,
        message: 'No operation projection rows after current scope filtering.',
        missingInputs: ['operations'],
      }),
    },
    dailyWeeklyControl: {
      generatedAt: now.toISOString(),
      timeframe: {
        today: todayIso,
        weeklyWindowStart: weeklyStart.toISOString().slice(0, 10),
        weeklyWindowEnd: weeklyEnd.toISOString().slice(0, 10),
      },
      counts: {
        totalOperations: operationRows.length,
        openOperations: openOperations.length,
        closedOperations: operationRows.length - openOperations.length,
        unassignedOpenOperations,
        pendingFacilityResolution,
        ambiguousFacilityMapping,
        techniciansWithOpenLoad: technicianRows.filter((row) => row.counts.openOperations > 0).length,
        facilitiesWithOpenOperations: facilityRows.filter((row) => row.counts.openOperations > 0).length,
        usersInRuntime: snapshot.users.length,
      },
      scheduleReadiness: {
        hasScheduleRuntimeData: scheduleDataAvailable,
        todayPlannedCount,
        weekPlannedCount,
      },
      emptyState: createEmptyState({
        hasRows: operationRows.length > 0,
        hasRuntimeData: hasRuntimeRows,
        scheduleDataAvailable,
        message: 'No operational rows available for control summary.',
        missingInputs: ['operations'],
      }),
    },
  }
}

export async function readRuntimeClientsAndFacilities(client: any, knownSecrets: string[] = []): Promise<RuntimeSnapshotData> {
  const clientsResult = await client
    .from('clients')
    .select('id,name,facility_type,facility_status,contract_type,open_tickets,city,group_name,facilities_relation_ids')
    .order('name', { ascending: true })

  if (clientsResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(clientsResult.error.message, knownSecrets)}`)
  }

  const facilitiesResult = await client
    .from('facilities')
    .select('id,client_id,name,facility_type,facility_status,contract_type,open_tickets,city,group_name,raw_columns')
    .order('name', { ascending: true })

  if (facilitiesResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(facilitiesResult.error.message, knownSecrets)}`)
  }

  const operationsResult = await client
    .from('operations')
    .select('id,short_operation_id,title,operation_content,client_id,facility_id,assigned_technician_email,business_status,operation_group_status,execution_status,request_purpose_raw,operation_category,is_open,metadata')
    .order('id', { ascending: true })

  if (operationsResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(operationsResult.error.message, knownSecrets)}`)
  }

  const assignmentsResult = await client
    .from('assignments')
    .select('operation_id,user_email,technician_name,role')
    .order('operation_id', { ascending: true })

  const scheduleEntriesResult = await client
    .from('schedule_entries')
    .select('id,operation_id_ref,operation_id,technician_email,schedule_control_status,calendar_sync_status,calendar_event_id,report_item_id_ref,task_type,planned_date,planned_datetime,metadata')
    .order('id', { ascending: true })

  if (scheduleEntriesResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(scheduleEntriesResult.error.message, knownSecrets)}`)
  }

  if (assignmentsResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(assignmentsResult.error.message, knownSecrets)}`)
  }


  const reportsResult = await client
    .from('reports')
    .select('id,operation_id_ref,operation_id,schedule_entry_id_ref,schedule_entry_id,technician_email,flow_status,qa_status,executed_at,metadata')
    .order('id', { ascending: true })

  const exceptionsResult = await client
    .from('exceptions')
    .select('id,code,severity,operation_id,schedule_entry_id,report_id,technician_email,message,metadata,created_at')
    .order('created_at', { ascending: false })

  const usersResult = await client.from('users').select('email,display_name,role,approval,employee_status,can_team,can_calendar,can_clients,can_equipment,can_assistant,can_ai_ask').order('email', { ascending: true })

  if (reportsResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(reportsResult.error.message, knownSecrets)}`)
  }

  if (exceptionsResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(exceptionsResult.error.message, knownSecrets)}`)
  }

  if (usersResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(usersResult.error.message, knownSecrets)}`)
  }

  const syncResult = await client
    .from('sync_runs')
    .select('finished_at')
    .eq('source', 'monday_snapshot')
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(1)

  if (syncResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(syncResult.error.message, knownSecrets)}`)
  }

  const clients = ((clientsResult.data ?? []) as RuntimeClientRow[]).map(mapClient)
  const facilities = ((facilitiesResult.data ?? []) as RuntimeFacilityRow[]).map((row) => ({
    ...mapClient(row),
    clientId: String(row.client_id ?? '').trim() || null,
    columns: normalizeColumns(row.raw_columns),
  }))

  const operations = ((operationsResult.data ?? []) as RuntimeOperationRow[]).map(mapOperation).filter((row) => row.id)
  const assignments = ((assignmentsResult.data ?? []) as RuntimeAssignmentRow[]).map(mapAssignment).filter((row) => row.operationId)
  const scheduleEntries = ((scheduleEntriesResult.data ?? []) as RuntimeScheduleEntryRow[]).map(mapScheduleEntry).filter((row) => row.id)
  const reports = ((reportsResult.data ?? []) as RuntimeReportRow[]).map(mapReport).filter((row) => row.id)
  const exceptions = ((exceptionsResult.data ?? []) as RuntimeExceptionRow[]).map(mapException).filter((row) => row.code)
  const users = ((usersResult.data ?? []) as RuntimeUserRow[]).map(mapUser).filter((row) => row.email)

  const latestFinishedAt = syncResult.data?.[0]?.finished_at

  return {
    clients,
    facilities,
    operations,
    assignments,
    scheduleEntries,
    reports,
    exceptions,
    users,
    fetchedAt: typeof latestFinishedAt === 'string' && latestFinishedAt.trim() ? latestFinishedAt : new Date().toISOString(),
  }
}

export async function readLatestRuntimeSyncRun(client: any, knownSecrets: string[] = []) {
  const latest = await client
    .from('sync_runs')
    .select('id,source,status,started_at,finished_at,rows_upserted,metadata')
    .eq('source', 'monday_snapshot')
    .order('started_at', { ascending: false })
    .limit(1)

  if (latest.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(latest.error.message, knownSecrets)}`)
  }

  const row = latest.data?.[0] ?? null
  return {
    latest: row,
    checkedAt: new Date().toISOString(),
  }
}







