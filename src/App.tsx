import { useEffect, useMemo, useState } from 'react'
import { useGoogleCalendarAuth } from './features/calendar/GoogleCalendarContext'
import { BlockedScreen } from './features/auth/BlockedScreen'
import { LoginScreen, type LoginOutcome } from './features/auth/LoginScreen'
import { NotAuthorizedScreen } from './features/auth/NotAuthorizedScreen'
import { PendingScreen } from './features/auth/PendingScreen'
import { OperationsAIAgentPage } from './features/assistant/OperationsAIAgentPage'
import { CalendarLinkPage } from './features/calendar/CalendarLinkPage'
import { GoogleCalendarProvider } from './features/calendar/GoogleCalendarContext'
import { ClientsOverview } from './features/clients/ClientsOverview'
import { EquipmentBoardPage } from './features/equipment/EquipmentBoardPage'
import { TeamOverview } from './features/team/TeamOverview'
import { HomeDashboard } from './features/home/HomeDashboard'
import type {
  Client,
  FacilityRecord,
  RuntimeAssignmentSnapshot,
  RuntimeExceptionSnapshot,
  RuntimeOperationSnapshot,
  RuntimeOperationalProjections,
  RuntimeReportSnapshot,
  RuntimeScheduleEntrySnapshot,
  RuntimeUserSnapshot,
} from './types/scheduling'

type ViewKey = 'home' | 'assistant' | 'team' | 'clients' | 'calendar' | 'equipment'
type SyncState = 'idle' | 'syncing' | 'ok' | 'error'
type AppAuthState = 'booting' | 'unauthenticated' | 'approved' | 'pending' | 'blocked' | 'not_authorized' | 'error'

type PermissionKey =
  | 'screen.assistant'
  | 'screen.team'
  | 'screen.clients'
  | 'screen.calendar'
  | 'screen.equipment'
  | 'screen.permissions'
  | 'ai.ask'

interface MondaySnapshotResponse {
  clients: Client[]
  facilities: FacilityRecord[]
  operations: RuntimeOperationSnapshot[]
  assignments: RuntimeAssignmentSnapshot[]
  users: RuntimeUserSnapshot[]
  scheduleEntries: RuntimeScheduleEntrySnapshot[]
  reports: RuntimeReportSnapshot[]
  exceptions: RuntimeExceptionSnapshot[]
  projections: RuntimeOperationalProjections | null
  fetchedAt: string
  error?: {
    code?: string
    message?: string
    authState?: 'blocked' | 'not_authorized'
  }
}

interface AuthUser {
  email: string
  displayName: string
  phone: string
  role: 'Admin' | 'Operations' | 'Technician' | 'Viewer'
  approval: 'Approved' | 'Pending' | 'Blocked'
}

interface AuthMePayload {
  authenticated?: boolean
  authState?: 'approved' | 'pending'
  user?: AuthUser
  permissions?: {
    keys?: PermissionKey[]
  }
  error?: {
    code?: string
    message?: string
    authState?: 'blocked' | 'not_authorized'
  }
}

const POLL_INTERVAL_MS = 5 * 60 * 1000

const viewMeta: Record<ViewKey, { title: string; tag: string; permission: PermissionKey }> = {
  home: { title: 'בית', tag: 'Dashboard', permission: 'screen.clients' },
  assistant: { title: 'סוכן AI', tag: 'AI Agent', permission: 'screen.assistant' },
  team: { title: 'צוות וביצוע', tag: 'Operations', permission: 'screen.team' },
  clients: { title: 'לקוחות', tag: 'Clients', permission: 'screen.clients' },
  calendar: { title: 'לוח זמנים', tag: 'Calendar', permission: 'screen.calendar' },
  equipment: { title: 'תיקי מתקן', tag: 'Equipment', permission: 'screen.equipment' },
}

const viewOrder: ViewKey[] = ['home', 'assistant', 'calendar', 'clients', 'team', 'equipment']

function formatSyncTime(value: string | null) {
  if (!value) return 'טרם סונכרן'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'טרם סונכרן'
  return date.toLocaleString('he-IL')
}

