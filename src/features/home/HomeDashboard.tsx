import React, { useMemo } from 'react'
import { ServiceTab } from './tabs/ServiceTab'
import { ProjectsTab } from './tabs/ProjectsTab'
import { ProcurementTab } from './tabs/ProcurementTab'
import { SalesTab } from './tabs/SalesTab'
import { LogisticsTab } from './tabs/LogisticsTab'
import type {
  RuntimeAssignmentSnapshot,
  RuntimeExceptionSnapshot,
  RuntimeOperationSnapshot,
  RuntimeReportSnapshot,
  RuntimeScheduleEntrySnapshot,
  RuntimeUserSnapshot,
  RuntimeOperationalProjections,
} from '../../types/scheduling'

interface HomeDashboardProps {
  currentUserEmail: string | null
  currentUserRole: string | null
  operationsData: RuntimeOperationSnapshot[]
  exceptionsData: RuntimeExceptionSnapshot[]
  scheduleEntriesData: RuntimeScheduleEntrySnapshot[]
  reportsData: RuntimeReportSnapshot[]
  usersData: RuntimeUserSnapshot[]
  assignmentsData?: RuntimeAssignmentSnapshot[]
  projectionsData: RuntimeOperationalProjections | null
  isLoading?: boolean
}

// ─── helpers ───────────────────────────────────────────────────────────────

const EXCEPTION_CODE_LABEL: Record<string, string> = {
  MISSING_TECHNICIAN: 'חסר טכנאי',
  MISSING_SCHEDULE: 'חסר תיזמון',
  MISSING_CALENDAR_LINK: 'חסר אירוע יומן',
  MISSING_REPORT: 'חסר דוח',
  OVERDUE_EXECUTION: 'ביצוע באיחור',
  AMBIGUOUS_FACILITY_MAPPING: 'מתקן לא ברור',
  ORPHAN_SCHEDULE_ENTRY: 'תיזמון עצמאי',
  ORPHAN_REPORT: 'דוח עצמאי',
  REPEAT_FIELD_VISIT: 'ביקור חוזר',
}

/** Monday item link (operations center board) */
function mondayLink(boardId: string, itemId: string) {
  return `https://upflow-team.monday.com/boards/${boardId}/pulses/${itemId}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function isoDay(value: string | null | undefined) {
  return String(value ?? '').slice(0, 10)
}

// ─── sub-components ────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${accent ?? 'rgba(255,255,255,0.1)'}`,
        borderRadius: 12,
        padding: '16px 20px',
        minWidth: 110,
        flex: 1,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 800, color: accent ?? '#fff', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2
      style={{
        fontSize: 14,
        fontWeight: 700,
        color: '#888',
        textTransform: 'uppercase',
        letterSpacing: 1,
        margin: '24px 0 10px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        paddingBottom: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {children}
      {count != null && (
        <span style={{ fontSize: 12, fontWeight: 600, color: '#666', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '1px 8px' }}>
          {count}
        </span>
      )}
    </h2>
  )
}

function MondayBadge({ boardId, itemId }: { boardId: string; itemId: string }) {
  return (
    <a
      href={mondayLink(boardId, itemId)}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontSize: 10,
        color: '#579bfc',
        textDecoration: 'none',
        border: '1px solid #579bfc40',
        borderRadius: 4,
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
      title="פתח במאנדיי"
    >
      Monday ↗
    </a>
  )
}

// ─── ui components ─────────────────────────────────────────────────────────

type TabKey = 'service' | 'projects' | 'procurement' | 'sales' | 'logistics'

interface TabDefinition {
  id: TabKey
  label: string
  visibleForTechnician: boolean
}

const TABS: TabDefinition[] = [
  { id: 'service', label: 'שירות', visibleForTechnician: true },
  { id: 'projects', label: 'פרויקטים', visibleForTechnician: true },
  { id: 'procurement', label: 'רכש', visibleForTechnician: true },
  { id: 'sales', label: 'מכירות', visibleForTechnician: false },
  { id: 'logistics', label: 'לוגיסטיקה', visibleForTechnician: true },
]

function TabsNavigation({
  activeTab,
  onTabChange,
  isTechnician,
}: {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  isTechnician?: boolean
}) {
  const visibleTabs = TABS.filter((t) => !isTechnician || t.visibleForTechnician)

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '0 4px',
        marginBottom: 20,
        overflowX: 'auto',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: 2,
      }}
    >
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? '#fff' : '#888',
              borderBottom: isActive ? '2px solid #579bfc' : '2px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}


