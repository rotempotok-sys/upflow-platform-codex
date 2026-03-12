import { useMemo, useState } from 'react'
import type { RuntimeOperationSnapshot, RuntimeUserSnapshot } from '../../../types/scheduling'
import { OperationDetailModal } from './OperationDetailModal'

// ─── shared table helpers ─────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'
type SortCol = 'shortOperationId' | 'title' | 'requestPurposeRaw' | 'operationContent' | 'businessStatus' | 'executionStatus' | 'techName'

function uniq(arr: string[]) { return [...new Set(arr.filter(Boolean))].sort() }

function sortRows(rows: ProjectRow[], col: SortCol, dir: SortDir): ProjectRow[] {
  return [...rows].sort((a, b) => {
    const va = col === 'shortOperationId' ? a.op.shortOperationId ?? ''
      : col === 'title' ? a.op.title ?? ''
      : col === 'requestPurposeRaw' ? a.op.requestPurposeRaw ?? ''
      : col === 'operationContent' ? a.op.operationContent ?? ''
      : col === 'businessStatus' ? a.op.businessStatus ?? ''
      : col === 'executionStatus' ? a.op.executionStatus ?? ''
      : a.techName
    const vb = col === 'shortOperationId' ? b.op.shortOperationId ?? ''
      : col === 'title' ? b.op.title ?? ''
      : col === 'requestPurposeRaw' ? b.op.requestPurposeRaw ?? ''
      : col === 'operationContent' ? b.op.operationContent ?? ''
      : col === 'businessStatus' ? b.op.businessStatus ?? ''
      : col === 'executionStatus' ? b.op.executionStatus ?? ''
      : b.techName
    return dir === 'asc' ? va.localeCompare(vb, 'he') : vb.localeCompare(va, 'he')
  })
}

interface ProjectRow { op: RuntimeOperationSnapshot; techName: string }

function Th({ label, col, sortCol, sortDir, onSort, children }: {
  label: string; col: SortCol; sortCol: SortCol | null; sortDir: SortDir
  onSort: (c: SortCol) => void; children?: React.ReactNode
}) {
  const active = sortCol === col
  return (
    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: '#1a1a1a', borderBottom: '2px solid rgba(255,255,255,0.12)', padding: 0, whiteSpace: 'nowrap', userSelect: 'none' }}>
      <div style={{ padding: '8px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button onClick={() => onSort(col)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: active ? '#579bfc' : '#999', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: 0.5, padding: 0 }}>
          {label}
          <span style={{ fontSize: 10, opacity: active ? 1 : 0.3 }}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
        </button>
        {children}
      </div>
    </th>
  )
}

function FilterSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: value ? '#fff' : '#555', fontSize: 10, padding: '2px 4px', width: '100%', maxWidth: 130 }}>
      <option value="">הכל</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function FilterInput({ value, onChange, placeholder = 'חיפוש...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#ddd', fontSize: 10, padding: '2px 6px', width: '100%', maxWidth: 140, outline: 'none' }} />
  )
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span style={{ color: '#444' }}>—</span>
  const isErr = value === 'Exception' || value === 'Delayed'
  return <span style={{ fontSize: 11, borderRadius: 4, padding: '1px 7px', background: isErr ? 'rgba(255,77,79,0.12)' : 'rgba(255,255,255,0.06)', color: isErr ? '#ff4d4f' : '#bbb' }}>{value}</span>
}

// ─── GenericOpTable ──────────────────────────────────────────────────────────

