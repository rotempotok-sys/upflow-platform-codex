import { google } from 'googleapis'

// --- Singleton auth client ---
// Created once per process lifetime; googleapis auto-refreshes the access token
// when it expires (~1 hour), so the connection stays alive indefinitely.
let _calendarClient: ReturnType<typeof google.calendar> | null = null

function getCalendarClient(): ReturnType<typeof google.calendar> | null {
  if (_calendarClient) return _calendarClient

  const serviceAccountJsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJsonStr) {
    console.warn('Backend GCal Sync: No GOOGLE_SERVICE_ACCOUNT_JSON provided in .env.local')
    return null
  }

  let credentials: object
  try {
    // Support both raw JSON and escaped-newline strings (common in env vars)
    credentials = JSON.parse(serviceAccountJsonStr.replace(/\\n/g, '\n'))
  } catch (err) {
    console.error('Backend GCal Sync: Invalid JSON in GOOGLE_SERVICE_ACCOUNT_JSON', err)
    return null
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  })

  _calendarClient = google.calendar({ version: 'v3', auth })
  console.info('Backend GCal Sync: Calendar client initialised (singleton)')
  return _calendarClient
}

export interface CalendarEventItem {
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

/**
 * Fetch full calendar events for a given time range using the service account.
 * Optionally filter to only events matching specific event IDs (calendarEventRefs).
 */
export async function fetchCalendarEventsForRange(
  calendarId: string,
  options?: {
    timeMin?: Date
    timeMax?: Date
    filterEventIds?: Set<string>
  },
): Promise<CalendarEventItem[]> {
  const calendar = getCalendarClient()
  if (!calendar) return []

  const timeMin = options?.timeMin ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const timeMax = options?.timeMax ?? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)

  try {
    const res = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 2500,
      singleEvents: true,
      orderBy: 'startTime',
    })

    const allEvents = (res.data.items || []) as CalendarEventItem[]

    if (!options?.filterEventIds || options.filterEventIds.size === 0) {
      return allEvents
    }

    // Filter to only events whose ID matches one of the provided refs
    const filterSet = options.filterEventIds
    return allEvents.filter((ev) => {
      if (!ev.id) return false
      const idLower = ev.id.toLowerCase()
      // Direct match
      if (filterSet.has(idLower)) return true
      // Partial match (calendarEventRef may be a substring of the event ID or vice versa)
      for (const ref of filterSet) {
        if (idLower.includes(ref) || ref.includes(idLower)) return true
      }
      return false
    })
  } catch (err) {
    console.error('Backend GCal: Failed to fetch calendar events for range', err)
    return []
  }
}

export async function fetchGoogleCalendarEventsByRefs(
  calendarId: string,
  eventRefs: string[]
): Promise<Map<string, { startDateTime: string; startDate: string }>> {
  if (eventRefs.length === 0) return new Map()

  const calendar = getCalendarClient()
  if (!calendar) return new Map()
  const eventsMap = new Map<string, { startDateTime: string; startDate: string }>()

  // Since there is no "batch query by IDs" in v3, we'll fetch recently active events
  // covering roughly the next 2 months and past 2 months, prioritizing recent edits.
  // This avoids a single API call per event.
  const timeMin = new Date()
  timeMin.setMonth(timeMin.getMonth() - 2)
  const timeMax = new Date()
  timeMax.setMonth(timeMax.getMonth() + 3)

  try {
    const res = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 2500,
      singleEvents: true,
      orderBy: 'startTime',
    })

    const foundEvents = res.data.items || []
    
    for (const e of foundEvents) {
      if (!e.start) continue
      const startDateTime = e.start.dateTime || e.start.date
      const startDate = e.start.date || (e.start.dateTime ? e.start.dateTime.slice(0, 10) : null)

      if (startDateTime && startDate) {
        if (e.id) eventsMap.set(e.id.toLowerCase(), { startDateTime, startDate })
        if (e.iCalUID) eventsMap.set(e.iCalUID.toLowerCase(), { startDateTime, startDate })
        if (e.iCalUID) eventsMap.set(e.iCalUID.toLowerCase().replace('@google.com', ''), { startDateTime, startDate })
        if (e.htmlLink) {
          try {
            const urlParams = new URLSearchParams(e.htmlLink.split('?')[1] || '')
            const eid = urlParams.get('eid')
            if (eid) eventsMap.set(eid.toLowerCase(), { startDateTime, startDate })
          } catch {}
        }
      }
    }
  } catch (err) {
    console.error('Backend GCal Sync: Failed to fetch calendar events', err)
  }

  return eventsMap
}