// ─── manager / CEO dashboard ───────────────────────────────────────────────

function ManagerDashboard({
  operationsData,
  exceptionsData,
  scheduleEntriesData,
  reportsData,
  usersData,
  assignmentsData = [],
  projectionsData,
}: Omit<HomeDashboardProps, 'currentUserEmail' | 'currentUserRole' | 'isLoading' | 'facilitiesData'>) {
  const [activeTab, setActiveTab] = React.useState<TabKey>('service')

  return (
    <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column' }}>
      <TabsNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'service' && (
        <ServiceTab
          operationsData={operationsData}
          exceptionsData={exceptionsData}
          scheduleEntriesData={scheduleEntriesData}
          reportsData={reportsData}
          usersData={usersData}
          assignmentsData={assignmentsData}
          projectionsData={projectionsData}
        />
      )}

      {activeTab === 'projects' && (
        <ProjectsTab operationsData={operationsData} usersData={usersData} />
      )}
      
      {activeTab === 'procurement' && (
        <ProcurementTab operationsData={operationsData} usersData={usersData} />
      )}

      {activeTab === 'sales' && (
        <SalesTab operationsData={operationsData} usersData={usersData} />
      )}

      {activeTab === 'logistics' && (
        <LogisticsTab operationsData={operationsData} usersData={usersData} />
      )}
    </div>
  )
}

// ─── technician dashboard ──────────────────────────────────────────────────

