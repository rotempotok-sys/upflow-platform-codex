import { useMemo, useState } from 'react'
import type {
  FacilityRecord,
  OperationProjectionRow,
  Priority,
  RuntimeAssignmentSnapshot,
  RuntimeExceptionSnapshot,
  RuntimeOperationSnapshot,
  RuntimeOperationalProjections,
  RuntimeReportSnapshot,
  RuntimeScheduleEntrySnapshot,
  RuntimeUserSnapshot,
} from '../../types/scheduling'

interface TeamOverviewProps {
  facilitiesData?: FacilityRecord[]
  operationsData?: RuntimeOperationSnapshot[]
  assignmentsData?: RuntimeAssignmentSnapshot[]
  usersData?: RuntimeUserSnapshot[]
  scheduleEntriesData?: RuntimeScheduleEntrySnapshot[]
  reportsData?: RuntimeReportSnapshot[]
  exceptionsData?: RuntimeExceptionSnapshot[]
  projectionsData?: RuntimeOperationalProjections | null
  isLoading?: boolean
  errorMessage?: string | null
}

interface TeamTaskRow {
  id: string
  operationId: string
  title: string
  mondayId: string
  priority: Priority
  openTickets: number
  technicianId: string
  technicianName: string
  technicianEmail: string | null
  clientName: string
  taskStatus: string
  requiredAction: string
  isWithoutTechnician: boolean
  isPlannedToday: boolean
  isPlannedWeek: boolean
  isOverdue: boolean
  isAtRisk: boolean
  hasFacilityLinkageGap: boolean
  plannedDateLabel: string
  exceptionSummary: string
  detailLines: string[]
}

interface TeamTechnicianRow {
  id: string
  name: string
  role: string
  color: string
  openTasks: number
}

type ManagementTabKey = 'today' | 'week' | 'urgent' | 'atRisk' | 'withoutTechnician' | 'overdue'

const OWNER_TITLE_MARKERS = ['טכנאי', 'מבצע', 'אחראי', 'owner', 'technician']
const PRIORITY_ORDER: Record<Priority, number> = {
  P1: 0,
  P2: 1,
  P3: 2,
}

const MANAGEMENT_TABS: Array<{ key: ManagementTabKey; label: string }> = [
  { key: 'today', label: 'היום' },
  { key: 'week', label: 'השבוע' },
  { key: 'urgent', label: 'דחופים' },
  { key: 'atRisk', label: 'בסיכון' },
  { key: 'withoutTechnician', label: 'ללא טכנאי' },
  { key: 'overdue', label: 'באיחור' },
]

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function toTechnicianId(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0590-\u05FF\-]/g, '')
    .slice(0, 64)
}

function colorFromId(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return `hsl(${hue}, 65%, 50%)`
}

function resolveTechnicianNameFromFacility(facility: FacilityRecord) {
  const fromColumn = facility.columns.find((column) => {
    const title = normalizeText(column.title).toLowerCase()
    if (!title) return false
    return OWNER_TITLE_MARKERS.some((marker) => title.includes(marker))
  })

  const preferred = normalizeText(fromColumn?.text)
  if (preferred) return preferred

  const fromGroup = normalizeText(facility.group)
  if (fromGroup) return fromGroup

  return 'ללא שיוך'
}

function resolvePriorityFromFacility(facility: FacilityRecord): Priority {
  const status = normalizeText(facility.facilityStatus).toLowerCase()
  const tickets = Number.isFinite(Number(facility.openTickets)) ? Number(facility.openTickets) : 0

  if (status.includes('דחוף') || status.includes('חירום') || tickets >= 5) return 'P1'
  if (tickets >= 2) return 'P2'
  return 'P3'
}

