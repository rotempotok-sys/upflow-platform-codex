import { useMemo } from 'react'
import type {
  RuntimeExceptionSnapshot,
  RuntimeOperationSnapshot,
  RuntimeScheduleEntrySnapshot,
  RuntimeUserSnapshot,
  RuntimeOperationalProjections,
  FacilityRecord,
} from '../../types/scheduling'

interface HomeDashboardProps {
  currentUserEmail: string | null
  currentUserRole: string | null
  operationsData: RuntimeOperationSnapshot[]
  exceptionsData: RuntimeExceptionSnapshot[]
  scheduleEntriesData: RuntimeScheduleEntrySnapshot[]
  usersData: RuntimeUserSnapshot[]
  facilitiesData: FacilityRecord[]
  projectionsData: RuntimeOperationalProjections | null
  isLoading?: boolean
}

// ─── helpers ───────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const SEVERITY_LABEL: Record<string, string> = { critical: 'קריטי', high: 'גבוה', medium: 'בינוני', low: 'נמוך' }
const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ff4d4f',
  high: '#ff7a00',
  medium: '#faad14',
  low: '#52c41a',
}

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

// ─── manager / CEO dashboard ───────────────────────────────────────────────

function ManagerDashboard({
  operationsData,
  exceptionsData,
  scheduleEntriesData,
  usersData,
  facilitiesData,
  projectionsData,
}: Omit<HomeDashboardProps, 'currentUserEmail' | 'currentUserRole' | 'isLoading'>) {
  const todayStr = today()

  // ── KPI calculations ──

  const unassignedOps = useMemo(
    () => operationsData.filter((o) => o.isOpen && !o.assignedTechnicianEmail),
    [operationsData]
  )

  const openOps = useMemo(() => operationsData.filter((o) => o.isOpen), [operationsData])

  const criticalExceptions = useMemo(
    () => exceptionsData.filter((e) => e.severity === 'critical' || e.severity === 'high').length,
    [exceptionsData]
  )

  const todayEntries = useMemo(
    () =>
      scheduleEntriesData.filter((s) => {
        const day = isoDay(s.plannedDateTime ?? s.plannedDate)
        return day === todayStr
      }),
    [scheduleEntriesData, todayStr]
  )

  // group exceptions by severity then code
  const exceptionGroups = useMemo(() => {
    const byCode: Record<string, { code: string; severity: string; count: number; items: RuntimeExceptionSnapshot[] }> = {}
    for (const ex of exceptionsData) {
      const key = ex.code
      if (!byCode[key]) byCode[key] = { code: ex.code, severity: ex.severity, count: 0, items: [] }
      byCode[key].count += 1
      byCode[key].items.push(ex)
    }
    return Object.values(byCode).sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || b.count - a.count
    )
  }, [exceptionsData])

  // today's schedule grouped by technician
  const todayByTechnician = useMemo(() => {
    const map = new Map<string, { name: string; email: string; entries: RuntimeScheduleEntrySnapshot[] }>()
    for (const entry of todayEntries) {
      const email = entry.technicianEmail ?? 'unassigned'
      if (!map.has(email)) {
        // try to find display name from users
        const user = usersData.find((u) => u.email === email)
        map.set(email, { name: user?.displayName ?? email, email, entries: [] })
      }
      map.get(email)!.entries.push(entry)
    }
    // sort entries within each technician by time
    for (const group of map.values()) {
      group.entries.sort((a, b) => {
        const ta = String(a.plannedDateTime ?? a.plannedDate ?? '')
        const tb = String(b.plannedDateTime ?? b.plannedDate ?? '')
        return ta.localeCompare(tb)
      })
    }
    return [...map.values()].sort((a, b) => b.entries.length - a.entries.length)
  }, [todayEntries, usersData])

  // technician load from projections
  const techRows = useMemo(() => {
    const rows = projectionsData?.technicianView.rows ?? []
    return [...rows]
      .filter((r) => r.counts.openOperations > 0)
      .sort((a, b) => b.counts.openOperations - a.counts.openOperations)
      .slice(0, 8)
  }, [projectionsData])

  const maxTechLoad = useMemo(() => Math.max(...techRows.map((r) => r.counts.openOperations), 1), [techRows])

  // facilities with open operations
  const facilityRows = useMemo(() => {
    const rows = projectionsData?.facilityView.rows ?? []
    return [...rows]
      .filter((r) => r.counts.openOperations > 0)
      .sort((a, b) => b.counts.openOperations - a.counts.openOperations)
      .slice(0, 12)
  }, [projectionsData])

  return (
    <div style={{ padding: '0 4px' }}>
      {/* ── KPI row ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <KpiCard
          label="ללא שיבוץ"
          value={unassignedOps.length}
          accent={unassignedOps.length > 0 ? '#ff7a00' : '#52c41a'}
        />
        <KpiCard label="ביקורים היום" value={todayEntries.length} accent="#faad14" />
        <KpiCard
          label="חריגות"
          value={criticalExceptions}
          accent={criticalExceptions > 0 ? '#ff4d4f' : '#52c41a'}
          sub={criticalExceptions > 0 ? 'קריטיות/גבוהות' : 'הכל תקין'}
        />
        <KpiCard label="פתוחות סה״כ" value={openOps.length} accent="#579bfc" />
      </div>

      {/* ── Unassigned operations ── */}
      {unassignedOps.length > 0 && (
        <>
          <SectionTitle count={unassignedOps.length}>ממתינות לשיבוץ טכנאי</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unassignedOps.slice(0, 10).map((op) => (
              <div
                key={op.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'rgba(255,122,0,0.06)',
                  border: '1px solid rgba(255,122,0,0.2)',
                  borderRadius: 8,
                  padding: '8px 12px',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: '#ff7a00', minWidth: 50 }}>
                  {op.shortOperationId ?? '—'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {op.requestPurposeRaw ?? op.operationCategory ?? 'ללא פרטים'}
                  </div>
                  <div style={{ fontSize: 11, color: '#777' }}>
                    {[op.businessStatus, op.executionStatus].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <MondayBadge boardId="1798247340" itemId={op.id} />
              </div>
            ))}
            {unassignedOps.length > 10 && (
              <div style={{ fontSize: 12, color: '#666', padding: '4px 12px' }}>
                + {unassignedOps.length - 10} נוספות
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Today's schedule by technician ── */}
      {todayByTechnician.length > 0 && (
        <>
          <SectionTitle count={todayEntries.length}>לוח זמנים להיום</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {todayByTechnician.map((group) => (
              <div key={group.email}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#579bfc', flexShrink: 0 }} />
                  {group.name}
                  <span style={{ fontSize: 11, color: '#555', fontWeight: 400 }}>({group.entries.length} ביקורים)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 14 }}>
                  {group.entries.map((s) => {
                    const timeLabel = s.plannedDateTime
                      ? new Date(s.plannedDateTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
                      : '—:—'
                    return (
                      <div
                        key={s.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 6,
                          padding: '6px 10px',
                          fontSize: 13,
                        }}
                      >
                        <span style={{ fontWeight: 700, color: '#faad14', minWidth: 40, textAlign: 'center' }}>
                          {timeLabel}
                        </span>
                        <span style={{ color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.operationId ?? s.operationIdRef ?? 'פעולה'}
                          {s.taskType && <span style={{ color: '#666', marginRight: 6 }}> · {s.taskType}</span>}
                        </span>
                        {s.controlStatus && (
                          <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 6px', color: '#888' }}>
                            {s.controlStatus}
                          </span>
                        )}
                        <MondayBadge boardId="1783389345" itemId={s.id} />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {todayEntries.length === 0 && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, color: '#666', fontSize: 13 }}>
          אין ביקורים מתוזמנים להיום
        </div>
      )}

      {/* ── Exceptions ── */}
      {exceptionGroups.length > 0 && (
        <>
          <SectionTitle count={exceptionsData.length}>חריגות פעילות</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {exceptionGroups.map((g) => (
              <div
                key={g.code}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${SEVERITY_COLOR[g.severity] ?? '#444'}40`,
                  borderRadius: 8,
                  padding: '7px 12px',
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: SEVERITY_COLOR[g.severity] ?? '#888',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: '#ddd' }}>{EXCEPTION_CODE_LABEL[g.code] ?? g.code}</span>
                <span
                  style={{
                    fontWeight: 800,
                    color: SEVERITY_COLOR[g.severity] ?? '#fff',
                    fontSize: 14,
                    minWidth: 20,
                    textAlign: 'center',
                  }}
                >
                  {g.count}
                </span>
                <span style={{ fontSize: 10, color: '#666' }}>{SEVERITY_LABEL[g.severity] ?? g.severity}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {exceptionsData.length === 0 && (
        <div
          style={{
            marginTop: 16,
            padding: '12px 16px',
            background: 'rgba(82,196,26,0.08)',
            border: '1px solid rgba(82,196,26,0.3)',
            borderRadius: 8,
            color: '#52c41a',
            fontSize: 13,
          }}
        >
          אין חריגות פעילות
        </div>
      )}

      {/* ── Technician load ── */}
      {techRows.length > 0 && (
        <>
          <SectionTitle>עומס טכנאים</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {techRows.map((r) => (
              <div key={r.technicianEmail} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 120, fontSize: 13, color: '#ccc', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.technicianName}
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 20, position: 'relative', overflow: 'hidden' }}>
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      height: '100%',
                      width: `${Math.round((r.counts.openOperations / maxTechLoad) * 100)}%`,
                      background: r.counts.highPriorityOpenOperations > 0 ? '#ff7a00' : '#579bfc',
                      borderRadius: 6,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
                <div style={{ width: 24, fontSize: 13, fontWeight: 700, color: '#fff', textAlign: 'left', flexShrink: 0 }}>
                  {r.counts.openOperations}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Facility status ── */}
      {facilityRows.length > 0 && (
        <>
          <SectionTitle>מתקנים עם פעולות פתוחות</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {facilityRows.map((f) => {
              const hasUnassigned = f.counts.unassignedOpenOperations > 0
              const hasHighPriority = f.counts.highPriorityOpenOperations > 0
              const accent = hasHighPriority ? '#ff4d4f' : hasUnassigned ? '#faad14' : '#579bfc'
              return (
                <div
                  key={f.facilityId}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${accent}40`,
                    borderRadius: 8,
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.facilityName}
                  </div>
                  {f.clientName && (
                    <div style={{ fontSize: 11, color: '#777', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.clientName}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, background: `${accent}22`, color: accent, borderRadius: 4, padding: '2px 6px' }}>
                      {f.counts.openOperations} פתוחות
                    </span>
                    {hasUnassigned && (
                      <span style={{ fontSize: 11, background: '#faad1422', color: '#faad14', borderRadius: 4, padding: '2px 6px' }}>
                        {f.counts.unassignedOpenOperations} ללא טכנאי
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── technician dashboard ──────────────────────────────────────────────────

function TechnicianDashboard({
  currentUserEmail,
  operationsData,
  scheduleEntriesData,
}: {
  currentUserEmail: string | null
  operationsData: RuntimeOperationSnapshot[]
  scheduleEntriesData: RuntimeScheduleEntrySnapshot[]
}) {
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

  return (
    <div style={{ padding: '0 4px' }}>
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
  usersData,
  facilitiesData,
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
      />
    )
  }

  return (
    <ManagerDashboard
      operationsData={operationsData}
      exceptionsData={exceptionsData}
      scheduleEntriesData={scheduleEntriesData}
      usersData={usersData}
      facilitiesData={facilitiesData}
      projectionsData={projectionsData}
    />
  )
}
