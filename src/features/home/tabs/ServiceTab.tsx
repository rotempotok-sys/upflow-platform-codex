import { useMemo, useState } from 'react'
import type {
  RuntimeOperationSnapshot,
  RuntimeExceptionSnapshot,
  RuntimeScheduleEntrySnapshot,
  RuntimeUserSnapshot,
  RuntimeOperationalProjections,
} from '../../../types/scheduling'
import { OperationDetailModal } from './OperationDetailModal'
import { useGoogleCalendarEvents } from '../../calendar/useGoogleCalendarEvents'

// ─── types ────────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'
type SortCol =
  | 'shortOperationId'
  | 'title'
  | 'requestPurposeRaw'
  | 'operationContent'
  | 'eventDate'
  | 'businessStatus'
  | 'executionStatus'
  | 'techName'

interface RowData {
  op: RuntimeOperationSnapshot
  techName: string
  eventDateRaw: string
  eventDateDisplay: string
  facilityName: string
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10) }
function isoDay(dt: string | null | undefined) { return String(dt ?? '').slice(0, 10) }

function uniq(arr: string[]) { return [...new Set(arr.filter(Boolean))].sort() }

const TECHNICIANS = [
  { id: 'nimrod', name: 'נמרוד כפרי' },
  { id: 'or', name: 'אור ויינשטיין' },
  { id: 'idan', name: 'עידן קורן' },
  { id: 'dani', name: 'דני בורדה' },
  { id: 'ran', name: 'רן שחם' },
  { id: 'sivan', name: 'סיוון שפר' },
]

function sortRows(rows: RowData[], col: SortCol, dir: SortDir): RowData[] {
  return [...rows].sort((a, b) => {
    let va = '', vb = ''
    if (col === 'shortOperationId') { va = a.op.shortOperationId ?? ''; vb = b.op.shortOperationId ?? '' }
    else if (col === 'title') { va = a.op.title ?? ''; vb = b.op.title ?? '' }
    else if (col === 'requestPurposeRaw') { va = a.op.requestPurposeRaw ?? ''; vb = b.op.requestPurposeRaw ?? '' }
    else if (col === 'operationContent') { va = a.op.operationContent ?? ''; vb = b.op.operationContent ?? '' }
    else if (col === 'eventDate') { va = a.eventDateRaw; vb = b.eventDateRaw }
    else if (col === 'businessStatus') { va = a.op.businessStatus ?? ''; vb = b.op.businessStatus ?? '' }
    else if (col === 'executionStatus') { va = a.op.executionStatus ?? ''; vb = b.op.executionStatus ?? '' }
    else if (col === 'techName') { va = a.techName; vb = b.techName }
    const cmp = va.localeCompare(vb, 'he')
    return dir === 'asc' ? cmp : -cmp
  })
}

// ─── mini-components ─────────────────────────────────────────────────────────

function Th({
  label, col, sortCol, sortDir, onSort, children,
}: {
  label: string
  col: SortCol
  sortCol: SortCol | null
  sortDir: SortDir
  onSort: (col: SortCol) => void
  children?: React.ReactNode
}) {
  const active = sortCol === col
  return (
    <th
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        background: '#1a1a1a',
        borderBottom: '2px solid rgba(255,255,255,0.12)',
        padding: 0,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <div
        style={{ padding: '8px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        <button
          onClick={() => onSort(col)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: active ? '#579bfc' : '#999',
            fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
            textTransform: 'uppercase', letterSpacing: 0.5, padding: 0,
          }}
        >
          {label}
          <span style={{ fontSize: 10, opacity: active ? 1 : 0.3 }}>
            {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
          </span>
        </button>
        {children}
      </div>
    </th>
  )
}

function FilterSelect({
  value, options, onChange,
}: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
        color: value ? '#fff' : '#555', fontSize: 10, padding: '2px 4px',
        width: '100%', maxWidth: 120,
      }}
    >
      <option value="">הכל</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function FilterInput({
  value, onChange, placeholder = 'חיפוש...',
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
        color: '#ddd', fontSize: 10, padding: '2px 6px', width: '100%', maxWidth: 140,
        outline: 'none',
      }}
    />
  )
}

