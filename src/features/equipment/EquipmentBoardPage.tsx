import { useMemo, useState } from 'react'
import { facilities as fallbackFacilities } from '../../data/facilitiesData'
import type { FacilityRecord } from '../../types/scheduling'

type FilterValue = string | 'הכל'
type PreviewKind = 'pdf' | 'image'
type SortDirection = 'asc' | 'desc'
type SortKey =
  | 'name'
  | 'connectedClient'
  | 'connectedPhone'
  | 'facilityType'
  | 'facilityStatus'
  | 'connectedContract'
  | 'connectedContractPeriod'

interface PreviewFileState {
  kind: PreviewKind
  label: string
  sourceUrl: string
  srcUrl: string
}

interface FacilityTableRow {
  facility: FacilityRecord
  name: string
  connectedClient: string
  connectedPhone: string
  facilityType: string
  facilityStatus: string
  connectedContract: string
  connectedContractPeriod: string
}

interface EquipmentBoardPageProps {
  facilitiesData?: FacilityRecord[]
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he'))
}

function statusTone(status: string) {
  if (status.includes('מושבת')) return 'badge badge-p1'
  if (status.includes('הרצה') || status.includes('הקמה')) return 'badge badge-p2'
  return 'badge badge-ok'
}

function getColumnDisplayValue(facility: FacilityRecord, id: string) {
  const column = facility.columns.find((entry) => entry.id === id)
  if (!column) return ''
  return column.text?.trim() || column.value?.trim() || ''
}

function extractUrls(value: string) {
  return Array.from(new Set(value.match(/https?:\/\/[^\s,]+/g) ?? []))
}

function detectPreviewKind(url: string): PreviewKind | null {
  try {
    const parsed = new URL(url)
    const decodedPath = decodeURIComponent(parsed.pathname).toLowerCase()

    if (decodedPath.endsWith('.pdf')) return 'pdf'
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(decodedPath)) return 'image'
  } catch {
    return null
  }

  return null
}

function nextSort(current: { key: SortKey; direction: SortDirection }, key: SortKey) {
  if (current.key !== key) return { key, direction: 'asc' as SortDirection }
  return { key, direction: current.direction === 'asc' ? ('desc' as SortDirection) : ('asc' as SortDirection) }
}

function sortIndicator(activeKey: SortKey, activeDirection: SortDirection, key: SortKey) {
  if (activeKey !== key) return '⇅'
  return activeDirection === 'asc' ? '↑' : '↓'
}

