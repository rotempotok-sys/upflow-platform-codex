import { Fragment, useMemo, useState } from 'react'
import { clients as fallbackClients } from '../../data/clientsData'
import type { Client } from '../../types/scheduling'

type FilterValue = string | 'הכל'
type SortDirection = 'asc' | 'desc'
type SortKey = 'name' | 'city' | 'group' | 'facilityStatus'

interface ClientsOverviewProps {
  clientsData?: Client[]
}

function statusBadgeClass(facilityStatus: string) {
  if (facilityStatus.includes('מושבת')) return 'badge badge-p1'
  if (facilityStatus.includes('הרצה') || facilityStatus.includes('הקמה')) return 'badge badge-p2'
  return 'badge badge-ok'
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he'))
}

function nextSort(current: { key: SortKey; direction: SortDirection }, key: SortKey) {
  if (current.key !== key) return { key, direction: 'asc' as SortDirection }
  return { key, direction: current.direction === 'asc' ? ('desc' as SortDirection) : ('asc' as SortDirection) }
}

function sortIndicator(activeKey: SortKey, activeDirection: SortDirection, key: SortKey) {
  if (activeKey !== key) return '⇅'
  return activeDirection === 'asc' ? '↑' : '↓'
}

export function ClientsOverview({ clientsData }: ClientsOverviewProps) {
  const sourceClients = clientsData && clientsData.length > 0 ? clientsData : fallbackClients

  const [query, setQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState<FilterValue>('הכל')
  const [contractFilter, setContractFilter] = useState<FilterValue>('הכל')
  const [statusFilter, setStatusFilter] = useState<FilterValue>('הכל')
  const [facilityTypeFilter, setFacilityTypeFilter] = useState<FilterValue>('הכל')
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' })

  const groups = useMemo(() => uniqueSorted(sourceClients.map((client) => client.group)), [sourceClients])
  const contractTypes = useMemo(() => uniqueSorted(sourceClients.map((client) => client.contractType)), [sourceClients])
  const facilityStatuses = useMemo(() => uniqueSorted(sourceClients.map((client) => client.facilityStatus)), [sourceClients])
  const facilityTypes = useMemo(() => uniqueSorted(sourceClients.map((client) => client.facilityType)), [sourceClients])

  const filteredClients = useMemo(() => {
    return sourceClients.filter((client) => {
      const matchesQuery = client.name.toLowerCase().includes(query.trim().toLowerCase())
      const matchesGroup = groupFilter === 'הכל' || client.group === groupFilter
      const matchesContract = contractFilter === 'הכל' || client.contractType === contractFilter
      const matchesStatus = statusFilter === 'הכל' || client.facilityStatus === statusFilter
      const matchesFacilityType = facilityTypeFilter === 'הכל' || client.facilityType === facilityTypeFilter

      return matchesQuery && matchesGroup && matchesContract && matchesStatus && matchesFacilityType
    })
  }, [sourceClients, query, groupFilter, contractFilter, statusFilter, facilityTypeFilter])

  const sortedClients = useMemo(() => {
    const sorted = [...filteredClients]
    const multiplier = sort.direction === 'asc' ? 1 : -1

    sorted.sort((a, b) => a[sort.key].localeCompare(b[sort.key], 'he') * multiplier)
    return sorted
  }, [filteredClients, sort])

  return (
    <section>
      <div className="kpis">
        <div className="kpi">
          <strong>{sourceClients.length}</strong>
          <span>לקוחות במאגר</span>
        </div>
        <div className="kpi">
          <strong>{groups.length}</strong>
          <span>קבוצות פעילות</span>
        </div>
        <div className="kpi">
          <strong>{sortedClients.length}</strong>
          <span>תוצאות לאחר סינון</span>
        </div>
      </div>

      <div className="panel filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש לפי שם לקוח"
          className="input"
        />

        <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value as FilterValue)} className="select">
          <option value="הכל">כל הקבוצות</option>
          {groups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>

        <select value={contractFilter} onChange={(event) => setContractFilter(event.target.value as FilterValue)} className="select">
          <option value="הכל">כל סוגי החוזה</option>
          {contractTypes.map((contractType) => (
            <option key={contractType} value={contractType}>
              {contractType}
            </option>
          ))}
        </select>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FilterValue)} className="select">
          <option value="הכל">כל סטטוסי המתקן</option>
          {facilityStatuses.map((facilityStatus) => (
            <option key={facilityStatus} value={facilityStatus}>
              {facilityStatus}
            </option>
          ))}
        </select>

        <select
          value={facilityTypeFilter}
          onChange={(event) => setFacilityTypeFilter(event.target.value as FilterValue)}
          className="select"
        >
          <option value="הכל">כל סוגי המתקן</option>
          {facilityTypes.map((facilityType) => (
            <option key={facilityType} value={facilityType}>
              {facilityType}
            </option>
          ))}
        </select>
      </div>

      <div className="panel table-wrap">
        <table className="clients-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="sort-btn" onClick={() => setSort((current) => nextSort(current, 'name'))}>
                  לקוח <span>{sortIndicator(sort.key, sort.direction, 'name')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="sort-btn" onClick={() => setSort((current) => nextSort(current, 'city'))}>
                  יישוב <span>{sortIndicator(sort.key, sort.direction, 'city')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="sort-btn" onClick={() => setSort((current) => nextSort(current, 'group'))}>
                  קבוצה <span>{sortIndicator(sort.key, sort.direction, 'group')}</span>
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() => setSort((current) => nextSort(current, 'facilityStatus'))}
                >
                  סטטוס מתקן <span>{sortIndicator(sort.key, sort.direction, 'facilityStatus')}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedClients.map((client) => {
              const isExpanded = expandedClientId === client.id

              return (
                <Fragment key={client.id}>
                  <tr
                    className={`client-row ${isExpanded ? 'client-row-expanded' : ''}`}
                    onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
                  >
                    <td>{client.name}</td>
                    <td>{client.city}</td>
                    <td>{client.group}</td>
                    <td>
                      <span className={statusBadgeClass(client.facilityStatus)}>{client.facilityStatus}</span>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="client-details-row">
                      <td colSpan={4}>
                        <div className="client-details">
                          <p>
                            <strong>סוג חוזה שירות:</strong> {client.contractType}
                          </p>
                          <p>
                            <strong>סוג מתקן:</strong> {client.facilityType}
                          </p>
                          <p>
                            <strong>מזהה Monday:</strong> {client.id}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
