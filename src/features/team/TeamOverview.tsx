import type {
  FacilityRecord,
  Priority,
  RuntimeAssignmentSnapshot,
  RuntimeOperationSnapshot,
  RuntimeUserSnapshot,
} from '../../types/scheduling'

interface TeamOverviewProps {
  facilitiesData?: FacilityRecord[]
  operationsData?: RuntimeOperationSnapshot[]
  assignmentsData?: RuntimeAssignmentSnapshot[]
  usersData?: RuntimeUserSnapshot[]
  isLoading?: boolean
  errorMessage?: string | null
}

interface TeamTaskRow {
  id: string
  title: string
  mondayId: string
  priority: Priority
  openTickets: number
  technicianId: string
  technicianName: string
}

interface TeamTechnicianRow {
  id: string
  name: string
  role: string
  color: string
  openTasks: number
}

const OWNER_TITLE_MARKERS = ['טכנאי', 'מבצע', 'אחראי', 'owner', 'technician']
const PRIORITY_ORDER: Record<Priority, number> = {
  P1: 0,
  P2: 1,
  P3: 2,
}

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

function resolvePriorityFromOperation(operation: RuntimeOperationSnapshot): Priority {
  const status = normalizeText(operation.executionStatus).toLowerCase()

  if (!status) return 'P2'
  if (status.includes('exception') || status.includes('error') || status.includes('חירום') || status.includes('דחוף')) return 'P1'
  if (status.includes('needs') || status.includes('missing') || status.includes('waiting') || status.includes('review')) return 'P2'
  return 'P3'
}

function isOpenOperation(operation: RuntimeOperationSnapshot) {
  const status = normalizeText(operation.executionStatus).toLowerCase()
  if (!status) return true

  const closedMarkers = ['closed', 'done', 'executed', 'completed', 'נסגר', 'בוצע', 'הושלם']
  return !closedMarkers.some((marker) => status.includes(marker))
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

function buildTeamRowsFromFacilities(facilities: FacilityRecord[]) {
  const taskRows: TeamTaskRow[] = facilities
    .map((facility) => {
      const openTickets = Number.isFinite(Number(facility.openTickets)) ? Number(facility.openTickets) : 0
      if (openTickets <= 0) return null

      const technicianName = resolveTechnicianNameFromFacility(facility)
      const technicianId = toTechnicianId(technicianName) || 'unassigned'

      return {
        id: facility.id,
        title: facility.name,
        mondayId: facility.id,
        priority: resolvePriorityFromFacility(facility),
        openTickets,
        technicianId,
        technicianName,
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

  const taskRows: TeamTaskRow[] = operations
    .filter((operation) => isOpenOperation(operation))
    .map((operation) => {
      const assignedEmail =
        normalizeText(operation.assignedTechnicianEmail).toLowerCase() ||
        normalizeText(assignmentByOperationId.get(operation.id)?.userEmail).toLowerCase()

      const technicianName = assignedEmail
        ? (userNameByEmail.get(assignedEmail) ?? assignedEmail)
        : 'ללא שיוך'

      const technicianId = toTechnicianId(assignedEmail || technicianName) || 'unassigned'
      const operationLabel = normalizeText(operation.shortOperationId) || normalizeText(operation.id)

      return {
        id: normalizeText(operation.id),
        title: `פעולה ${operationLabel}`,
        mondayId: operationLabel,
        priority: resolvePriorityFromOperation(operation),
        openTickets: 1,
        technicianId,
        technicianName,
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

export function TeamOverview({
  facilitiesData = [],
  operationsData = [],
  assignmentsData = [],
  usersData = [],
  isLoading = false,
  errorMessage = null,
}: TeamOverviewProps) {
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

  const fromOperations = buildTeamRowsFromOperations(operationsData, assignmentsData, usersData)
  const fromFacilities = buildTeamRowsFromFacilities(facilitiesData)
  const active = fromOperations.taskRows.length > 0 ? fromOperations : fromFacilities

  const totalOpenTickets = active.taskRows.reduce((acc, task) => acc + task.openTickets, 0)

  return (
    <section>
      <div className="kpis">
        <div className="kpi">
          <strong>{totalOpenTickets}</strong>
          <span>קריאות פתוחות</span>
        </div>
        <div className="kpi">
          <strong>{countByPriority(active.taskRows, 'P1')}</strong>
          <span>מתקנים דחופים P1</span>
        </div>
        <div className="kpi">
          <strong>{active.technicians.length}</strong>
          <span>טכנאים בעומס פעיל</span>
        </div>
      </div>

      <div className="team-grid">
        {active.technicians.map((technician) => (
          <article className="panel tech-card" key={technician.id}>
            <h3>{technician.name}</h3>
            <p>{technician.role}</p>
            <p>מתקנים פתוחים: {technician.openTasks}</p>
            <span className="tech-chip" style={{ backgroundColor: `${technician.color}33` }}>
              מזהה: {technician.id}
            </span>
          </article>
        ))}
      </div>

      <div className="panel pending-panel">
        <h2>מתקנים פתוחים (Runtime Snapshot)</h2>
        {active.taskRows.length === 0 ? (
          <p>אין כרגע רשומות פתוחות להצגה בנתוני ה-runtime.</p>
        ) : (
          <>
            <p>מקור נתונים: {active.source === 'operations_runtime' ? 'operations' : 'facilities (fallback)'}</p>
            <ol className="pending-list">
              {active.taskRows.map((task) => (
                <li key={task.id}>
                  <strong>{task.title}</strong> | {task.technicianName} | {task.priority} | פתוחות: {task.openTickets} | Monday #{task.mondayId}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  )
}