function resolvePriorityFromOperation(operation: RuntimeOperationSnapshot, isUrgentSignal: boolean): Priority {
  const status = normalizeText(operation.executionStatus).toLowerCase()

  if (isUrgentSignal) return 'P1'
  if (!status) return 'P2'
  if (status.includes('exception') || status.includes('error') || status.includes('חירום') || status.includes('דחוף')) return 'P1'
  if (status.includes('needs') || status.includes('missing') || status.includes('waiting') || status.includes('review')) return 'P2'
  return 'P3'
}

function isOpenOperation(operation: RuntimeOperationSnapshot) {
  if (operation.isOpen === false) return false

  const status = normalizeText(operation.executionStatus).toLowerCase()
  if (!status) return true

  const closedMarkers = ['closed', 'done', 'executed', 'completed', 'נסגר', 'בוצע', 'הושלם']
  return !closedMarkers.some((marker) => status.includes(marker))
}

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function plusDays(base: Date, days: number) {
  const next = new Date(base)
  next.setDate(base.getDate() + days)
  return next
}

function isoDateFromValue(value: string | null | undefined) {
  return normalizeText(value).slice(0, 10)
}

function isDateInRange(dateIso: string, rangeStart: string, rangeEnd: string) {
  if (!dateIso) return false
  return dateIso >= rangeStart && dateIso <= rangeEnd
}

function sortTaskRows(rows: TeamTaskRow[]) {
  rows.sort((a, b) => {
    if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) {
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    }

    if (a.openTickets !== b.openTickets) {
      return b.openTickets - a.openTickets
    }

    return a.title.localeCompare(b.title, 'he')
  })
}

function formatTechnicianDisplay(name: string, email: string | null) {
  const normalizedEmail = normalizeText(email).toLowerCase()
  if (normalizedEmail) return `${name} (${normalizedEmail})`
  return name
}

function buildTechnicians(rows: TeamTaskRow[]) {
  const techniciansMap = new Map<string, TeamTechnicianRow>()

  for (const task of rows) {
    const existing = techniciansMap.get(task.technicianId)
    if (existing) {
      existing.openTasks += 1
      continue
    }

    techniciansMap.set(task.technicianId, {
      id: task.technicianId,
      name: task.technicianName,
      role: task.technicianId === 'unassigned' ? 'ללא שיוך טכנאי' : 'טכנאי',
      color: colorFromId(task.technicianId),
      openTasks: 1,
    })
  }

  return Array.from(techniciansMap.values()).sort((a, b) => b.openTasks - a.openTasks)
}

function getRequiredAction(input: {
  isWithoutTechnician: boolean
  isOverdue: boolean
  hasMissingSchedule: boolean
  hasMissingReport: boolean
  hasFacilityLinkageGap: boolean
}) {
  if (input.isWithoutTechnician) return 'לשייך טכנאי אחראי'
  if (input.isOverdue) return 'לבצע בירור איחור ולעדכן תאריך ביצוע'
  if (input.hasMissingSchedule) return 'לקבוע תזמון ביומן/לוח זמנים'
  if (input.hasMissingReport) return 'להשלים דיווח ביצוע מקושר'
  if (input.hasFacilityLinkageGap) return 'להשלים שיוך לקוח/מתקן חד-ערכי'
  return 'מעקב שוטף'
}