function TechnicianDashboard({
  currentUserEmail,
  operationsData,
  scheduleEntriesData,
  exceptionsData,
}: {
  currentUserEmail: string | null
  operationsData: RuntimeOperationSnapshot[]
  scheduleEntriesData: RuntimeScheduleEntrySnapshot[]
  exceptionsData: RuntimeExceptionSnapshot[]
}) {
  const [activeTab, setActiveTab] = React.useState<TabKey>('service')
  const todayStr = today()

  const myScheduleToday = useMemo(
    () =>
      scheduleEntriesData
        .filter((s) => {
          const day = isoDay(s.plannedDateTime ?? s.plannedDate)
          const isMyEmail = s.technicianEmail === currentUserEmail
          return day === todayStr && isMyEmail
        })
        .sort((a, b) => {
          const ta = String(a.plannedDateTime ?? a.plannedDate ?? '')
          const tb = String(b.plannedDateTime ?? b.plannedDate ?? '')
          return ta.localeCompare(tb)
        }),
    [scheduleEntriesData, currentUserEmail, todayStr]
  )

  const myOpenOps = useMemo(
    () =>
      operationsData.filter(
        (o) => o.isOpen && o.assignedTechnicianEmail === currentUserEmail
      ),
    [operationsData, currentUserEmail]
  )

  // Find exceptions related to this technician (e.g., missing reports)
  const myExceptions = useMemo(
    () =>
      exceptionsData.filter(
        (e) => e.technicianEmail === currentUserEmail && e.code === 'MISSING_REPORT'
      ),
    [exceptionsData, currentUserEmail]
  )

  return (
    <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column' }}>
      <TabsNavigation activeTab={activeTab} onTabChange={setActiveTab} isTechnician={true} />
      
      {activeTab === 'service' && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
            <KpiCard label="ביקורים היום" value={myScheduleToday.length} accent="#faad14" />
            <KpiCard label="פעולות פתוחות שלי" value={myOpenOps.length} accent="#579bfc" />
          </div>

          <SectionTitle count={myScheduleToday.length}>הביקורים שלי היום</SectionTitle>
          {myScheduleToday.length === 0 ? (
            <div style={{ color: '#666', fontSize: 13, padding: '8px 0' }}>אין ביקורים מתוזמנים להיום</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myScheduleToday.map((s) => {
                const timeLabel = s.plannedDateTime
                  ? new Date(s.plannedDateTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
                  : 'שעה לא ידועה'
                return (
                  <div
                    key={s.id}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 18, minWidth: 48, textAlign: 'center', color: '#faad14', fontWeight: 700 }}>
                      {timeLabel}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#ddd' }}>{s.operationId ?? s.operationIdRef ?? 'פעולה לא מזוהה'}</div>
                      {s.taskType && <div style={{ fontSize: 11, color: '#777' }}>{s.taskType}</div>}
                    </div>
                    {s.controlStatus && (
                      <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 7px', color: '#aaa' }}>
                        {s.controlStatus}
                      </span>
                    )}
                    <MondayBadge boardId="1783389345" itemId={s.id} />
                  </div>
                )
              })}
            </div>
          )}

          {myExceptions.length > 0 && (
            <>
              <SectionTitle count={myExceptions.length}>דוחות חסרים שדורשים דיווח</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myExceptions.map((ex) => (
                  <div
                    key={ex.id}
                    style={{
                      background: 'rgba(255,77,79,0.06)',
                      border: '1px solid rgba(255,77,79,0.2)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#ddd', fontWeight: 600 }}>
                        פעולה {ex.operationId ?? ex.scheduleEntryId}
                      </div>
                      <div style={{ fontSize: 11, color: '#ff4d4f', marginTop: 2 }}>
                        {ex.message || EXCEPTION_CODE_LABEL[ex.code] || 'חסר דוח ביצוע'}
                      </div>
                    </div>
                    {ex.operationId && <MondayBadge boardId="1798247340" itemId={ex.operationId} />}
                  </div>
                ))}
              </div>
            </>
          )}

          <SectionTitle count={myOpenOps.length}>הפעולות הפתוחות שלי</SectionTitle>
          {myOpenOps.length === 0 ? (
            <div style={{ color: '#52c41a', fontSize: 13, padding: '8px 0' }}>אין פעולות פתוחות</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myOpenOps.map((op) => (
                <div
                  key={op.id}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#ddd', fontWeight: 600 }}>
                      {op.shortOperationId ?? op.id}
                    </div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
                      {[op.operationCategory, op.businessStatus].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <MondayBadge boardId="1798247340" itemId={op.id} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'projects' && (
        <ProjectsTab operationsData={operationsData} />
      )}
      
      {activeTab === 'procurement' && (
        <ProcurementTab operationsData={operationsData} />
      )}

      {activeTab === 'logistics' && (
        <LogisticsTab operationsData={operationsData} />
      )}
    </div>
  )
}

// ─── loading skeleton ──────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 4px' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 80,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
      <div style={{ height: 120, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }} />
      <div style={{ height: 180, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }} />
    </div>
  )
}

// ─── main export ───────────────────────────────────────────────────────────

export function HomeDashboard({
  currentUserEmail,
  currentUserRole,
  operationsData,
  exceptionsData,
  scheduleEntriesData,
  reportsData,
  usersData,
  assignmentsData = [],
  projectionsData,
  isLoading,
}: HomeDashboardProps) {
  if (isLoading) return <LoadingSkeleton />

  if (currentUserRole === 'Technician') {
    return (
      <TechnicianDashboard
        currentUserEmail={currentUserEmail}
        operationsData={operationsData}
        scheduleEntriesData={scheduleEntriesData}
        exceptionsData={exceptionsData}
      />
    )
  }

  return (
    <ManagerDashboard
      operationsData={operationsData}
      exceptionsData={exceptionsData}
      scheduleEntriesData={scheduleEntriesData}
      reportsData={reportsData}
      usersData={usersData}
      assignmentsData={assignmentsData}
      projectionsData={projectionsData}
    />
  )
}