function CalendarConnectBanner() {
  const { needsInteractiveAuth, isReady, accessToken, requestToken } = useGoogleCalendarAuth()

  if (!needsInteractiveAuth || !isReady || accessToken) return null

  return (
    <div
      style={{
        background: '#1a73e8',
        color: '#fff',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        fontSize: '0.9rem',
      }}
    >
      <span>נדרש חיבור ל-Google Calendar לתפקוד מלא</span>
      <button
        type="button"
        onClick={() => requestToken('')}
        style={{
          background: '#fff',
          color: '#1a73e8',
          border: 'none',
          borderRadius: '4px',
          padding: '6px 16px',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
      >
        התחבר עכשיו
      </button>
    </div>
  )
}

function AuthShellMarker() {
  return null
}

function App() {
  const [authState, setAuthState] = useState<AppAuthState>('booting')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authPermissions, setAuthPermissions] = useState<PermissionKey[]>([])
  const [authMessage, setAuthMessage] = useState<string | null>(null)

  const [activeView, setActiveView] = useState<ViewKey>('home')
  const [clients, setClients] = useState<Client[]>([])
  const [facilities, setFacilities] = useState<FacilityRecord[]>([])
  const [operations, setOperations] = useState<RuntimeOperationSnapshot[]>([])
  const [assignments, setAssignments] = useState<RuntimeAssignmentSnapshot[]>([])
  const [users, setUsers] = useState<RuntimeUserSnapshot[]>([])
  const [scheduleEntries, setScheduleEntries] = useState<RuntimeScheduleEntrySnapshot[]>([])
  const [reports, setReports] = useState<RuntimeReportSnapshot[]>([])
  const [exceptions, setExceptions] = useState<RuntimeExceptionSnapshot[]>([])
  const [projections, setProjections] = useState<RuntimeOperationalProjections | null>(null)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [mondaySyncState, setMondaySyncState] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle')

  const allowedViews = useMemo(() => {
    return viewOrder.filter((view) => authPermissions.includes(viewMeta[view].permission))
  }, [authPermissions])

  useEffect(() => {
    if (authState !== 'approved') return
    if (allowedViews.length === 0) return
    if (allowedViews.includes(activeView)) return
    setActiveView(allowedViews[0])
  }, [authState, allowedViews, activeView])

  const canUseSnapshot = useMemo(() => {
    if (authState !== 'approved') return false
    return ['screen.assistant', 'screen.clients', 'screen.equipment', 'screen.team'].some((permission) =>
      authPermissions.includes(permission as PermissionKey),
    )
  }, [authState, authPermissions])

  const triggerMondaySync = async () => {
    if (mondaySyncState === 'syncing') return
    setMondaySyncState('syncing')
    try {
      const res = await fetch('/api/runtime-db/sync/monday-snapshot', { method: 'POST' })
      const body = (await res.json()) as { error?: { message?: string } }
      if (!res.ok) throw new Error(body.error?.message ?? 'Sync failed')
      setMondaySyncState('ok')
      setTimeout(() => setMondaySyncState('idle'), 3000)
    } catch (err) {
      setMondaySyncState('error')
      setTimeout(() => setMondaySyncState('idle'), 5000)
      console.error('Monday sync failed:', err)
    }
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore and continue local reset
    }

    setAuthState('unauthenticated')
    setAuthUser(null)
    setAuthPermissions([])
    setAuthMessage(null)
    setSyncState('idle')
    setSyncError(null)
    setClients([])
    setFacilities([])
    setOperations([])
    setAssignments([])
    setUsers([])
    setScheduleEntries([])
    setReports([])
    setExceptions([])
    setProjections(null)
  }

  useEffect(() => {
    let isMounted = true

    const bootstrapAuth = async () => {
      try {
        console.log('BOOT /api/auth/me')
        const response = await fetch('/api/auth/me', { method: 'GET', cache: 'no-store' })
        const payload = (await response.json()) as AuthMePayload

        console.log('auth state received', {
          httpStatus: response.status,
          authState: payload.authState ?? payload.error?.authState ?? null,
          errorCode: payload.error?.code ?? null,
        })

        if (!isMounted) return

        if (response.ok && payload.authState === 'approved' && payload.user) {
          setAuthUser(payload.user)
          setAuthPermissions(payload.permissions?.keys ?? [])
          setAuthMessage(null)
          setAuthState('approved')
          return
        }

        if (response.ok && payload.authState === 'pending') {
          setAuthUser(payload.user ?? null)
          setAuthPermissions([])
          setAuthMessage('החשבון ממתין לאישור')
          setAuthState('pending')
          return
        }

        const code = payload.error?.code
        const message = payload.error?.message || 'Authentication check failed'
        const errorState = payload.error?.authState

        if (code === 'SESSION_MISSING_OR_EXPIRED') {
          setAuthState('unauthenticated')
          setAuthMessage(null)
          return
        }

        if (code === 'AUTH_BLOCKED' || errorState === 'blocked') {
          setAuthState('blocked')
          setAuthMessage(message)
          return
        }

        if (code === 'AUTH_NOT_ELIGIBLE' || errorState === 'not_authorized') {
          setAuthState('not_authorized')
          setAuthMessage(message)
          return
        }

        setAuthState('error')
        setAuthMessage(message)
      } catch (error) {
        if (!isMounted) return
        setAuthState('error')
        setAuthMessage(error instanceof Error ? error.message : 'Authentication bootstrap failed')
      }
    }

    void bootstrapAuth()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!canUseSnapshot) {
      setClients([])
      setFacilities([])
      setOperations([])
      setAssignments([])
      setUsers([])
      setScheduleEntries([])
      setReports([])
      setExceptions([])
      setProjections(null)
      return
    }

    let isMounted = true

    const pullSnapshot = async () => {
      if (!isMounted) return
      setSyncState('syncing')
      setSyncError(null)

      try {
        const response = await fetch('/api/runtime-db/snapshot', {
          method: 'GET',
          cache: 'no-store',
        })

        const payload = (await response.json()) as MondaySnapshotResponse
        console.log('snapshot counts received', {
          httpStatus: response.status,
          clients: Array.isArray(payload.clients) ? payload.clients.length : null,
          facilities: Array.isArray(payload.facilities) ? payload.facilities.length : null,
          operations: Array.isArray(payload.operations) ? payload.operations.length : null,
          assignments: Array.isArray(payload.assignments) ? payload.assignments.length : null,
          scheduleEntries: Array.isArray(payload.scheduleEntries) ? payload.scheduleEntries.length : null,
          reports: Array.isArray(payload.reports) ? payload.reports.length : null,
          exceptions: Array.isArray(payload.exceptions) ? payload.exceptions.length : null,
          hasProjections: Boolean(payload.projections),
          errorCode: payload.error?.code ?? null,
        })

        if (!response.ok) {
          const code = payload.error?.code
          const message = payload.error?.message || 'Runtime snapshot request failed'

          if (code === 'AUTH_BLOCKED') {
            setAuthState('blocked')
            setAuthMessage(message)
            setClients([])
            setFacilities([])
            setOperations([])
            setAssignments([])
            setUsers([])
            setScheduleEntries([])
            setReports([])
            setExceptions([])
            setProjections(null)
            return
          }

          if (code === 'AUTH_NOT_ELIGIBLE' || code === 'SESSION_MISSING_OR_EXPIRED') {
            setAuthState(code === 'AUTH_NOT_ELIGIBLE' ? 'not_authorized' : 'unauthenticated')
            setAuthMessage(message)
            setClients([])
            setFacilities([])
            setOperations([])
            setAssignments([])
            setUsers([])
            setScheduleEntries([])
            setReports([])
            setExceptions([])
            setProjections(null)
            return
          }

          throw new Error(message)
        }

        if (!isMounted) return

        setClients(Array.isArray(payload.clients) ? payload.clients : [])
        setFacilities(Array.isArray(payload.facilities) ? payload.facilities : [])
        setOperations(Array.isArray(payload.operations) ? payload.operations : [])
        setAssignments(Array.isArray(payload.assignments) ? payload.assignments : [])
        setUsers(Array.isArray(payload.users) ? payload.users : [])
        setScheduleEntries(Array.isArray(payload.scheduleEntries) ? payload.scheduleEntries : [])
        setReports(Array.isArray(payload.reports) ? payload.reports : [])
        setExceptions(Array.isArray(payload.exceptions) ? payload.exceptions : [])
        setProjections(payload.projections && typeof payload.projections === 'object' ? payload.projections : null)
        setLastSyncAt(payload.fetchedAt || new Date().toISOString())
        setSyncState('ok')
      } catch (error) {
        if (!isMounted) return
        setSyncState('error')
        setSyncError(error instanceof Error ? error.message : 'שגיאת סנכרון לא ידועה')
        setClients([])
        setFacilities([])
        setOperations([])
        setAssignments([])
        setUsers([])
        setScheduleEntries([])
        setReports([])
        setExceptions([])
        setProjections(null)
      }
    }

    void pullSnapshot().then(() => {
      // Auto-sync from Monday on first open of the day
      setLastSyncAt((currentLastSync) => {
        if (currentLastSync) {
          const lastSyncDay = new Date(currentLastSync).toDateString()
          const today = new Date().toDateString()
          if (lastSyncDay !== today) {
            void triggerMondaySync()
          }
        }
        return currentLastSync
      })
    })
    const timer = window.setInterval(() => {
      void pullSnapshot()
    }, POLL_INTERVAL_MS)

    return () => {
      isMounted = false
      window.clearInterval(timer)
    }
  }, [canUseSnapshot])

  const handleLoginOutcome = (outcome: LoginOutcome) => {
    if (outcome.type === 'approved') {
      window.location.reload()
      return
    }

    if (outcome.type === 'pending') {
      setAuthState('pending')
      setAuthMessage('החשבון ממתין לאישור')
      return
    }

    if (outcome.type === 'blocked') {
      setAuthState('blocked')
      setAuthMessage(outcome.message ?? null)
      return
    }

    if (outcome.type === 'not_authorized') {
      setAuthState('not_authorized')
      setAuthMessage(outcome.message ?? null)
      return
    }

    setAuthState('error')
    setAuthMessage(outcome.message)
  }

  if (authState === 'booting') {
    return (
      <main className="app-shell" dir="rtl">
        <AuthShellMarker />
        <section className="panel" style={{ maxWidth: 560, margin: '12vh auto', padding: '2rem' }}>
          <h1>טוען הרשאות...</h1>
        </section>
      </main>
    )
  }

  if (authState === 'unauthenticated') {
    return (
      <>
        <AuthShellMarker />
        <LoginScreen onOutcome={handleLoginOutcome} />
      </>
    )
  }

  if (authState === 'pending') {
    return (
      <>
        <AuthShellMarker />
        <PendingScreen onLogout={logout} />
      </>
    )
  }

  if (authState === 'blocked') {
    return (
      <>
        <AuthShellMarker />
        <BlockedScreen message={authMessage ?? undefined} onLogout={logout} />
      </>
    )
  }

  if (authState === 'not_authorized') {
    return (
      <>
        <AuthShellMarker />
        <NotAuthorizedScreen message={authMessage ?? undefined} onBackToLogin={() => setAuthState('unauthenticated')} />
      </>
    )
  }

  if (authState === 'error') {
    return (
      <main className="app-shell" dir="rtl">
        <AuthShellMarker />
        <section className="panel" style={{ maxWidth: 560, margin: '12vh auto', padding: '2rem' }}>
          <h1>שגיאת אימות</h1>
          <p>{authMessage || 'אירעה שגיאה לא צפויה.'}</p>
          <button type="button" className="tab" onClick={() => window.location.reload()}>
            נסה שוב
          </button>
        </section>
      </main>
    )
  }

  if (allowedViews.length === 0) {
    return (
      <main className="app-shell" dir="rtl">
        <AuthShellMarker />
        <section className="panel" style={{ maxWidth: 560, margin: '12vh auto', padding: '2rem' }}>
          <h1>אין מסכים זמינים</h1>
          <p>אין לך הרשאת מסך פעילות כרגע. פנה למנהל המערכת.</p>
          <button type="button" className="tab" onClick={() => void logout()}>
            התנתקות
          </button>
        </section>
      </main>
    )
  }

  return (
    <GoogleCalendarProvider>
    <CalendarConnectBanner />
    <main className="app-shell app-layout" dir="rtl">
      <AuthShellMarker />
      <aside className="panel side-nav" aria-label="ניווט ראשי">
        <div className="side-nav-head">
          <span className="header-dot" aria-hidden>
            *
          </span>
          <span>Upflow</span>
        </div>

        <p className="calendar-note">{authUser ? `${authUser.displayName} | ${authUser.role}` : 'Authenticated'}</p>

        <nav className="side-tabs">
          {allowedViews.map((view) => (
            <button
              key={view}
              type="button"
              className={`tab side-tab ${activeView === view ? 'tab-active' : ''}`}
              onClick={() => setActiveView(view)}
            >
              {viewMeta[view].title}
            </button>
          ))}
        </nav>

        <button type="button" className="tab" onClick={() => void logout()}>
          התנתקות
        </button>
      </aside>

      <section className="app-main">
        {activeView !== 'equipment' ? (
          <header className="app-header app-header-compact panel">
            <span className="header-tag">{viewMeta[activeView].tag}</span>
            <h1>{viewMeta[activeView].title}</h1>
            <p className="sync-indicator">
              {canUseSnapshot
                ? syncState === 'syncing'
                  ? 'מסנכרן מול Monday...'
                  : `סנכרון אחרון: ${formatSyncTime(lastSyncAt)}`
                : 'אין הרשאת Snapshot לנתוני Monday'}
              {syncState === 'error' && syncError ? ` | שגיאה: ${syncError}` : ''}
            </p>
            {(authUser?.role === 'Admin' || authUser?.role === 'Operations') && (
              <button
                type="button"
                className="tab"
                style={{ fontSize: '0.75rem', padding: '4px 10px', marginRight: '8px' }}
                disabled={mondaySyncState === 'syncing'}
                onClick={() => void triggerMondaySync()}
              >
                {mondaySyncState === 'syncing' ? '⏳ מסנכרן...' : mondaySyncState === 'ok' ? '✅ הושלם' : mondaySyncState === 'error' ? '❌ שגיאה' : '🔄 סנכרן מ-Monday'}
              </button>
            )}
          </header>
        ) : null}

        <section className="view-stage" aria-label={viewMeta[activeView].title}>
          {activeView === 'home' ? (
            <HomeDashboard
              currentUserEmail={authUser?.email ?? null}
              currentUserRole={authUser?.role ?? null}
              operationsData={operations}
              exceptionsData={exceptions}
              scheduleEntriesData={scheduleEntries}
              reportsData={reports}
              usersData={users}
              projectionsData={projections}
              isLoading={syncState === 'syncing' && operations.length === 0}
            />
          ) : null}
          {activeView === 'assistant' ? <OperationsAIAgentPage clientsData={clients} facilitiesData={facilities} /> : null}
          {activeView === 'team' ? (
            <TeamOverview
              facilitiesData={facilities}
              operationsData={operations}
              assignmentsData={assignments}
              usersData={users}
              scheduleEntriesData={scheduleEntries}
              reportsData={reports}
              exceptionsData={exceptions}
              projectionsData={projections}
              isLoading={syncState === 'syncing' && operations.length === 0 && scheduleEntries.length === 0}
              errorMessage={syncState === 'error' ? syncError : null}
            />
          ) : null}
          {activeView === 'clients' ? <ClientsOverview clientsData={clients} /> : null}
          {activeView === 'calendar' ? <CalendarLinkPage /> : null}
          {activeView === 'equipment' ? <EquipmentBoardPage facilitiesData={facilities} /> : null}
        </section>
      </section>
    </main>
    </GoogleCalendarProvider>
  )
}

export default App