function buildTeamRowsFromFacilities(facilities: FacilityRecord[]) {
  const taskRows: TeamTaskRow[] = facilities
    .map((facility) => {
      const openTickets = Number.isFinite(Number(facility.openTickets)) ? Number(facility.openTickets) : 0
      if (openTickets <= 0) return null

      const technicianName = resolveTechnicianNameFromFacility(facility)
      const technicianId = toTechnicianId(technicianName) || 'unassigned'
      const priority = resolvePriorityFromFacility(facility)

      return {
        id: facility.id,
        operationId: facility.id,
        title: facility.name,
        mondayId: facility.id,
        priority,
        openTickets,
        technicianId,
        technicianName,
        technicianEmail: null as string | null,
        clientName: normalizeText(facility.name) || 'לקוח לא משויך',
        taskStatus: 'פתוח',
        requiredAction: priority === 'P1' ? 'טיפול דחוף תפעולי' : 'מעקב שוטף',
        isWithoutTechnician: technicianId === 'unassigned',
        isPlannedToday: false,
        isPlannedWeek: false,
        isOverdue: false,
        isAtRisk: priority === 'P1',
        hasFacilityLinkageGap: true,
        plannedDateLabel: 'לא זמין (fallback)',
        exceptionSummary: 'לא זמין (fallback)',
        detailLines: [
          `רשומת fallback מ-facilities`,
          `openTickets: ${openTickets}`,
          `priority: ${priority}`,
        ],
      }
    })
    .filter((task): task is TeamTaskRow => Boolean(task))

  sortTaskRows(taskRows)

  return {
    taskRows,
    technicians: buildTechnicians(taskRows),
    source: 'facilities_fallback' as const,
  }
}

