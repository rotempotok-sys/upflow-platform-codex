import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '586770624218-11h357fh8gj64plgglbdnk7bi14cqr9r.apps.googleusercontent.com'
export const CALENDAR_TOKEN_STORAGE_KEY = 'upflow_calendar_token'
export const CALENDAR_TOKEN_EXPIRES_AT_STORAGE_KEY = 'upflow_calendar_token_expires_at'
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

// Refresh token 2 minutes before expiry
const REFRESH_BUFFER_MS = 2 * 60 * 1000

function loadGoogleIdentityScript() {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-gsi="1"]')
    if (existing) {
      if ((window as any).google?.accounts?.oauth2) resolve()
      else existing.addEventListener('load', () => resolve(), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleGsi = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity script'))
    document.head.appendChild(script)
  })
}

interface GoogleCalendarContextValue {
  accessToken: string | null
  isReady: boolean
  error: string
  /** True when silent auth failed and user interaction is needed */
  needsInteractiveAuth: boolean
  /** Request a new token (with user interaction if needed) */
  requestToken: (prompt?: '' | 'none' | 'consent' | 'select_account') => void
}

const GoogleCalendarContext = createContext<GoogleCalendarContextValue>({
  accessToken: null,
  isReady: false,
  error: '',
  needsInteractiveAuth: false,
  requestToken: () => {},
})

export function useGoogleCalendarAuth() {
  return useContext(GoogleCalendarContext)
}

export function GoogleCalendarProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState('')
  const [needsInteractiveAuth, setNeedsInteractiveAuth] = useState(false)
  const tokenClientRef = useRef<any>(null)
  const refreshTimerRef = useRef<number | null>(null)

  const storeToken = useCallback((token: string, expiresIn: number) => {
    const expiresAtMs = Date.now() + Math.max(expiresIn - 60, 30) * 1000
    localStorage.setItem(CALENDAR_TOKEN_STORAGE_KEY, token)
    localStorage.setItem(CALENDAR_TOKEN_EXPIRES_AT_STORAGE_KEY, String(expiresAtMs))
    setAccessToken(token)
    setError('')
    setNeedsInteractiveAuth(false)

    // Schedule silent refresh before expiry
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
    const refreshIn = Math.max(expiresAtMs - Date.now() - REFRESH_BUFFER_MS, 30_000)
    refreshTimerRef.current = window.setTimeout(() => {
      tokenClientRef.current?.requestAccessToken({ prompt: 'none' })
    }, refreshIn)
  }, [])

  const requestToken = useCallback((prompt?: '' | 'none' | 'consent' | 'select_account') => {
    if (!tokenClientRef.current) return
    tokenClientRef.current.requestAccessToken({ prompt: prompt ?? '' })
  }, [])

  useEffect(() => {
    let canceled = false

    async function init() {
      try {
        await loadGoogleIdentityScript()
        if (canceled) return

        const googleClient = (window as any).google?.accounts?.oauth2
        if (!googleClient) {
          setError('Google Identity API not available')
          return
        }

        const client = googleClient.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPE,
          callback: (response: any) => {
            if (response.error || !response.access_token) {
              const isSilent = response.error === 'interaction_required' || response.error === 'login_required'
              if (isSilent) {
                setNeedsInteractiveAuth(true)
              } else {
                setError('נכשל אימות מול Google Calendar')
              }
              return
            }
            storeToken(response.access_token, Number(response.expires_in ?? 0))
          },
        })

        tokenClientRef.current = client
        setIsReady(true)

        // Check for existing valid token in localStorage
        const storedToken = localStorage.getItem(CALENDAR_TOKEN_STORAGE_KEY)
        const storedExpiry = Number(localStorage.getItem(CALENDAR_TOKEN_EXPIRES_AT_STORAGE_KEY) ?? '0')
        const hasValid = Boolean(storedToken && Number.isFinite(storedExpiry) && storedExpiry > Date.now())

        if (hasValid && storedToken) {
          setAccessToken(storedToken)
          // Schedule refresh for existing token
          const refreshIn = Math.max(storedExpiry - Date.now() - REFRESH_BUFFER_MS, 30_000)
          refreshTimerRef.current = window.setTimeout(() => {
            client.requestAccessToken({ prompt: 'none' })
          }, refreshIn)
        } else {
          // Attempt silent auth
          client.requestAccessToken({ prompt: 'none' })
        }
      } catch {
        if (!canceled) setError('לא ניתן לטעון את Google Identity')
      }
    }

    init()
    return () => {
      canceled = true
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
    }
  }, [storeToken])

  return (
    <GoogleCalendarContext.Provider value={{ accessToken, isReady, error, needsInteractiveAuth, requestToken }}>
      {children}
    </GoogleCalendarContext.Provider>
  )
}
