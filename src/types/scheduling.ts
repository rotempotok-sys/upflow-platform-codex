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
  assignedTechnicianEmail: string | null
  executionStatus: string | null
}

export interface RuntimeAssignmentSnapshot {
  operationId: string
  userEmail: string | null
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