function buildTeamRowsFromOperations(
  operations: RuntimeOperationSnapshot[],
  assignments: RuntimeAssignmentSnapshot[],
  users: RuntimeUserSnapshot[],
  scheduleEntries: RuntimeScheduleEntrySnapshot[],
  exceptions: RuntimeExceptionSnapshot[],
  todayIso: string,
  weekEndIso: string,
  projectionByOperationId: Map<string, OperationProjectionRow>,
) {
  const userNameByEmail = new Map<string, string>()
  for (const user of users) {
    const email = normalizeText(user.email).toLowerCase()
    if (!email) continue
    userNameByEmail.set(email, normalizeText(user.displayName) || email)
  }

  const assignmentByOperationId = new Map<string, RuntimeAssignmentSnapshot>()
  for (const assignment of assignments) {
    if (!assignment.operationId || assignmentByOperationId.has(assignment.operationId)) continue
    assignmentByOperationId.set(assignment.operationId, assignment)
  }

  const scheduleByOperationId = new Map<string, RuntimeScheduleEntrySnapshot[]>()
  for (const entry of scheduleEntries) {
    const operationId = normalizeText(entry.operationId || entry.operationIdRef)
    if (!operationId) continue
    const bucket = scheduleByOperationId.get(operationId) ?? []
    bucket.push(entry)
    scheduleByOperationId.set(operationId, bucket)
  }

  const exceptionsByOperationId = new Map<string, RuntimeExceptionSnapshot[]>()
  for (const exception of exceptions) {
    const operationId = normalizeText(exception.operationId)
    if (!operationId) continue
    const bucket = exceptionsByOperationId.get(operationId) ?? []
    bucket.push(exception)
    exceptionsByOperationId.set(operationId, bucket)
  }

  const taskRows: TeamTaskRow[] = operations
    .filter((operation) => isOpenOperation(operation))
    .map((operation) => {
      const operationId = normalizeText(operation.id)
      const operationLabel = normalizeText(operation.shortOperationId) || operationId
      const operationName =
        normalizeText(operation.requestPurposeRaw) || normalizeText(operation.operationCategory) || `Operation ${operationLabel}`

      const projection = projectionByOperationId.get(operationId)
      const assignedEmail =
        normalizeText(operation.assignedTechnicianEmail).toLowerCase() ||
        normalizeText(assignmentByOperationId.get(operationId)?.userEmail).toLowerCase() ||
        normalizeText(projection?.technicianEmail).toLowerCase() ||
        null

      const operationSchedules = scheduleByOperationId.get(operationId) ?? []
      const legacyScheduleTechnicianName =
        normalizeText(operationSchedules.find((entry) => normalizeText(entry.legacyTechnicianDropdownValue))?.legacyTechnicianDropdownValue) || null
      const hintedTechnicianName = normalizeText(operation.technicianNameHint) || null

      const canonicalNameByEmail = assignedEmail ? userNameByEmail.get(assignedEmail) ?? null : null
      const fallbackName = normalizeText(projection?.technicianName) || hintedTechnicianName || legacyScheduleTechnicianName || null

      const technicianName = assignedEmail
        ? canonicalNameByEmail || fallbackName || assignedEmail
        : fallbackName || 'ללא שיוך'

      const technicianId = toTechnicianId(assignedEmail || technicianName) || 'unassigned'

      const linkageState = normalizeText(operation.technicianLinkageState)
      const isWithoutTechnician =
        !assignedEmail || linkageState === 'unlinked' || linkageState === 'legacy_schedule_dropdown_fallback_pending'

      const plannedDateIsos = operationSchedules
        .map((entry) => isoDateFromValue(entry.plannedDateTime || entry.plannedDate))
        .filter((value) => Boolean(value))

      const isPlannedToday = plannedDateIsos.some((dateIso) => dateIso === todayIso)
      const isPlannedWeek = plannedDateIsos.some((dateIso) => isDateInRange(dateIso, todayIso, weekEndIso))

      const operationExceptions = exceptionsByOperationId.get(operationId) ?? []
      const hasMissingSchedule = operationExceptions.some((exception) => normalizeText(exception.code) === 'MISSING_SCHEDULE')
      const hasMissingReport = operationExceptions.some((exception) => normalizeText(exception.code) === 'MISSING_REPORT')
      const isOverdue = operationExceptions.some((exception) => normalizeText(exception.code) === 'OVERDUE_EXECUTION')

      const hasFacilityLinkageGap = normalizeText(operation.facilityLinkageState) !== 'resolved_unique_client_facility_link'
      const isUrgentSignal =
        isOverdue ||
        operationExceptions.some((exception) => {
          const code = normalizeText(exception.code)
          return code === 'MISSING_TECHNICIAN' || code === 'MISSING_SCHEDULE' || code === 'MISSING_CALENDAR_LINK'
        })

      const requiredAction = getRequiredAction({
        isWithoutTechnician,
        isOverdue,
        hasMissingSchedule,
        hasMissingReport,
        hasFacilityLinkageGap,
      })

      const isAtRisk = hasFacilityLinkageGap || operationExceptions.length > 0
      const taskStatus =
        normalizeText(operation.executionStatus) || normalizeText(operation.businessStatus) || 'פתוח'

      const clientName = normalizeText(projection?.clientName) || 'לקוח לא משויך'
      const plannedDateLabel = plannedDateIsos[0] ?? 'לא נקבע תאריך'
      const exceptionSummary = operationExceptions.length
        ? operationExceptions.map((entry) => `${normalizeText(entry.code)} (${normalizeText(entry.severity)})`).join(', ')
        : 'ללא חריגות פעילות'

      const detailLines = [
        `Operation ID: ${operationId}`,
        `Short ID: ${operationLabel}`,
        `Category: ${normalizeText(operation.operationCategory) || 'לא זמין'}`,
        `Business status: ${normalizeText(operation.businessStatus) || 'לא זמין'}`,
        `Execution status: ${taskStatus}`,
        `Client: ${clientName}`,
        `Technician: ${technicianName}`,
        `Technician email: ${assignedEmail || 'לא זמין'}`,
        `Technician linkage: ${normalizeText(operation.technicianLinkageState) || 'לא זמין'}`,
        `Facility linkage: ${normalizeText(operation.facilityLinkageState) || 'לא זמין'}`,
        `Planned dates: ${plannedDateIsos.length ? plannedDateIsos.join(', ') : 'לא נקבע'}`,
        `Exceptions: ${exceptionSummary}`,
      ]

      return {
        id: operationId,
        operationId,
        title: operationName,
        mondayId: operationLabel,
        priority: resolvePriorityFromOperation(operation, isUrgentSignal),
        openTickets: 1,
        technicianId,
        technicianName,
        technicianEmail: assignedEmail,
        clientName,
        taskStatus,
        requiredAction,
        isWithoutTechnician,
        isPlannedToday,
        isPlannedWeek,
        isOverdue,
        isAtRisk,
        hasFacilityLinkageGap,
        plannedDateLabel,
        exceptionSummary,
        detailLines,
      }
    })
    .filter((task) => Boolean(task.id))

  sortTaskRows(taskRows)

  return {
    taskRows,
    technicians: buildTechnicians(taskRows),
    source: 'operations_runtime' as const,
  }
}