// ─── ServiceTab ───────────────────────────────────────────────────────────────

export function ServiceTab({
  operationsData,
  exceptionsData,
  scheduleEntriesData,
  usersData,
  projectionsData,
}: {
  operationsData: RuntimeOperationSnapshot[]
  exceptionsData: RuntimeExceptionSnapshot[]
  scheduleEntriesData: RuntimeScheduleEntrySnapshot[]
  usersData: RuntimeUserSnapshot[]
  projectionsData: RuntimeOperationalProjections | null
}) {
  const todayStr = today()
  const [selectedOp, setSelectedOp] = useState<RuntimeOperationSnapshot | null>(null)
  const [sortCol, setSortCol] = useState<SortCol | null>('eventDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { events, isLoading: isCalendarLoading, error: calendarError } = useGoogleCalendarEvents()

  // ─── Filter state ───────────────────────────────────────────────
  const [fId, setFId] = useState('')
  const [fTitle, setFTitle] = useState('')
  const [fPurpose, setFPurpose] = useState('')
  const [fContent, setFContent] = useState('')
  const [fDate, setFDate] = useState('')
  const [fBizStatus, setFBizStatus] = useState('')
  const [fExecStatus, setFExecStatus] = useState('')
  const [fTech, setFTech] = useState('')

  // ─── Lookup maps ───────────────────────────────────────────────
  const techByEmail = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of usersData) if (u.email) m.set(u.email, u.displayName)
    return m
  }, [usersData])

  const eventByOpId = useMemo(() => {
    const m = new Map<string, { raw: string, display: string }>()
    
    const calEventsById = new Map<string, any>()
    for (const e of events) {
      if (e.id) calEventsById.set(e.id, e)
      if (e.iCalUID) {
        calEventsById.set(e.iCalUID, e)
        calEventsById.set(e.iCalUID.replace('@google.com', ''), e)
      }
      if (e.htmlLink) {
        const urlParams = new URLSearchParams(e.htmlLink.split('?')[1] || '')
        const eid = urlParams.get('eid')
        if (eid) calEventsById.set(eid, e)
      }
    }

    const findEventStr = (ref: string | null | undefined) => {
      if (!ref) return null
      const cleanRef = String(ref).trim()
      if (calEventsById.has(cleanRef)) return calEventsById.get(cleanRef)
      const lowerRef = cleanRef.toLowerCase()
      for (const e of events) {
        if (
          e.id === cleanRef ||
          e.iCalUID === cleanRef ||
          (typeof e.id === 'string' && e.id.toLowerCase().includes(lowerRef)) ||
          (typeof e.htmlLink === 'string' && e.htmlLink.toLowerCase().includes(lowerRef)) ||
          (typeof e.iCalUID === 'string' && e.iCalUID.toLowerCase().includes(lowerRef))
        ) {
          return e
        }
      }
      return null
    }

    const claimedEventIds = new Set<string>()

    const sorted = [...scheduleEntriesData]
      .filter(s => s.operationId)
      .sort((a, b) => {
        const aEvent = findEventStr(a.calendarEventRef)
        const bEvent = findEventStr(b.calendarEventRef)
        const aHasGcal = aEvent ? 1 : 0
        const bHasGcal = bEvent ? 1 : 0
        if (aHasGcal !== bHasGcal) return bHasGcal - aHasGcal
        return String(b.plannedDateTime).localeCompare(String(a.plannedDateTime))
      })
      
    for (const s of sorted) {
      if (!m.has(s.operationId!)) {
        let rawDate = s.plannedDateTime
        
        // Match with robust link resolving
        const ce = findEventStr(s.calendarEventRef)
        if (ce) {
          const ceDate = ce.start?.dateTime || ce.start?.date
          if (ceDate) {
            rawDate = ceDate
            if (ce.id) claimedEventIds.add(ce.id)
            if (ce.iCalUID) claimedEventIds.add(ce.iCalUID)
          }
        }

        if (rawDate) {
          const d = new Date(rawDate)
          const dd = String(d.getDate()).padStart(2, '0')
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const yyyy = d.getFullYear()
          m.set(s.operationId!, { raw: rawDate, display: `${dd}/${mm}/${yyyy}` })
        }
      }
    }
    return { map: m, claimedEventIds, findEventStr }
  }, [scheduleEntriesData, events])

  const syntheticOps = useMemo(() => {
    const unmapped: RowData[] = []
    for (const e of events) {
      if (e.id && eventByOpId.claimedEventIds.has(e.id)) continue
      if (e.iCalUID && eventByOpId.claimedEventIds.has(e.iCalUID)) continue

      const ceDate = e.start?.dateTime || e.start?.date
      if (!ceDate) continue

      const d = new Date(ceDate)
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      const displayDate = `${dd}/${mm}/${yyyy}`

      let techName = ''
      const haystack = [(e.summary || ''), (e.description || ''), (e.location || '')].join(' ').toLowerCase()
      for (const t of TECHNICIANS) {
        if (haystack.includes(t.name) || haystack.includes(t.id)) {
          techName = t.name
          break
        }
      }

      const fakeOp: RuntimeOperationSnapshot = {
        id: `cal-${e.id}`,
        shortOperationId: `יומן-${e.id.slice(0, 4)}`,
        title: e.summary || 'אירוע יומן ללא כותרת',
        operationContent: e.description || '',
        requestPurposeRaw: 'משימת יומן',
        operationCategory: 'שירות',
        businessStatus: null,
        operationStatus: null,
        operationGroupStatus: null,
        salesStatus: null,
        procurementStatus: null,
        technicianNameHint: null,
        isOpen: true,
        clientItemId: null,
        facilityItemId: null,
        facilityLinkageState: 'missing_client_facility_link',
        technicianLinkageState: 'unlinked',
        assignedTechnicianEmail: null,
        executionStatus: 'Scheduled',
      }
      
      unmapped.push({
        op: fakeOp,
        techName,
        eventDateRaw: ceDate,
        eventDateDisplay: displayDate,
        facilityName: e.location || '',
      })
    }
    return unmapped
  }, [events, eventByOpId])

  // operationId → schedule status (from schedule board's 'status' column)
  const scheduleStatusByOpId = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of scheduleEntriesData) {
      if (s.operationId && s.scheduleStatus && !m.has(s.operationId)) {
        m.set(s.operationId, s.scheduleStatus)
      }
    }
    return m
  }, [scheduleEntriesData])

  const facilityByOpId = useMemo(() => {
    const m = new Map<string, string>()
    for (const row of projectionsData?.operationView?.rows ?? []) {
      if (row.facilityName) m.set(row.operationId, row.facilityName)
    }
    return m
  }, [projectionsData])

  // ─── Rows ──────────────────────────────────────────────────────
  const serviceOps = useMemo(() => operationsData.filter((o) => {
    const cat = o.operationCategory ?? ''
    const p = o.requestPurposeRaw ?? ''
    const isOther =
      cat === 'רכש' || p.includes('רכש') ||
      cat === 'מכירות' || p.includes('מכירות') ||
      cat === 'לוגיסטיקה' || p.includes('לוגיסטיקה') || p.includes('שילוח') ||
      cat === 'פרויקט' || p.includes('פרויקט')
    return !isOther
  }), [operationsData])

  const rows = useMemo<RowData[]>(() => {
    const mondayRows = serviceOps.map((op) => {
      const event = eventByOpId.map.get(op.id)
      return {
        op,
        techName: techByEmail.get(op.assignedTechnicianEmail ?? '') ?? op.technicianNameHint ?? '',
        eventDateRaw: event?.raw ?? '',
        eventDateDisplay: event?.display ?? '',
        facilityName: facilityByOpId.get(op.id) ?? '',
      }
    })
    return [...mondayRows, ...syntheticOps]
  }, [serviceOps, techByEmail, eventByOpId, facilityByOpId, syntheticOps])

  // ─── Filter options ────────────────────────────────────────────
  const purposeOptions = useMemo(() => uniq(rows.map(r => r.op.requestPurposeRaw ?? '')), [rows])
  const bizOptions = useMemo(() => uniq(rows.map(r => r.op.businessStatus ?? '')), [rows])
  const execOptions = useMemo(() => uniq([...scheduleStatusByOpId.values()]), [scheduleStatusByOpId])
  const techOptions = useMemo(() => uniq(rows.map(r => r.techName)), [rows])

  // ─── Filtered + sorted ─────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let out = rows
    if (fId) out = out.filter(r => (r.op.shortOperationId ?? '').toLowerCase().includes(fId.toLowerCase()))
    if (fTitle) out = out.filter(r => (r.op.title ?? '').toLowerCase().includes(fTitle.toLowerCase()))
    if (fPurpose) out = out.filter(r => r.op.requestPurposeRaw === fPurpose)
    if (fContent) out = out.filter(r => (r.op.operationContent ?? '').toLowerCase().includes(fContent.toLowerCase()))
    if (fDate) out = out.filter(r => r.eventDateDisplay.includes(fDate))
    if (fBizStatus) out = out.filter(r => r.op.businessStatus === fBizStatus)
    if (fExecStatus) out = out.filter(r => (scheduleStatusByOpId.get(r.op.id) ?? '') === fExecStatus)
    if (fTech) out = out.filter(r => r.techName === fTech)
    return sortCol ? sortRows(out, sortCol, sortDir) : out
  }, [rows, fId, fTitle, fPurpose, fContent, fDate, fBizStatus, fExecStatus, fTech, sortCol, sortDir])

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function resetFilters() {
    setFId(''); setFTitle(''); setFPurpose(''); setFContent('')
    setFDate(''); setFBizStatus(''); setFExecStatus(''); setFTech('')
    setSortCol(null)
  }

  // ─── Schedule section ──────────────────────────────────────────
  const todayEntries = useMemo(
    () => scheduleEntriesData.filter(s => isoDay(s.plannedDateTime ?? s.plannedDate) === todayStr),
    [scheduleEntriesData, todayStr]
  )

  const SEVERITY_COLOR: Record<string, string> = {
    critical: '#ff4d4f', high: '#ff7a00', medium: '#faad14', low: '#52c41a',
  }
  const EXCEPTION_CODE_LABEL: Record<string, string> = {
    MISSING_TECHNICIAN: 'חסר טכנאי', MISSING_SCHEDULE: 'חסר תיזמון',
    MISSING_CALENDAR_LINK: 'חסר אירוע יומן', MISSING_REPORT: 'חסר דוח',
    OVERDUE_EXECUTION: 'ביצוע באיחור', AMBIGUOUS_FACILITY_MAPPING: 'מתקן לא ברור',
    ORPHAN_SCHEDULE_ENTRY: 'תיזמון עצמאי', ORPHAN_REPORT: 'דוח עצמאי',
  }

  const activeFilters = [fId, fTitle, fPurpose, fContent, fDate, fBizStatus, fExecStatus, fTech, sortCol].filter(Boolean).length

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.3s ease' }}>
        <style>{`
          @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
          .svc-row:hover { background: rgba(87,155,252,0.06) !important; }
          .svc-row td { border-bottom: 1px solid rgba(255,255,255,0.05); }
        `}</style>

        {/* Table header bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>
            פניות שירות פתוחות
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeIn 0.3s ease' }}>
        <span style={{ fontSize: 12, color: '#666' }}>
          {filteredRows.length} / {rows.length} אופרציות 
          {isCalendarLoading ? ' (טוען יומן גוגל...)' : ` (יומן גוגל: ${events.length} אירועים, ${syntheticOps.length} לא משוייכים)`}
          {calendarError && <span style={{ color: '#ff4d4f', marginLeft: 8 }}> שגיאת יומן: {calendarError}</span>}
        </span>
        {activeFilters > 0 && (
          <button onClick={resetFilters} style={{ fontSize: 11, background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.3)', borderRadius: 5, color: '#ff4d4f', padding: '3px 10px', cursor: 'pointer' }}>
              נקה סינון ({activeFilters})
            </button>
          )}
        </div>
          </span>
        </div>

        {/* Table */}
        <div style={{
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden',
          maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
            <thead>
              <tr>
                {/* ── Column headers ── */}
                <Th label="מזהה" col="shortOperationId" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                  <FilterInput value={fId} onChange={setFId} placeholder="חיפוש..." />
                </Th>
                <Th label="שם האופרציה" col="title" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                  <FilterInput value={fTitle} onChange={setFTitle} placeholder="חיפוש..." />
                </Th>
                <Th label="מטרת הפניה" col="requestPurposeRaw" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                  <FilterSelect value={fPurpose} options={purposeOptions} onChange={setFPurpose} />
                </Th>
                <Th label="תוכן הפניה" col="operationContent" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                  <FilterInput value={fContent} onChange={setFContent} placeholder="חיפוש..." />
                </Th>
                <Th label="תאריך" col="eventDate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                  <FilterInput value={fDate} onChange={setFDate} placeholder="DD/MM" />
                </Th>
                <Th label="סטטוס אופרציה" col="businessStatus" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                  <FilterSelect value={fBizStatus} options={bizOptions} onChange={setFBizStatus} />
                </Th>
                <Th label="סטטוס משימה" col="executionStatus" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                  <FilterSelect value={fExecStatus} options={execOptions} onChange={setFExecStatus} />
                </Th>
                <Th label="טכנאי" col="techName" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                  <FilterSelect value={fTech} options={techOptions} onChange={setFTech} />
                </Th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: '#555', fontSize: 13 }}>
                    אין נתונים תואמים לסינון
                  </td>
                </tr>
              )}
              {filteredRows.map(({ op, techName, eventDateDisplay, facilityName }) => {
                const isDelayed = op.executionStatus === 'Exception' || op.businessStatus === 'Delayed'
                const isUnassigned = !op.assignedTechnicianEmail
                return (
                  <tr
                    key={op.id}
                    className="svc-row"
                    onClick={() => setSelectedOp(op)}
                    style={{
                      cursor: 'pointer',
                      background: isDelayed
                        ? 'rgba(255,77,79,0.04)'
                        : isUnassigned
                        ? 'rgba(255,122,0,0.03)'
                        : 'transparent',
                    }}
                  >
                    {/* מזהה */}
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: isDelayed ? '#ff4d4f' : '#777', whiteSpace: 'nowrap' }}>
                      {op.shortOperationId ?? '—'}
                    </td>
                    {/* שם */}
                    <td style={{ padding: '8px 10px', color: '#ddd', maxWidth: 180 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {op.title ?? '—'}
                      </div>
                      {facilityName && (
                        <div style={{ fontSize: 10, color: '#8b6be8', margin: '2px 0' }}>🏢 {facilityName}</div>
                      )}
                    </td>
                    {/* מטרת הפניה */}
                    <td style={{ padding: '8px 10px', color: '#aaa', whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {op.requestPurposeRaw ?? '—'}
                    </td>
                    {/* תוכן הפניה */}
                    <td style={{ padding: '8px 10px', color: '#888', minWidth: 240, maxWidth: 320 }}>
                      {op.operationContent ? (
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={op.operationContent}>
                          {op.operationContent}
                        </div>
                      ) : (
                        <span style={{ color: '#444', fontStyle: 'italic', fontSize: 10 }}>—</span>
                      )}
                    </td>
                    {/* תאריך */}
                    <td style={{ padding: '8px 10px', color: eventDateDisplay ? '#faad14' : '#444', whiteSpace: 'nowrap' }}>
                      {eventDateDisplay || '—'}
                    </td>
                    {/* סטטוס אופרציה */}
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {op.businessStatus ? (
                        <span style={{
                          fontSize: 11, borderRadius: 4, padding: '1px 7px',
                          background: op.businessStatus === 'Delayed' ? 'rgba(255,77,79,0.12)' : 'rgba(255,255,255,0.06)',
                          color: op.businessStatus === 'Delayed' ? '#ff4d4f' : '#bbb',
                        }}>
                          {op.businessStatus}
                        </span>
                      ) : <span style={{ color: '#444' }}>—</span>}
                    </td>
                    {/* סטטוס משימה */}
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {(() => {
                        const sched = scheduleStatusByOpId.get(op.id)
                        if (!sched) return <span style={{ color: '#444' }}>—</span>
                        const isEx = sched === 'Exception' || sched.includes('שגיאה')
                        return (
                          <span style={{
                            fontSize: 11, borderRadius: 4, padding: '1px 7px',
                            background: isEx ? 'rgba(255,77,79,0.12)' : 'rgba(255,255,255,0.06)',
                            color: isEx ? '#ff4d4f' : '#bbb',
                          }}>{sched}</span>
                        )
                      })()}
                    </td>
                    {/* טכנאי */}
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {techName ? (
                        <span style={{ fontSize: 11, color: '#52c41a', background: 'rgba(82,196,26,0.08)', padding: '1px 7px', borderRadius: 4 }}>
                          {techName}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#ff7a00', background: 'rgba(255,122,0,0.1)', padding: '1px 7px', borderRadius: 4 }}>
                          ללא שיבוץ
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── לוח זמנים היום ── */}
        {todayEntries.length > 0 && (
          <>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 5 }}>
              לוח זמנים להיום
              <span style={{ fontSize: 11, fontWeight: 500, color: '#555', marginRight: 8 }}>({todayEntries.length})</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {todayEntries.map(s => {
                const timeLabel = s.plannedDateTime
                  ? new Date(s.plannedDateTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
                  : '—:—'
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 12px', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#faad14', minWidth: 38, textAlign: 'center', flexShrink: 0 }}>{timeLabel}</span>
                    <span style={{ color: '#ccc', flex: 1 }}>{s.operationId ?? s.operationIdRef ?? 'פעולה'}</span>
                    {s.taskType && <span style={{ color: '#666' }}>{s.taskType}</span>}
                    {s.controlStatus && <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 6px', color: '#888' }}>{s.controlStatus}</span>}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── חריגות ── */}
        {exceptionsData.length > 0 && (
          <>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 5 }}>
              חריגות פעילות
              <span style={{ fontSize: 11, fontWeight: 500, color: '#555', marginRight: 8 }}>({exceptionsData.length})</span>
            </h2>
            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'visible' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ background: '#1a1a1a', padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid rgba(255,255,255,0.12)', color: '#999', fontSize: 11, textTransform: 'uppercase' }}>מזהה</th>
                    <th style={{ background: '#1a1a1a', padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid rgba(255,255,255,0.12)', color: '#999', fontSize: 11, textTransform: 'uppercase' }}>שם האופרציה וחריגה</th>
                    <th style={{ background: '#1a1a1a', padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid rgba(255,255,255,0.12)', color: '#999', fontSize: 11, textTransform: 'uppercase' }}>מטרת הפניה</th>
                    <th style={{ background: '#1a1a1a', padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid rgba(255,255,255,0.12)', color: '#999', fontSize: 11, textTransform: 'uppercase' }}>תוכן הפניה</th>
                    <th style={{ background: '#1a1a1a', padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid rgba(255,255,255,0.12)', color: '#999', fontSize: 11, textTransform: 'uppercase' }}>תאריך</th>
                    <th style={{ background: '#1a1a1a', padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid rgba(255,255,255,0.12)', color: '#999', fontSize: 11, textTransform: 'uppercase' }}>סטטוס אופרציה</th>
                    <th style={{ background: '#1a1a1a', padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid rgba(255,255,255,0.12)', color: '#999', fontSize: 11, textTransform: 'uppercase' }}>סטטוס משימה</th>
                    <th style={{ background: '#1a1a1a', padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid rgba(255,255,255,0.12)', color: '#999', fontSize: 11, textTransform: 'uppercase' }}>טכנאי</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptionsData.map((ex, idx) => {
                    const op = ex.operationId ? operationsData.find(o => o.id === ex.operationId || o.shortOperationId === ex.operationId) : null
                    const tech = ex.technicianEmail ? techByEmail.get(ex.technicianEmail) ?? ex.technicianEmail : (op?.assignedTechnicianEmail ? techByEmail.get(op.assignedTechnicianEmail) : '')
                    const event = op ? eventByOpId.map.get(op.id) : null
                    const facilityName = op ? facilityByOpId.get(op.id) : ''
                    const isDelayed = op ? (op.executionStatus === 'Exception' || op.businessStatus === 'Delayed') : true
                    const isUnassigned = op ? !op.assignedTechnicianEmail : true

                    if (!op) {
                      return (
                        <tr key={ex.id || idx} className="svc-row">
                          <td colSpan={8} style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#888' }}>
                            <span style={{ fontSize: 11, background: `${SEVERITY_COLOR[ex.severity as string] ?? '#444'}20`, color: SEVERITY_COLOR[ex.severity as string] ?? '#aaa', padding: '2px 6px', borderRadius: 4, marginRight: 8 }}>
                              {EXCEPTION_CODE_LABEL[ex.code as string] ?? ex.code}
                            </span>
                            {ex.message} (חסר מידע על האופרציה: {ex.operationId})
                          </td>
                        </tr>
                      )
                    }

                    return (
                      <tr
                        key={ex.id || idx}
                        className="svc-row"
                        onClick={() => setSelectedOp(op)}
                        style={{
                          cursor: 'pointer',
                          background: isDelayed ? 'rgba(255,77,79,0.04)' : isUnassigned ? 'rgba(255,122,0,0.03)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: isDelayed ? '#ff4d4f' : '#777', whiteSpace: 'nowrap' }}>
                          {op.shortOperationId ?? '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#ddd', maxWidth: 180 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {op.title ?? '—'}
                          </div>
                          <div style={{ fontSize: 10, marginTop: 4, color: '#ff4d4f' }}>
                            <strong>{EXCEPTION_CODE_LABEL[ex.code as string] ?? ex.code}:</strong> {ex.message}
                          </div>
                          {facilityName && (
                            <div style={{ fontSize: 10, color: '#8b6be8', marginTop: 2 }}>🏢 {facilityName}</div>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#aaa', whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {op.requestPurposeRaw ?? '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#888', minWidth: 240, maxWidth: 320 }}>
                          {op.operationContent ? (
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={op.operationContent}>
                              {op.operationContent}
                            </div>
                          ) : (
                            <span style={{ color: '#444', fontStyle: 'italic', fontSize: 10 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', color: event?.display ? '#faad14' : '#444', whiteSpace: 'nowrap' }}>
                          {event?.display || '—'}
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          {op.businessStatus ? (
                            <span style={{
                              fontSize: 11, borderRadius: 4, padding: '1px 7px',
                              background: op.businessStatus === 'Delayed' ? 'rgba(255,77,79,0.12)' : 'rgba(255,255,255,0.06)',
                              color: op.businessStatus === 'Delayed' ? '#ff4d4f' : '#bbb',
                            }}>
                              {op.businessStatus}
                            </span>
                          ) : <span style={{ color: '#444' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          {(() => {
                            const sched = scheduleStatusByOpId.get(op.id)
                            if (!sched) return <span style={{ color: '#444' }}>—</span>
                            const isEx = sched === 'Exception' || sched.includes('שגיאה')
                            return (
                              <span style={{
                                fontSize: 11, borderRadius: 4, padding: '1px 7px',
                                background: isEx ? 'rgba(255,77,79,0.12)' : 'rgba(255,255,255,0.06)',
                                color: isEx ? '#ff4d4f' : '#bbb',
                              }}>{sched}</span>
                            )
                          })()}
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          {tech ? (
                            <span style={{ fontSize: 11, color: '#52c41a', background: 'rgba(82,196,26,0.08)', padding: '1px 7px', borderRadius: 4 }}>
                              {tech}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#ff7a00', background: 'rgba(255,122,0,0.1)', padding: '1px 7px', borderRadius: 4 }}>
                              ללא שיבוץ
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {selectedOp && <OperationDetailModal op={selectedOp} onClose={() => setSelectedOp(null)} />}
    </>
  )
}
