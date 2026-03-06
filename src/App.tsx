import { useEffect, useState } from 'react'
import { OperationsAIAgentPage } from './features/assistant/OperationsAIAgentPage'
import { CalendarLinkPage } from './features/calendar/CalendarLinkPage'
import { ClientsOverview } from './features/clients/ClientsOverview'
import { EquipmentBoardPage } from './features/equipment/EquipmentBoardPage'
import { TeamOverview } from './features/team/TeamOverview'
import { clients as fallbackClients } from './data/clientsData'
import { facilities as fallbackFacilities } from './data/facilitiesData'
import type { Client, FacilityRecord } from './types/scheduling'

type ViewKey = 'assistant' | 'team' | 'clients' | 'calendar' | 'equipment'

type SyncState = 'idle' | 'syncing' | 'ok' | 'error'

interface MondaySnapshotResponse {
  clients: Client[]
  facilities: FacilityRecord[]
  fetchedAt: string
}

const POLL_INTERVAL_MS = 5 * 60 * 1000

const viewMeta: Record<ViewKey, { title: string; tag: string }> = {
  assistant: {
    title: 'סוכן AI',
    tag: 'AI Agent',
  },
  team: {
    title: 'צוות וביצוע',
    tag: 'Operations',
  },
  clients: {
    title: 'לקוחות',
    tag: 'Clients',
  },
  calendar: {
    title: 'לוח זמנים',
    tag: 'Calendar',
  },
  equipment: {
    title: 'תיקי מתקן',
    tag: 'Equipment',
  },
}

function formatSyncTime(value: string | null) {
  if (!value) return 'טרם סונכרן'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'טרם סונכרן'
  return date.toLocaleString('he-IL')
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('assistant')
  const [clients, setClients] = useState<Client[]>(fallbackClients)
  const [facilities, setFacilities] = useState<FacilityRecord[]>(fallbackFacilities)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const pullSnapshot = async () => {
      if (!isMounted) return
      setSyncState('syncing')
      setSyncError(null)

      try {
        const response = await fetch('/api/monday/snapshot', {
          method: 'GET',
          cache: 'no-store',
        })

        const payload = (await response.json()) as MondaySnapshotResponse & { error?: string }

        if (!response.ok) {
          throw new Error(payload.error || 'Monday snapshot request failed')
        }

        if (!isMounted) return

        setClients(Array.isArray(payload.clients) ? payload.clients : fallbackClients)
        setFacilities(Array.isArray(payload.facilities) ? payload.facilities : fallbackFacilities)
        setLastSyncAt(payload.fetchedAt || new Date().toISOString())
        setSyncState('ok')
      } catch (error) {
        if (!isMounted) return
        setSyncState('error')
        setSyncError(error instanceof Error ? error.message : 'שגיאת סנכרון לא ידועה')
      }
    }

    void pullSnapshot()
    const timer = window.setInterval(() => {
      void pullSnapshot()
    }, POLL_INTERVAL_MS)

    return () => {
      isMounted = false
      window.clearInterval(timer)
    }
  }, [])

  return (
    <main className="app-shell app-layout" dir="rtl">
      <aside className="panel side-nav" aria-label="ניווט ראשי">
        <div className="side-nav-head">
          <span className="header-dot" aria-hidden>
            *
          </span>
          <span>Upflow</span>
        </div>

        <nav className="side-tabs">
          <button
            type="button"
            className={`tab side-tab ${activeView === 'assistant' ? 'tab-active' : ''}`}
            onClick={() => setActiveView('assistant')}
          >
            סוכן AI
          </button>
          <button
            type="button"
            className={`tab side-tab ${activeView === 'calendar' ? 'tab-active' : ''}`}
            onClick={() => setActiveView('calendar')}
          >
            לוח זמנים
          </button>
          <button
            type="button"
            className={`tab side-tab ${activeView === 'clients' ? 'tab-active' : ''}`}
            onClick={() => setActiveView('clients')}
          >
            לקוחות
          </button>
          <button
            type="button"
            className={`tab side-tab ${activeView === 'team' ? 'tab-active' : ''}`}
            onClick={() => setActiveView('team')}
          >
            צוות
          </button>
          <button
            type="button"
            className={`tab side-tab ${activeView === 'equipment' ? 'tab-active' : ''}`}
            onClick={() => setActiveView('equipment')}
          >
            תיקי מתקן
          </button>
        </nav>
      </aside>

      <section className="app-main">
        {activeView !== 'equipment' ? (
          <header className="app-header app-header-compact panel">
            <span className="header-tag">{viewMeta[activeView].tag}</span>
            <h1>{viewMeta[activeView].title}</h1>
            <p className="sync-indicator">
              {syncState === 'syncing' ? 'מסנכרן מול Monday...' : `סנכרון אחרון: ${formatSyncTime(lastSyncAt)}`}
              {syncState === 'error' && syncError ? ` | שגיאה: ${syncError}` : ''}
            </p>
          </header>
        ) : null}

        <section className="view-stage" aria-label={viewMeta[activeView].title}>
          {activeView === 'assistant' ? <OperationsAIAgentPage clientsData={clients} facilitiesData={facilities} /> : null}
          {activeView === 'team' ? <TeamOverview /> : null}
          {activeView === 'clients' ? <ClientsOverview clientsData={clients} /> : null}
          {activeView === 'calendar' ? <CalendarLinkPage /> : null}
          {activeView === 'equipment' ? <EquipmentBoardPage facilitiesData={facilities} /> : null}
        </section>
      </section>
    </main>
  )
}

export default App