function countByPriority(rows: TeamTaskRow[], priority: Priority) {
  return rows.filter((row) => row.priority === priority).length
}

function getFilteredRows(rows: TeamTaskRow[], tab: ManagementTabKey) {
  if (tab === 'today') return rows.filter((row) => row.isPlannedToday)
  if (tab === 'week') return rows.filter((row) => row.isPlannedWeek)
  if (tab === 'urgent') return rows.filter((row) => row.priority === 'P1')
  if (tab === 'atRisk') return rows.filter((row) => row.isAtRisk)
  if (tab === 'withoutTechnician') return rows.filter((row) => row.isWithoutTechnician)
  return rows.filter((row) => row.isOverdue)
}

export function TeamOverview({
  facilitiesData = [],
  operationsData = [],
  assignmentsData = [],
  usersData = [],
  scheduleEntriesData = [],
  reportsData = [],
  exceptionsData = [],
  projectionsData = null,
  isLoading = false,
  errorMessage = null,
}: TeamOverviewProps) {
  const [activeTab, setActiveTab] = useState<ManagementTabKey>('today')
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null)

  const now = new Date()
  const todayIso = toLocalIsoDate(now)
  const weekEndIso = toLocalIsoDate(plusDays(now, 6))

  const projectionByOperationId = useMemo(() => {
    const map = new Map<string, OperationProjectionRow>()
    for (const row of projectionsData?.operationView.rows ?? []) {
      map.set(normalizeText(row.operationId), row)
    }
    return map
  }, [projectionsData])

  const fromOperations = buildTeamRowsFromOperations(
    operationsData,
    assignmentsData,
    usersData,
    scheduleEntriesData,
    exceptionsData,
    todayIso,
    weekEndIso,
    projectionByOperationId,
  )
  const fromFacilities = buildTeamRowsFromFacilities(facilitiesData)
  const active = fromOperations.taskRows.length > 0 ? fromOperations : fromFacilities

  const queueRows = useMemo(() => getFilteredRows(active.taskRows, activeTab), [active.taskRows, activeTab])
  const selectedTask = useMemo(
    () => queueRows.find((row) => row.operationId === selectedOperationId) ?? null,
    [queueRows, selectedOperationId],
  )

  const openUrgentOperations = countByPriority(active.taskRows, 'P1')
  const openWithoutTechnician = active.taskRows.filter((row) => row.isWithoutTechnician).length
  const plannedForToday = active.taskRows.filter((row) => row.isPlannedToday).length
  const overdueCount = active.taskRows.filter((row) => row.isOverdue).length
  const atRiskContexts = new Set(
    active.taskRows
      .filter((row) => row.isAtRisk)
      .map((row) => `${row.clientName}:${row.hasFacilityLinkageGap ? 'facility-gap' : 'linked'}`),
  ).size

  const hasFacilityPartialState = active.taskRows.some((row) => row.hasFacilityLinkageGap)

  if (isLoading) {
    return (
      <section>
        <div className="panel pending-panel">
          <h2>טוען נתוני צוות...</h2>
        </div>
      </section>
    )
  }

  if (errorMessage) {
    return (
      <section>
        <div className="panel pending-panel">
          <h2>שגיאת טעינת נתוני צוות</h2>
          <p>{errorMessage}</p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="kpis">
        <div className="kpi">
          <strong>{openUrgentOperations}</strong>
          <span>משימות דחופות פתוחות</span>
        </div>
        <div className="kpi">
          <strong>{openWithoutTechnician}</strong>
          <span>משימות פתוחות ללא טכנאי</span>
        </div>
        <div className="kpi">
          <strong>{plannedForToday}</strong>
          <span>משימות להיום</span>
        </div>
        <div className="kpi">
          <strong>{overdueCount}</strong>
          <span>משימות באיחור</span>
        </div>
        <div className="kpi">
          <strong>{atRiskContexts}</strong>
          <span>הקשרי לקוח/מתקן בסיכון</span>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="מצבי ניהול">
        {MANAGEMENT_TABS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`tab ${activeTab === tab.key ? 'tab-active' : ''}`}
            onClick={() => {
              setActiveTab(tab.key)
              setSelectedOperationId(null)
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="team-grid">
        {active.technicians.map((technician) => (
          <article className="panel tech-card" key={technician.id}>
            <h3>{technician.name}</h3>
            <p>{technician.role}</p>
            <p>משימות פתוחות: {technician.openTasks}</p>
            <span className="tech-chip" style={{ backgroundColor: `${technician.color}33` }}>
              מזהה: {technician.id}
            </span>
          </article>
        ))}
      </div>

      <div className="panel pending-panel">
        <h2>תור אופרציות - {MANAGEMENT_TABS.find((tab) => tab.key === activeTab)?.label}</h2>
        {queueRows.length === 0 ? (
          <p>אין כרגע רשומות תואמות למצב הניהולי שנבחר.</p>
        ) : (
          <>
            <p>
              מקור נתונים: {active.source === 'operations_runtime' ? 'operations runtime' : 'facilities fallback'} | משתמשים: {usersData.length} |
              שיוכים: {assignmentsData.length} | schedule: {scheduleEntriesData.length} | דוחות: {reportsData.length} | חריגות: {exceptionsData.length}
            </p>
            <ol className="pending-list">
              {queueRows.map((task) => (
                <li key={task.id}>
                  <button type="button" className="tab" onClick={() => setSelectedOperationId(task.operationId)}>
                    פתח פרטים מלאים
                  </button>
                  <p>
                    <strong>{task.title}</strong>
                  </p>
                  <p>לקוח: {task.clientName}</p>
                  <p>טכנאי: {formatTechnicianDisplay(task.technicianName, task.technicianEmail)}</p>
                  <p>סטטוס משימה: {task.taskStatus}</p>
                  <p>פעולה נדרשת: {task.requiredAction}</p>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      {selectedTask ? (
        <div className="operation-modal-backdrop" onClick={() => setSelectedOperationId(null)}>
          <div className="panel operation-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{selectedTask.title}</h2>
            <p>לקוח: {selectedTask.clientName}</p>
            <p>טכנאי: {formatTechnicianDisplay(selectedTask.technicianName, selectedTask.technicianEmail)}</p>
            <p>סטטוס משימה: {selectedTask.taskStatus}</p>
            <p>פעולה נדרשת: {selectedTask.requiredAction}</p>
            <p>תאריך מתוכנן: {selectedTask.plannedDateLabel}</p>
            <p>חריגות פעילות: {selectedTask.exceptionSummary}</p>
            <p>עדיפות: {selectedTask.priority}</p>
            <p>Monday: {selectedTask.mondayId}</p>
            <h3>פירוט מלא</h3>
            <ul className="pending-list">
              {selectedTask.detailLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button type="button" className="tab tab-active" onClick={() => setSelectedOperationId(null)}>
              סגור
            </button>
          </div>
        </div>
      ) : null}

      {hasFacilityPartialState ? (
        <div className="panel pending-panel">
          <h2>Facility View (Partial)</h2>
          <p>קישור לקוח/מתקן עדיין חלקי בחלק מהרשומות. התצוגה מסומנת כ-partial עד השלמת linkage חד-ערכי.</p>
          <p>Projections: {projectionsData ? 'loaded' : 'not available'}</p>
        </div>
      ) : null}
    </section>
  )
}




