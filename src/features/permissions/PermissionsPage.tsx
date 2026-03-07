import { useEffect, useMemo, useState } from 'react'

type UserRole = 'Admin' | 'Operations' | 'Technician' | 'Viewer'
type Approval = 'Approved' | 'Pending' | 'Blocked'

interface PermissionUser {
  email: string
  displayName: string
  phone: string
  approval: Approval
  role: UserRole
  screenAccess: {
    assistant: boolean
    calendar: boolean
    clients: boolean
    team: boolean
    equipment: boolean
    aiAsk: boolean
  }
  assignments: {
    clientIds: string[]
    facilityIds: string[]
  }
  isAdmin: boolean
}

interface OptionsPayload {
  clients: Array<{ id: string; name: string }>
  facilities: Array<{ id: string; name: string }>
}

interface PermissionsUsersPayload {
  items: PermissionUser[]
}

function chipClass(value: Approval) {
  if (value === 'Approved') return 'badge badge-ok'
  if (value === 'Pending') return 'badge badge-p2'
  return 'badge badge-p1'
}

export function PermissionsPage() {
  const [items, setItems] = useState<PermissionUser[]>([])
  const [selectedEmail, setSelectedEmail] = useState<string>('')
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>('')
  const [saveMessage, setSaveMessage] = useState<string>('')
  const [options, setOptions] = useState<OptionsPayload>({ clients: [], facilities: [] })

  const selected = useMemo(() => items.find((item) => item.email === selectedEmail) ?? null, [items, selectedEmail])

  const [formRole, setFormRole] = useState<UserRole>('Viewer')
  const [formApproval, setFormApproval] = useState<Approval>('Pending')
  const [screenAssistant, setScreenAssistant] = useState(false)
  const [screenCalendar, setScreenCalendar] = useState(false)
  const [screenClients, setScreenClients] = useState(false)
  const [screenTeam, setScreenTeam] = useState(false)
  const [screenEquipment, setScreenEquipment] = useState(false)
  const [screenAiAsk, setScreenAiAsk] = useState(false)
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([])

  useEffect(() => {
    if (!selected) return

    setFormRole(selected.role)
    setFormApproval(selected.approval)
    setScreenAssistant(selected.screenAccess.assistant)
    setScreenCalendar(selected.screenAccess.calendar)
    setScreenClients(selected.screenAccess.clients)
    setScreenTeam(selected.screenAccess.team)
    setScreenEquipment(selected.screenAccess.equipment)
    setScreenAiAsk(selected.screenAccess.aiAsk)
    setSelectedClients(selected.assignments.clientIds)
    setSelectedFacilities(selected.assignments.facilityIds)
  }, [selected])

  const loadData = async () => {
    setIsLoading(true)
    setError('')

    try {
      const usersRes = await fetch(`/api/admin/permissions/users?query=${encodeURIComponent(query)}`, {
        method: 'GET',
      })
      const usersPayload = (await usersRes.json()) as PermissionsUsersPayload & { error?: { message?: string } }
      if (!usersRes.ok) {
        throw new Error(usersPayload.error?.message || 'Failed loading users')
      }

      const optionsRes = await fetch('/api/admin/permissions/options', { method: 'GET' })
      const optionsPayload = (await optionsRes.json()) as OptionsPayload & { error?: { message?: string } }
      if (!optionsRes.ok) {
        throw new Error(optionsPayload.error?.message || 'Failed loading options')
      }

      setItems(usersPayload.items ?? [])
      setOptions({
        clients: optionsPayload.clients ?? [],
        facilities: optionsPayload.facilities ?? [],
      })

      if (!selectedEmail && usersPayload.items?.length) {
        setSelectedEmail(usersPayload.items[0].email)
      } else if (selectedEmail && !(usersPayload.items ?? []).some((entry) => entry.email === selectedEmail)) {
        setSelectedEmail(usersPayload.items?.[0]?.email ?? '')
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed loading permissions data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    if (!selected) return

    setSaving(true)
    setSaveMessage('')
    setError('')

    try {
      const response = await fetch(`/api/admin/permissions/users/${encodeURIComponent(selected.email)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: formRole,
          approval: formApproval,
          screenAccess: {
            assistant: screenAssistant,
            calendar: screenCalendar,
            clients: screenClients,
            team: screenTeam,
            equipment: screenEquipment,
            aiAsk: screenAiAsk,
          },
          assignments: {
            clientIds: selectedClients,
            facilityIds: selectedFacilities,
          },
        }),
      })

      const payload = (await response.json()) as { error?: { message?: string }; item?: PermissionUser }

      if (!response.ok) {
        throw new Error(payload.error?.message || 'Failed saving permissions')
      }

      setSaveMessage('נשמר בהצלחה')
      await loadData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed saving changes')
    } finally {
      setSaving(false)
    }
  }

  const toggleId = (collection: string[], id: string, setter: (next: string[]) => void) => {
    if (collection.includes(id)) {
      setter(collection.filter((entry) => entry !== id))
      return
    }

    setter([...collection, id])
  }

  return (
    <section className="permissions-layout">
      <article className="panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש משתמש לפי שם/אימייל"
            style={{ maxWidth: 360 }}
          />
          <button type="button" className="tab" onClick={() => void loadData()} disabled={isLoading}>
            {isLoading ? 'טוען...' : 'רענון'}
          </button>
        </div>
        {error ? <p className="calendar-error">{error}</p> : null}
        {saveMessage ? <p className="calendar-note">{saveMessage}</p> : null}
      </article>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: '1rem' }}>
        <article className="panel" style={{ padding: '1rem', maxHeight: '65vh', overflow: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>משתמשים</h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {items.map((item) => (
              <button
                key={item.email}
                type="button"
                className={`tab ${selectedEmail === item.email ? 'tab-active' : ''}`}
                style={{ textAlign: 'right' }}
                onClick={() => setSelectedEmail(item.email)}
              >
                <strong>{item.displayName}</strong>
                <div style={{ fontSize: '0.85rem' }}>{item.email}</div>
                <span className={chipClass(item.approval)}>{item.approval}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel" style={{ padding: '1rem', maxHeight: '65vh', overflow: 'auto' }}>
          {!selected ? (
            <p>בחר משתמש לעריכה.</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>ניהול הרשאות: {selected.displayName}</h3>
              <p className="calendar-note">{selected.email}</p>

              <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '0.8rem' }}>
                <label>
                  Role
                  <select className="select" value={formRole} onChange={(e) => setFormRole(e.target.value as UserRole)}>
                    <option value="Admin">Admin</option>
                    <option value="Operations">Operations</option>
                    <option value="Technician">Technician</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                </label>

                <label>
                  Approval
                  <select className="select" value={formApproval} onChange={(e) => setFormApproval(e.target.value as Approval)}>
                    <option value="Approved">Approved</option>
                    <option value="Pending">Pending</option>
                    <option value="Blocked">Blocked</option>
                  </select>
                </label>
              </div>

              <h4>Screen toggles</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '0.4rem' }}>
                <label><input type="checkbox" checked={screenAssistant} onChange={(e) => setScreenAssistant(e.target.checked)} /> Assistant</label>
                <label><input type="checkbox" checked={screenAiAsk} onChange={(e) => setScreenAiAsk(e.target.checked)} /> AI Ask</label>
                <label><input type="checkbox" checked={screenCalendar} onChange={(e) => setScreenCalendar(e.target.checked)} /> Calendar</label>
                <label><input type="checkbox" checked={screenClients} onChange={(e) => setScreenClients(e.target.checked)} /> Clients</label>
                <label><input type="checkbox" checked={screenTeam} onChange={(e) => setScreenTeam(e.target.checked)} /> Team</label>
                <label><input type="checkbox" checked={screenEquipment} onChange={(e) => setScreenEquipment(e.target.checked)} /> Equipment</label>
              </div>

              <h4 style={{ marginTop: '1rem' }}>Client assignments</h4>
              <div style={{ display: 'grid', gap: '0.35rem', maxHeight: 140, overflow: 'auto' }}>
                {options.clients.map((client) => (
                  <label key={client.id}>
                    <input
                      type="checkbox"
                      checked={selectedClients.includes(client.id)}
                      onChange={() => toggleId(selectedClients, client.id, setSelectedClients)}
                    />{' '}
                    {client.name}
                  </label>
                ))}
              </div>

              <h4 style={{ marginTop: '1rem' }}>Facility assignments</h4>
              <div style={{ display: 'grid', gap: '0.35rem', maxHeight: 140, overflow: 'auto' }}>
                {options.facilities.map((facility) => (
                  <label key={facility.id}>
                    <input
                      type="checkbox"
                      checked={selectedFacilities.includes(facility.id)}
                      onChange={() => toggleId(selectedFacilities, facility.id, setSelectedFacilities)}
                    />{' '}
                    {facility.name}
                  </label>
                ))}
              </div>

              <div style={{ marginTop: '1rem' }}>
                <button type="button" className="tab" onClick={() => void save()} disabled={saving}>
                  {saving ? 'שומר...' : 'שמור שינויים'}
                </button>
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  )
}
