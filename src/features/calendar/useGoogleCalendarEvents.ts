import { useEffect, useState } from 'react'
import { useGoogleCalendarAuth } from './GoogleCalendarContext'

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

const TARGET_CALENDAR_ID = import.meta.env.VITE_GOOGLE_TARGET_CALENDAR_ID?.trim() || 'upflow.operations@gmail.com'

// Re-export for backwards compat
export { CALENDAR_TOKEN_STORAGE_KEY, CALENDAR_TOKEN_EXPIRES_AT_STORAGE_KEY } from './GoogleCalendarContext'

export function useGoogleCalendarEvents() {
  const { accessToken, error: authError } = useGoogleCalendarAuth()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!accessToken) {
      setEvents([])
      return
    }

    let canceled = false

    async function fetchEvents() {
      setIsLoading(true)
      try {
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

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(TARGET_CALENDAR_ID)}/events?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )

        if (!response.ok) throw new Error(`Google API ${response.status}`)

        const data = await response.json()
        if (!canceled && data.items) {
          setEvents(data.items)
          setError('')
        }
      } catch {
        if (!canceled) setError('נכשלה משיכת אירועים מיומן גוגל')
      } finally {
        if (!canceled) setIsLoading(false)
      }
    }

    fetchEvents()
    return () => { canceled = true }
  }, [accessToken])

  return { events, isLoading, error: error || authError }
}
