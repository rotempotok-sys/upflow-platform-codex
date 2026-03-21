export type Priority = 'P1' | 'P2' | 'P3'

export interface Technician {
  id: string
  name: string
  role: string
  color: string
}

export interface PendingTask {
  id: string
  technicianId: string
  title: string
  mondayId: string
  priority: Priority
}

export interface Client {
  id: string
  name: string
  facilityType: string
  facilityStatus: string
  contractType: string
  openTickets: number
  city: string
  group: string
  facilitiesRelationIds?: string[]
}

export interface FacilityColumnValue {
  id: string
  title: string
  type: string
  text: string
  value: string | null
}

export interface FacilityRecord extends Client {
  columns: FacilityColumnValue[]
}

export interface RuntimeOperationSnapshot {
  id: string
  shortOperationId: string | null
  title: string | null
  operationContent: string | null
  requestPurposeRaw: string | null
  operationCategory: string | null
  businessStatus: string | null
  salesStatus: string | null
  procurementStatus: string | null
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

export interface RuntimeUserSnapshot {
  email: string
  displayName: string
  role: string | null
  approval: string | null
}


// Task 001 contracts for operation/schedule/report/exception flows.
// These contracts are additive and do not change existing UI behavior.

export type PlatformRole = 'Admin' | 'Operations' | 'Technician' | 'Viewer'

export interface UserVisibilityScope {
  role: PlatformRole
  email: string
  scopedRole: boolean
  scopeConfigured: boolean
  clientIds: string[]
  facilityIds: string[]
}

export type OperationExecutionStatus =
  | 'Needs Assignment'
  | 'Needs Scheduling'
  | 'Scheduled'
  | 'Executed'
  | 'Waiting for Report'
  | 'Under Review'
  | 'Closed'
  | 'Exception'

export type ScheduleControlStatus =
  | 'Needs Technician'
  | 'Needs Calendar Event'
  | 'Scheduled'
  | 'Executed'
  | 'Waiting for Report'
  | 'Linked to Report'
  | 'Exception'

export type CalendarSyncStatus = 'Not Created' | 'Created' | 'Updated' | 'Error' | 'Missing Link'

export type ExceptionSeverity = 'low' | 'medium' | 'high' | 'critical'

export type ExceptionCode =
  | 'MISSING_TECHNICIAN'
  | 'MISSING_SCHEDULE'
  | 'MISSING_CALENDAR_LINK'
  | 'MISSING_REPORT'
  | 'MISSING_OPERATION_ID'
  | 'MISSING_REPORT_TECHNICIAN_EMAIL'
  | 'IDENTITY_MISMATCH'
  | 'STATE_MISMATCH'

export interface OperationLinkRefs {
  operationBoardItemId: string
  shortOperationId: string
  scheduleBoardItemId: string | null
  reportBoardItemId: string | null
  calendarEventId: string | null
}

export interface OperationRecord {
  operationItemId: string
  shortOperationId: string
  assignedTechnicianEmail: string | null
  executionStatus: OperationExecutionStatus
  links: {
    hasSchedule: boolean
    hasCalendarEvent: boolean
    hasReport: boolean
  }
}

export interface ScheduleEntryRecord {
  scheduleItemId: string
  operationIdRef: string | null
  technicianEmail: string | null
  scheduleControlStatus: ScheduleControlStatus | null
  calendarSyncStatus: CalendarSyncStatus | null
  calendarEventId: string | null
  reportItemId: string | null
}

export interface ReportRecord {
  reportItemId: string
  operationIdRef: string | null
  scheduleItemIdRef: string | null
  technicianEmail: string | null
  flowStatus: string | null
  qaStatus: string | null
  executedAt: string | null
}

export interface OperationalException {
  code: ExceptionCode
  severity: ExceptionSeverity
  operationItemId: string | null
  scheduleItemId: string | null
  reportItemId: string | null
  technicianEmail: string | null
  message: string
}

export interface OperationsSnapshot {
  fetchedAt: string
  visibility: UserVisibilityScope
  operations: OperationRecord[]
  schedules: ScheduleEntryRecord[]
  reports: ReportRecord[]
  exceptions: OperationalException[]
}

export interface OperationsSnapshotError {
  code:
    | 'AUTH_PERMISSION_DENIED'
    | 'AUTH_SCOPE_CONFIG_MISSING'
    | 'MAPPING_CONFIG_MISSING'
    | 'MAPPING_CONFIG_AMBIGUOUS'
    | 'UPSTREAM_FETCH_FAILED'
    | 'NORMALIZATION_FAILED'
  message: string
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

export type RuntimeExceptionCode =
  | 'MISSING_TECHNICIAN'
  | 'MISSING_SCHEDULE'
  | 'MISSING_CALENDAR_LINK'
  | 'MISSING_REPORT'
  | 'OVERDUE_EXECUTION'
  | 'AMBIGUOUS_FACILITY_MAPPING'
  | 'ORPHAN_SCHEDULE_ENTRY'
  | 'ORPHAN_REPORT'
  | 'REPEAT_FIELD_VISIT'

export interface RuntimeExceptionSnapshot {
  id: number
  code: RuntimeExceptionCode | string
  severity: 'critical' | 'high' | 'medium' | 'low' | string
  operationId: string | null
  scheduleEntryId: string | null
  reportId: string | null
  technicianEmail: string | null
  message: string
  createdAt: string
  metadata: Record<string, unknown>
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







