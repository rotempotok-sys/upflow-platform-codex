import type {
  RuntimeOperationSnapshotRow,
  RuntimeReportSnapshotRow,
  RuntimeScheduleEntrySnapshotRow,
} from './mondayRuntimeNormalize'

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

export type RuntimeExceptionSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface RuntimeExceptionSnapshotRow {
  code: RuntimeExceptionCode
  severity: RuntimeExceptionSeverity
  operationId: string | null
  scheduleEntryId: string | null
  reportId: string | null
  technicianEmail: string | null
  message: string
  metadata: Record<string, unknown>
}

export interface RuntimeExceptionDiagnostics {
  generated: number
  byCode: Record<RuntimeExceptionCode, number>
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function isOpenOperation(operation: RuntimeOperationSnapshotRow): boolean {
  return operation.isOpen === true
}

function isCompletedStatus(value: string | null): boolean {
  const text = normalizeText(value).toLowerCase()
  if (!text) return false
  return ['בוצע', 'הושלם', 'סגור', 'done', 'completed', 'closed'].some((keyword) => text.includes(keyword))
}

function dateToIsoDay(value: string | null): string {
  return normalizeText(value).slice(0, 10)
}

function operationRequiresSchedule(operation: RuntimeOperationSnapshotRow): boolean {
  const category = normalizeText(operation.operationCategory)
  return ['Service', 'Repair', 'Project', 'Logistics'].includes(category)
}

function operationRequiresReport(operation: RuntimeOperationSnapshotRow): boolean {
  const category = normalizeText(operation.operationCategory)
  return ['Service', 'Repair'].includes(category)
}

function createDiagnostics(rows: RuntimeExceptionSnapshotRow[]): RuntimeExceptionDiagnostics {
  const byCode: Record<RuntimeExceptionCode, number> = {
    MISSING_TECHNICIAN: 0,
    MISSING_SCHEDULE: 0,
    MISSING_CALENDAR_LINK: 0,
    MISSING_REPORT: 0,
    OVERDUE_EXECUTION: 0,
    AMBIGUOUS_FACILITY_MAPPING: 0,
    ORPHAN_SCHEDULE_ENTRY: 0,
    ORPHAN_REPORT: 0,
    REPEAT_FIELD_VISIT: 0,
  }

  for (const row of rows) {
    byCode[row.code] += 1
  }

  return {
    generated: rows.length,
    byCode,
  }
}

export function computeCanonicalRuntimeExceptions(input: {
  operations: RuntimeOperationSnapshotRow[]
  scheduleEntries: RuntimeScheduleEntrySnapshotRow[]
  reports: RuntimeReportSnapshotRow[]
  now?: Date
}): {
  exceptions: RuntimeExceptionSnapshotRow[]
  diagnostics: RuntimeExceptionDiagnostics
} {
  const now = input.now ?? new Date()
  const today = now.toISOString().slice(0, 10)

  const schedulesByOperation = new Map<string, RuntimeScheduleEntrySnapshotRow[]>()
  for (const schedule of input.scheduleEntries) {
    const operationId = normalizeText(schedule.operationId)
    if (!operationId) continue
    const current = schedulesByOperation.get(operationId) ?? []
    current.push(schedule)
    schedulesByOperation.set(operationId, current)
  }

  const reportsByOperation = new Map<string, RuntimeReportSnapshotRow[]>()
  const reportsBySchedule = new Map<string, RuntimeReportSnapshotRow[]>()
  for (const report of input.reports) {
    const operationId = normalizeText(report.operationId)
    if (operationId) {
      const current = reportsByOperation.get(operationId) ?? []
      current.push(report)
      reportsByOperation.set(operationId, current)
    }

    const scheduleId = normalizeText(report.scheduleEntryId)
    if (scheduleId) {
      const current = reportsBySchedule.get(scheduleId) ?? []
      current.push(report)
      reportsBySchedule.set(scheduleId, current)
    }
  }

  const exceptions: RuntimeExceptionSnapshotRow[] = []
  const dedupe = new Set<string>()

  const pushException = (row: RuntimeExceptionSnapshotRow) => {
    const key = [row.code, row.operationId ?? '', row.scheduleEntryId ?? '', row.reportId ?? '', row.technicianEmail ?? ''].join('::')
    if (dedupe.has(key)) return
    dedupe.add(key)
    exceptions.push(row)
  }

  for (const operation of input.operations) {
    if (!isOpenOperation(operation)) continue

    const operationId = operation.id
    const linkedSchedules = schedulesByOperation.get(operationId) ?? []

    if (operation.facilityLinkageState === 'ambiguous_client_facility_link') {
      pushException({
        code: 'AMBIGUOUS_FACILITY_MAPPING',
        severity: 'high',
        operationId,
        scheduleEntryId: null,
        reportId: null,
        technicianEmail: operation.assignedTechnicianEmail,
        message: 'Operation has ambiguous facility mapping for linked client.',
        metadata: {
          facilityLinkageState: operation.facilityLinkageState,
        },
      })
    }

    if (operationRequiresSchedule(operation) && linkedSchedules.length === 0) {
      pushException({
        code: 'MISSING_SCHEDULE',
        severity: 'high',
        operationId,
        scheduleEntryId: null,
        reportId: null,
        technicianEmail: operation.assignedTechnicianEmail,
        message: 'Open operation requires schedule but has no linked schedule entries.',
        metadata: {
          operationCategory: operation.operationCategory,
        },
      })
    }

    if (operationRequiresSchedule(operation) && !normalizeText(operation.assignedTechnicianEmail)) {
      pushException({
        code: 'MISSING_TECHNICIAN',
        severity: 'high',
        operationId,
        scheduleEntryId: null,
        reportId: null,
        technicianEmail: null,
        message: 'Open operation requires assigned technician but none is linked.',
        metadata: {
          technicianLinkageState: operation.technicianLinkageState,
        },
      })
    }

    let hasPastDuePlannedSchedule = false
    for (const schedule of linkedSchedules) {
      const plannedDay = dateToIsoDay(schedule.plannedDateTime ?? schedule.plannedDate)
      const hasCalendarLink = Boolean(normalizeText(schedule.calendarEventRef))

      if (!hasCalendarLink) {
        pushException({
          code: 'MISSING_CALENDAR_LINK',
          severity: 'medium',
          operationId,
          scheduleEntryId: schedule.id,
          reportId: null,
          technicianEmail: schedule.canonicalTechnicianEmail,
          message: 'Schedule entry is missing a calendar event reference.',
          metadata: {
            plannedDate: schedule.plannedDate,
            plannedDateTime: schedule.plannedDateTime ?? null,
            plannedDateTimeSource: schedule.plannedDateTimeSource,
            scheduleStatus: schedule.scheduleStatus,
          },
        })
      }

      if (plannedDay && plannedDay < today && !isCompletedStatus(schedule.controlStatus) && !isCompletedStatus(schedule.scheduleStatus)) {
        hasPastDuePlannedSchedule = true
      }
    }

    if (hasPastDuePlannedSchedule) {
      pushException({
        code: 'OVERDUE_EXECUTION',
        severity: 'high',
        operationId,
        scheduleEntryId: null,
        reportId: null,
        technicianEmail: operation.assignedTechnicianEmail,
        message: 'Open operation has overdue planned schedule execution.',
        metadata: {
          operationCategory: operation.operationCategory,
        },
      })
    }

    if (operationRequiresReport(operation)) {
      const operationReports = reportsByOperation.get(operationId) ?? []
      const hasReport = operationReports.length > 0
      if (!hasReport && linkedSchedules.some((schedule) => {
        const plannedDay = dateToIsoDay(schedule.plannedDateTime ?? schedule.plannedDate)
        return Boolean(plannedDay) && plannedDay <= today
      })) {
        pushException({
          code: 'MISSING_REPORT',
          severity: 'high',
          operationId,
          scheduleEntryId: null,
          reportId: null,
          technicianEmail: operation.assignedTechnicianEmail,
          message: 'Operation requires report but no report is linked after planned execution date.',
          metadata: {
            operationCategory: operation.operationCategory,
            scheduleCount: linkedSchedules.length,
          },
        })
      }
    }

    if (linkedSchedules.length >= 2) {
      const pastOrCurrentVisits = linkedSchedules.filter((schedule) => {
        const plannedDay = dateToIsoDay(schedule.plannedDateTime ?? schedule.plannedDate)
        return Boolean(plannedDay) && plannedDay <= today
      })

      if (pastOrCurrentVisits.length >= 2) {
        pushException({
          code: 'REPEAT_FIELD_VISIT',
          severity: 'medium',
          operationId,
          scheduleEntryId: null,
          reportId: null,
          technicianEmail: operation.assignedTechnicianEmail,
          message: 'Operation has repeated field visits in schedule timeline.',
          metadata: {
            visitCount: pastOrCurrentVisits.length,
          },
        })
      }
    }
  }

  for (const schedule of input.scheduleEntries) {
    if (!normalizeText(schedule.operationId)) {
      pushException({
        code: 'ORPHAN_SCHEDULE_ENTRY',
        severity: 'medium',
        operationId: null,
        scheduleEntryId: schedule.id,
        reportId: null,
        technicianEmail: schedule.canonicalTechnicianEmail,
        message: 'Schedule entry is not linked to a runtime operation.',
        metadata: {
          operationIdRef: schedule.operationIdRef,
        },
      })
    }
  }

  for (const report of input.reports) {
    if (!normalizeText(report.operationId) && !normalizeText(report.scheduleEntryId)) {
      pushException({
        code: 'ORPHAN_REPORT',
        severity: 'medium',
        operationId: null,
        scheduleEntryId: null,
        reportId: report.id,
        technicianEmail: report.technicianEmail,
        message: 'Report is not linked to runtime operation or schedule entry.',
        metadata: {
          operationIdRef: report.operationIdRef,
          scheduleEntryIdRef: report.scheduleEntryIdRef,
        },
      })
    }
  }

  return {
    exceptions,
    diagnostics: createDiagnostics(exceptions),
  }
}
