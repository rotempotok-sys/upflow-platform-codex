import { useEffect, useState } from 'react'

export type CalendarEvent = {
  id: string
  summary?: string
  description?: string
  location?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  attendees?: Array<{ email?: string; displayName?: string }>
  iCalUID?: string
  htmlLink?: string
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '586770624218-11h357fh8gj64plgglbdnk7bi14cqr9r.apps.googleusercontent.com'
const TARGET_CALENDAR_ID = import.meta.env.VITE_GOOGLE_TARGET_CALENDAR_ID?.trim() || 'upflow.operations@gmail.com'
export const CALENDAR_TOKEN_STORAGE_KEY = 'upflow_calendar_token'
export const CALENDAR_TOKEN_EXPIRES_AT_STORAGE_KEY = 'upflow_calendar_token_expires_at'

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

export function useGoogleCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let canceled = false
    async function fetchEvents() {
      let storedToken = localStorage.getItem(CALENDAR_TOKEN_STORAGE_KEY)
      const storedExpiryRaw = localStorage.getItem(CALENDAR_TOKEN_EXPIRES_AT_STORAGE_KEY)
      const storedExpiry = Number(storedExpiryRaw ?? '0')
      let hasValidStoredToken = Boolean(storedToken && Number.isFinite(storedExpiry) && storedExpiry > Date.now())

      if (!hasValidStoredToken || !storedToken) {
        // Attempt silent refresh
        try {
          await loadGoogleIdentityScript()
          if (canceled) return

          const googleClient = (window as any).google?.accounts?.oauth2
          if (!googleClient) throw new Error('No google client')

          await new Promise<void>((resolve, reject) => {
            const client = googleClient.initTokenClient({
              client_id: GOOGLE_CLIENT_ID,
              scope: 'https://www.googleapis.com/auth/calendar.readonly',
              callback: (response: any) => {
                if (response.error || !response.access_token) {
                  reject(new Error('Silent refresh failed'))
                  return
                }
                const exp = Date.now() + Math.max(Number(response.expires_in ?? 0) - 60, 30) * 1000
                localStorage.setItem(CALENDAR_TOKEN_STORAGE_KEY, response.access_token)
                localStorage.setItem(CALENDAR_TOKEN_EXPIRES_AT_STORAGE_KEY, String(exp))
                storedToken = response.access_token
                hasValidStoredToken = true
                resolve()
              },
            })
            client.requestAccessToken({ prompt: 'none' })
          })
        } catch (err) {
          if (!canceled) setError('לא ניתן לחדש חיבור ליומן בשקט')
          return
        }
      }

      if (!hasValidStoredToken || !storedToken) return 


      setIsLoading(true)
      try {
        // Fetch events for the next 30 days and past 30 days roughly
        const start = new Date()
        start.setDate(start.getDate() - 30)
        const end = new Date()
        end.setDate(end.getDate() + 30)

        const params = new URLSearchParams({
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '500',
        })

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(TARGET_CALENDAR_ID)}/events?${params}`, {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        })

        if (!response.ok) {
          throw new Error(`Google API ${response.status}`)
        }

        const data = await response.json()
        if (!canceled && data.items) {
          setEvents(data.items)
        }
      } catch (err) {
        if (!canceled) {
          setError('נכשלה משיכת אירועים מיומן גוגל')
        }
      } finally {
        if (!canceled) {
          setIsLoading(false)
        }
      }
    }

    fetchEvents()
    return () => {
      canceled = true
    }
  }, [])

  return { events, isLoading, error }
}
