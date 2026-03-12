import { google } from 'googleapis'

export async function fetchGoogleCalendarEventsByRefs(
  calendarId: string,
  eventRefs: string[]
): Promise<Map<string, { startDateTime: string; startDate: string }>> {
  if (eventRefs.length === 0) return new Map()

  const serviceAccountJsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJsonStr) {
    console.warn('Backend GCal Sync: No GOOGLE_SERVICE_ACCOUNT_JSON provided in .env.local')
    return new Map() // return empty if no SA attached
  }

  let credentials;
  try {
    credentials = JSON.parse(serviceAccountJsonStr)
  } catch (err) {
    console.error('Backend GCal Sync: Invalid JSON in GOOGLE_SERVICE_ACCOUNT_JSON', err)
    return new Map()
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  })

  const calendar = google.calendar({ version: 'v3', auth })
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