function GenericOpTable({
  ops, usersData, onRowClick, statusLabel = 'סטטוס ביצוע',
}: {
  ops: RuntimeOperationSnapshot[]
  usersData: RuntimeUserSnapshot[]
  onRowClick: (op: RuntimeOperationSnapshot) => void
  statusLabel?: string
}) {
  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [fId, setFId] = useState('')
  const [fTitle, setFTitle] = useState('')
  const [fPurpose, setFPurpose] = useState('')
  const [fContent, setFContent] = useState('')
  const [fBizStatus, setFBizStatus] = useState('')
  const [fExecStatus, setFExecStatus] = useState('')
  const [fTech, setFTech] = useState('')

  const techByEmail = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of usersData) if (u.email) m.set(u.email, u.displayName)
    return m
  }, [usersData])

  const rows = useMemo<ProjectRow[]>(() => ops.map(op => ({
    op,
    techName: techByEmail.get(op.assignedTechnicianEmail ?? '') ?? op.technicianNameHint ?? '',
  })), [ops, techByEmail])

  const purposeOptions = useMemo(() => uniq(rows.map(r => r.op.requestPurposeRaw ?? '')), [rows])
  const bizOptions = useMemo(() => uniq(rows.map(r => r.op.businessStatus ?? '')), [rows])
  const execOptions = useMemo(() => uniq(rows.map(r => r.op.executionStatus ?? '')), [rows])
  const techOptions = useMemo(() => uniq(rows.map(r => r.techName)), [rows])

  const filtered = useMemo(() => {
    let out = rows
    if (fId) out = out.filter(r => (r.op.shortOperationId ?? '').toLowerCase().includes(fId.toLowerCase()))
    if (fTitle) out = out.filter(r => (r.op.title ?? '').toLowerCase().includes(fTitle.toLowerCase()))
    if (fPurpose) out = out.filter(r => r.op.requestPurposeRaw === fPurpose)
    if (fContent) out = out.filter(r => (r.op.operationContent ?? '').toLowerCase().includes(fContent.toLowerCase()))
    if (fBizStatus) out = out.filter(r => r.op.businessStatus === fBizStatus)
    if (fExecStatus) out = out.filter(r => r.op.executionStatus === fExecStatus)
    if (fTech) out = out.filter(r => r.techName === fTech)
    return sortCol ? sortRows(out, sortCol, sortDir) : out
  }, [rows, fId, fTitle, fPurpose, fContent, fBizStatus, fExecStatus, fTech, sortCol, sortDir])

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const activeFilters = [fId, fTitle, fPurpose, fContent, fBizStatus, fExecStatus, fTech, sortCol].filter(Boolean).length

  function reset() { setFId(''); setFTitle(''); setFPurpose(''); setFContent(''); setFBizStatus(''); setFExecStatus(''); setFTech(''); setSortCol(null) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}} .op-row:hover{background:rgba(87,155,252,0.06)!important} .op-row td{border-bottom:1px solid rgba(255,255,255,0.05)}`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeIn 0.3s ease' }}>
        <span style={{ fontSize: 12, color: '#666' }}>{filtered.length} / {rows.length} רשומות</span>
        {activeFilters > 0 && (
          <button onClick={reset} style={{ fontSize: 11, background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.3)', borderRadius: 5, color: '#ff4d4f', padding: '3px 10px', cursor: 'pointer' }}>
            נקה סינון ({activeFilters})
          </button>
        )}
      </div>

      <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
          <thead>
            <tr>
              <Th label="מזהה" col="shortOperationId" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                <FilterInput value={fId} onChange={setFId} />
              </Th>
              <Th label="שם האופרציה" col="title" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                <FilterInput value={fTitle} onChange={setFTitle} />
              </Th>
              <Th label="מטרת הפניה" col="requestPurposeRaw" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                <FilterSelect value={fPurpose} options={purposeOptions} onChange={setFPurpose} />
              </Th>
              <Th label="תוכן הפניה" col="operationContent" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                <FilterInput value={fContent} onChange={setFContent} />
              </Th>
              <Th label="סטטוס אופרציה" col="businessStatus" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                <FilterSelect value={fBizStatus} options={bizOptions} onChange={setFBizStatus} />
              </Th>
              <Th label={statusLabel} col="executionStatus" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                <FilterSelect value={fExecStatus} options={execOptions} onChange={setFExecStatus} />
              </Th>
              <Th label="טכנאי" col="techName" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
                <FilterSelect value={fTech} options={techOptions} onChange={setFTech} />
              </Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: '#555', fontSize: 13 }}>אין נתונים תואמים לסינון</td></tr>
            )}
            {filtered.map(({ op, techName }) => {
              const isDelayed = op.executionStatus === 'Exception' || op.businessStatus === 'Delayed'
              const isUnassigned = !op.assignedTechnicianEmail
              return (
                <tr key={op.id} className="op-row" onClick={() => onRowClick(op)} style={{ cursor: 'pointer', background: isDelayed ? 'rgba(255,77,79,0.04)' : isUnassigned ? 'rgba(255,122,0,0.03)' : 'transparent' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: isDelayed ? '#ff4d4f' : '#777', whiteSpace: 'nowrap' }}>
                    {op.shortOperationId ?? '—'}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#ddd', maxWidth: 180 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.title ?? '—'}</div>
                  </td>
                  <td style={{ padding: '8px 10px', color: '#aaa', whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {op.requestPurposeRaw ?? '—'}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#888', minWidth: 220, maxWidth: 320 }}>
                    {op.operationContent ? (
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={op.operationContent}>{op.operationContent}</div>
                    ) : <span style={{ color: '#444', fontStyle: 'italic', fontSize: 10 }}>—</span>}
                  </td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}><StatusBadge value={op.businessStatus} /></td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}><StatusBadge value={op.executionStatus} /></td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    {techName ? (
                      <span style={{ fontSize: 11, color: '#52c41a', background: 'rgba(82,196,26,0.08)', padding: '1px 7px', borderRadius: 4 }}>{techName}</span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#ff7a00', background: 'rgba(255,122,0,0.1)', padding: '1px 7px', borderRadius: 4 }}>ללא שיבוץ</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── ProjectsTab ──────────────────────────────────────────────────────────────

export function ProjectsTab({ operationsData, usersData = [] }: { operationsData: RuntimeOperationSnapshot[]; usersData?: RuntimeUserSnapshot[] }) {
  const [selectedOp, setSelectedOp] = useState<RuntimeOperationSnapshot | null>(null)
  const openOps = useMemo(
    () => operationsData.filter(o => (o.operationCategory === 'פרויקט' || o.requestPurposeRaw?.includes('פרויקט')) && o.isOpen),
    [operationsData]
  )
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>פרויקטים פעילים</span>
        <span style={{ fontSize: 11, color: '#666', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '1px 8px' }}>{openOps.length}</span>
      </div>
      <GenericOpTable ops={openOps} usersData={usersData} onRowClick={setSelectedOp} statusLabel="סטטוס ביצוע" />
      {selectedOp && <OperationDetailModal op={selectedOp} onClose={() => setSelectedOp(null)} />}
    </>
  )
}