export function EquipmentBoardPage({ facilitiesData }: EquipmentBoardPageProps) {
  const sourceFacilities = facilitiesData && facilitiesData.length > 0 ? facilitiesData : fallbackFacilities

  const [query, setQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState<FilterValue>('הכל')
  const [statusFilter, setStatusFilter] = useState<FilterValue>('הכל')
  const [facilityTypeFilter, setFacilityTypeFilter] = useState<FilterValue>('הכל')
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' })
  const [selectedFacility, setSelectedFacility] = useState<FacilityRecord | null>(null)
  const [previewFile, setPreviewFile] = useState<PreviewFileState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const groups = useMemo(() => uniqueSorted(sourceFacilities.map((facility) => facility.group)), [sourceFacilities])
  const statuses = useMemo(() => uniqueSorted(sourceFacilities.map((facility) => facility.facilityStatus)), [sourceFacilities])
  const facilityTypes = useMemo(() => uniqueSorted(sourceFacilities.map((facility) => facility.facilityType)), [sourceFacilities])

  const filtered = useMemo(() => {
    return sourceFacilities.filter((facility) => {
      const normalizedQuery = query.trim().toLowerCase()
      const matchesQuery =
        normalizedQuery.length === 0 ||
        facility.name.toLowerCase().includes(normalizedQuery) ||
        facility.city.toLowerCase().includes(normalizedQuery) ||
        facility.id.toLowerCase().includes(normalizedQuery)

      const matchesGroup = groupFilter === 'הכל' || facility.group === groupFilter
      const matchesStatus = statusFilter === 'הכל' || facility.facilityStatus === statusFilter
      const matchesFacilityType = facilityTypeFilter === 'הכל' || facility.facilityType === facilityTypeFilter

      return matchesQuery && matchesGroup && matchesStatus && matchesFacilityType
    })
  }, [sourceFacilities, query, groupFilter, statusFilter, facilityTypeFilter])

  const rows = useMemo<FacilityTableRow[]>(() => {
    return filtered.map((facility) => ({
      facility,
      name: facility.name,
      connectedClient: getColumnDisplayValue(facility, 'lookup_mkv89pmq') || '—',
      connectedPhone: getColumnDisplayValue(facility, 'lookup_mkv8k87b') || '—',
      facilityType: facility.facilityType,
      facilityStatus: facility.facilityStatus,
      connectedContract: getColumnDisplayValue(facility, 'lookup_mkv8y808') || facility.contractType || '—',
      connectedContractPeriod: getColumnDisplayValue(facility, 'lookup_mkv8yj84') || '—',
    }))
  }, [filtered])

  const sortedRows = useMemo(() => {
    const nextRows = [...rows]
    const multiplier = sort.direction === 'asc' ? 1 : -1
    nextRows.sort((a, b) => a[sort.key].localeCompare(b[sort.key], 'he') * multiplier)
    return nextRows
  }, [rows, sort])

  const downCount = useMemo(() => sortedRows.filter((row) => row.facilityStatus.includes('מושבת')).length, [sortedRows])
  const setupCount = useMemo(
    () => sortedRows.filter((row) => row.facilityStatus.includes('הרצה') || row.facilityStatus.includes('הקמה')).length,
    [sortedRows],
  )
  const activeCount = Math.max(sortedRows.length - downCount - setupCount, 0)

  const closePreview = () => {
    if (previewFile?.srcUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewFile.srcUrl)
    }
    setPreviewFile(null)
    setPreviewError(null)
    setPreviewLoading(false)
  }

  const openFilePreview = async (url: string, label: string) => {
    const kind = detectPreviewKind(url)
    if (!kind) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    setPreviewError(null)
    setPreviewLoading(true)

    try {
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)

      if (previewFile?.srcUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewFile.srcUrl)
      }

      setPreviewFile({ kind, label, sourceUrl: url, srcUrl: objectUrl })
    } catch {
      setPreviewFile({ kind, label, sourceUrl: url, srcUrl: '' })
      setPreviewError('לא ניתן להציג את הקובץ ישירות באפליקציה. אפשר לפתוח בלשונית חדשה.')
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <section className="equipment-layout">
      <div className="kpis equipment-kpis equipment-kpis-compact">
        <div className="kpi"><strong>{sortedRows.length}</strong><span>תיקי מתקן בתצוגה</span></div>
        <div className="kpi"><strong>{activeCount}</strong><span>מתקנים פעילים</span></div>
        <div className="kpi"><strong>{setupCount}</strong><span>בהקמה או הרצה</span></div>
        <div className="kpi"><strong>{downCount}</strong><span>מתקנים מושבתים</span></div>
      </div>

      <div className="panel filters equipment-filters">
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לפי שם מתקן, יישוב או מזהה Monday" />

        <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value as FilterValue)} className="select">
          <option value="הכל">כל הקבוצות</option>
          {groups.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FilterValue)} className="select">
          <option value="הכל">כל סטטוסי המתקן</option>
          {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>

        <select value={facilityTypeFilter} onChange={(event) => setFacilityTypeFilter(event.target.value as FilterValue)} className="select">
          <option value="הכל">כל סוגי המתקנים</option>
          {facilityTypes.map((facilityType) => <option key={facilityType} value={facilityType}>{facilityType}</option>)}
        </select>
      </div>

      <div className="panel table-wrap equipment-table-wrap">
        <table className="clients-table equipment-table">
          <thead>
            <tr>
              <th><button type="button" className="sort-btn" onClick={() => setSort((c) => nextSort(c, 'name'))}>מתקן <span className="sort-ind">{sortIndicator(sort.key, sort.direction, 'name')}</span></button></th>
              <th><button type="button" className="sort-btn" onClick={() => setSort((c) => nextSort(c, 'connectedClient'))}>לקוח פעיל <span className="sort-ind">{sortIndicator(sort.key, sort.direction, 'connectedClient')}</span></button></th>
              <th><button type="button" className="sort-btn" onClick={() => setSort((c) => nextSort(c, 'connectedPhone'))}>טלפון לקוח <span className="sort-ind">{sortIndicator(sort.key, sort.direction, 'connectedPhone')}</span></button></th>
              <th><button type="button" className="sort-btn" onClick={() => setSort((c) => nextSort(c, 'facilityType'))}>סוג מתקן <span className="sort-ind">{sortIndicator(sort.key, sort.direction, 'facilityType')}</span></button></th>
              <th><button type="button" className="sort-btn" onClick={() => setSort((c) => nextSort(c, 'facilityStatus'))}>סטטוס <span className="sort-ind">{sortIndicator(sort.key, sort.direction, 'facilityStatus')}</span></button></th>
              <th><button type="button" className="sort-btn" onClick={() => setSort((c) => nextSort(c, 'connectedContract'))}>חוזה שירות <span className="sort-ind">{sortIndicator(sort.key, sort.direction, 'connectedContract')}</span></button></th>
              <th><button type="button" className="sort-btn" onClick={() => setSort((c) => nextSort(c, 'connectedContractPeriod'))}>תקופת חוזה <span className="sort-ind">{sortIndicator(sort.key, sort.direction, 'connectedContractPeriod')}</span></button></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr><td colSpan={7} className="equipment-empty">אין תוצאות לסינון הנוכחי</td></tr>
            ) : (
              sortedRows.map((row) => {
                const { facility } = row
                return (
                  <tr
                    key={facility.id}
                    className="equipment-row"
                    onClick={() => setSelectedFacility(facility)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedFacility(facility)
                      }
                    }}
                    tabIndex={0}
                  >
                    <td>{row.name}</td>
                    <td>{row.connectedClient}</td>
                    <td>{row.connectedPhone}</td>
                    <td>{row.facilityType}</td>
                    <td><span className={statusTone(row.facilityStatus)}>{row.facilityStatus}</span></td>
                    <td>{row.connectedContract}</td>
                    <td>{row.connectedContractPeriod}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedFacility ? (
        <div className="equipment-modal-backdrop" onClick={() => setSelectedFacility(null)} role="presentation">
          <section className="panel equipment-modal" onClick={(event) => event.stopPropagation()} aria-label="פרטי מתקן מלאים">
            <header className="equipment-modal-head">
              <div>
                <h3>{selectedFacility.name}</h3>
                <p>Monday ID: <span className="mono-cell">{selectedFacility.id}</span> | קבוצה: {selectedFacility.group}</p>
              </div>
              <button type="button" className="tab" onClick={() => setSelectedFacility(null)}>סגור</button>
            </header>

            <div className="equipment-modal-grid">
              {selectedFacility.columns.map((column) => {
                const displayValue = column.text?.trim() || column.value?.trim() || ''
                if (!displayValue) return null
                const urls = extractUrls(displayValue)

                return (
                  <article key={column.id} className="equipment-column-card">
                    <h4>{column.title}</h4>
                    {urls.length > 0 ? (
                      <div className="equipment-file-links">
                        {urls.map((url, index) => (
                          <button key={`${column.id}-${index}`} type="button" className="equipment-file-link" onClick={() => { void openFilePreview(url, `${column.title} ${index + 1}`) }}>
                            פתח קובץ {index + 1}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p>{displayValue}</p>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        </div>
      ) : null}

      {previewFile ? (
        <div className="equipment-modal-backdrop" onClick={closePreview} role="presentation">
          <section className="panel equipment-preview-modal" onClick={(event) => event.stopPropagation()}>
            <header className="equipment-modal-head">
              <div>
                <h3>{previewFile.label}</h3>
                <p>תצוגה בתוך האפליקציה</p>
              </div>
              <div className="equipment-preview-actions">
                <a className="equipment-file-link" href={previewFile.sourceUrl} target="_blank" rel="noopener noreferrer">פתח בלשונית חדשה</a>
                <button type="button" className="tab" onClick={closePreview}>סגור</button>
              </div>
            </header>

            <div className="equipment-preview-body">
              {previewLoading ? <p className="equipment-preview-status">טוען קובץ...</p> : null}
              {!previewLoading && previewError ? <p className="equipment-preview-status">{previewError}</p> : null}
              {!previewLoading && !previewError && previewFile.srcUrl ? (
                previewFile.kind === 'pdf' ? (
                  <iframe title={previewFile.label} src={previewFile.srcUrl} className="equipment-preview-frame" />
                ) : (
                  <img src={previewFile.srcUrl} alt={previewFile.label} className="equipment-preview-image" />
                )
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
