import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'

/**
 * Google Calendar auth context — unified OAuth2 flow.
 *
 * Access tokens are managed server-side. The frontend fetches fresh tokens
 * from GET /api/auth/google/token (which uses stored refresh tokens in Supabase).
 * No client-side Google Identity Script or localStorage tokens needed.
 */

// Refresh 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000
// Minimum refresh interval (30s)
const MIN_REFRESH_MS = 30_000

// Legacy localStorage keys (cleaned up on first load)
const LEGACY_KEYS = ['upflow_calendar_token', 'upflow_calendar_token_expires_at']

interface GoogleCalendarContextValue {
  accessToken: string | null
  isReady: boolean
  error: string
  /** True when server has no refresh token — user needs to re-authenticate with Google */
  needsReauth: boolean
  /** Force-refresh the access token from the backend */
  fetchToken: () => Promise<string | null>
}

const GoogleCalendarContext = createContext<GoogleCalendarContextValue>({
  accessToken: null,
  isReady: false,
  error: '',
  needsReauth: false,
  fetchToken: async () => null,
})

export function useGoogleCalendarAuth() {
  return useContext(GoogleCalendarContext)
}

interface TokenApiResponse {
  accessToken?: string
  expiresAt?: string
  error?: string
}

export function GoogleCalendarProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState('')
  const [needsReauth, setNeedsReauth] = useState(false)
  const refreshTimerRef = useRef<number | null>(null)
  const isFetchingRef = useRef(false)

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [])

  const scheduleRefresh = useCallback(
    (expiresAt: string, doFetch: () => Promise<string | null>) => {
      clearRefreshTimer()
      const expiresAtMs = new Date(expiresAt).getTime()
      const refreshIn = Math.max(expiresAtMs - Date.now() - REFRESH_BUFFER_MS, MIN_REFRESH_MS)

      refreshTimerRef.current = window.setTimeout(() => {
        doFetch()
      }, refreshIn)
    },
    [clearRefreshTimer],
  )

  const fetchToken = useCallback(async (): Promise<string | null> => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) return accessToken
    isFetchingRef.current = true

    try {
      const response = await fetch('/api/auth/google/token', {
        method: 'GET',
        cache: 'no-store',
      })

      if (response.status === 401) {
        // Session expired — user needs to log in again
        setAccessToken(null)
        setError('')
        setNeedsReauth(false)
        setIsReady(true)
        return null
      }

      if (!response.ok) {
        setError('שגיאה בקבלת Google token')
        setIsReady(true)
        return null
      }

      const data = (await response.json()) as TokenApiResponse

      if (data.error === 'NO_GOOGLE_TOKEN') {
        // No refresh token in Supabase — user revoked access or never granted calendar scope
        setAccessToken(null)
        setNeedsReauth(true)
        setError('')
        setIsReady(true)
        return null
      }

      if (data.accessToken && data.expiresAt) {
        setAccessToken(data.accessToken)
        setError('')
        setNeedsReauth(false)
        setIsReady(true)

        // Schedule automatic refresh
        scheduleRefresh(data.expiresAt, fetchToken)

        return data.accessToken
      }

      setError('תשובה לא צפויה משרת Google token')
      setIsReady(true)
      return null
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בחיבור לשרת')
      setIsReady(true)
      return null
    } finally {
      isFetchingRef.current = false
    }
  }, [accessToken, scheduleRefresh])

  // Initial fetch on mount
  useEffect(() => {
    // Clean up legacy localStorage tokens
    for (const key of LEGACY_KEYS) {
      try {
        localStorage.removeItem(key)
      } catch {
        // Ignore
      }
    }

    // Fetch initial token from backend
    fetchToken()

    return () => {
      clearRefreshTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <GoogleCalendarContext.Provider value={{ accessToken, isReady, error, needsReauth, fetchToken }}>
      {children}
    </GoogleCalendarContext.Provider>
  )
}
