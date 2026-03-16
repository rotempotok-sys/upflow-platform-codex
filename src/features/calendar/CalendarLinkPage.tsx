import { useEffect, useMemo, useState } from 'react'
import { useGoogleCalendarAuth } from './GoogleCalendarContext'
import type { RuntimeAssignmentSnapshot, RuntimeScheduleEntrySnapshot, RuntimeUserSnapshot } from '../../types/scheduling'

type CalendarItem = {
  id: string
  summary: string
}

type CalendarEvent = {
  id: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  attendees?: Array<{ email?: string; displayName?: string }>
}

type Technician = {
  id: string
  name: string
  /** Additional strings to match in event text (emails, English names, etc.) */
  aliases: string[]
}

type DayMeta = {
  key: string
  weekdayLabel: string
  dateLabel: string
  isoStart: string
  isoEnd: string
}

/** Build technicians list from Supabase users, merged by displayName */
function buildTechnicians(usersData: RuntimeUserSnapshot[]): Technician[] {
  const byName = new Map<string, Technician>()

  for (const u of usersData) {
    if (!u.role || u.role === 'Viewer') continue

    const existing = byName.get(u.displayName)
    if (existing) {
      // Merge emails as aliases
      const email = u.email.toLowerCase()
      if (!existing.aliases.includes(email)) existing.aliases.push(email)
    } else {
      byName.set(u.displayName, {
        id: u.displayName,
        name: u.displayName,
        aliases: [u.email.toLowerCase()],
      })
    }
  }

  return Array.from(byName.values())
}

const WEEKDAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

const TARGET_CALENDAR_NAME = import.meta.env.VITE_GOOGLE_TARGET_CALENDAR_NAME?.trim() || 'לוז טכנאים'
const TARGET_CALENDAR_ID = import.meta.env.VITE_GOOGLE_TARGET_CALENDAR_ID?.trim() || 'upflow.operations@gmail.com'

function startOfWeekSunday(baseDate: Date) {
  const date = new Date(baseDate)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
  return date
}

function toIsoDateKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getWeekDays(weekOffset: number): DayMeta[] {
  const start = startOfWeekSunday(new Date())
  start.setDate(start.getDate() + weekOffset * 7)

  const days: DayMeta[] = []

  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)

    const dateEnd = new Date(date)
    dateEnd.setDate(date.getDate() + 1)

    days.push({
      key: toIsoDateKey(date),
      weekdayLabel: WEEKDAY_LABELS[i],
      dateLabel: date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
      isoStart: date.toISOString(),
      isoEnd: dateEnd.toISOString(),
    })
  }

  return days
}

/** Convert URLs in text to clickable <a> elements, preserving the rest as text */
function linkifyText(text: string): (string | JSX.Element)[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const url = match[1]
    parts.push(
      <a key={match.index} href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>
        {url}
      </a>
    )
    lastIndex = urlRegex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

function eventSearchText(event: CalendarEvent) {
  const attendeeText = (event.attendees || [])
    .map((attendee) => `${attendee.displayName || ''} ${attendee.email || ''}`.trim())
    .join(' ')

  return [event.summary || '', event.description || '', event.location || '', attendeeText].join(' ').toLowerCase()
}

/** Extract "מזהה משימה: XXXX" from event description */
function extractOperationId(event: CalendarEvent): string | null {
  // 1. Try description field: "מזהה משימה: 2240"
  if (event.description) {
    const descMatch = event.description.match(/מזהה משימה:\s*(\d+)/)
    if (descMatch) return descMatch[1]
  }
  // 2. Fallback: extract leading number from summary (e.g. "2240 - שם לקוח")
  if (event.summary) {
    const summaryMatch = event.summary.match(/^(\d{3,})/)
    if (summaryMatch) return summaryMatch[1]
  }
  return null
}

function eventStartDate(event: CalendarEvent) {
  const raw = event.start?.dateTime || event.start?.date
  if (!raw) return null

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null

  return parsed
}

function eventTimeLabel(event: CalendarEvent) {
  const raw = event.start?.dateTime
  if (!raw) return 'כל היום'

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return 'שעה לא ידועה'

  return parsed.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

function weekTitle(days: DayMeta[]) {
  if (!days.length) return ''
  const first = days[0]
  const last = days[days.length - 1]
  return `${first.dateLabel} - ${last.dateLabel}`
}

/** Format full date with day name */
function eventFullDate(event: CalendarEvent) {
  const raw = event.start?.dateTime || event.start?.date
  if (!raw) return 'לא ידוע'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return 'לא ידוע'
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  const dayName = dayNames[d.getDay()]
  const dateStr = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `יום ${dayName}, ${dateStr}`
}

function eventTimeRange(event: CalendarEvent) {
  const startRaw = event.start?.dateTime
  const endRaw = event.end?.dateTime
  if (!startRaw) return 'כל היום'
  const s = new Date(startRaw)
  const fmt = (d: Date) => d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  if (!endRaw) return fmt(s)
  const e = new Date(endRaw)
  return `${fmt(s)} - ${fmt(e)}`
}

/** Compute event duration in minutes */
function eventDurationMinutes(event: CalendarEvent): number {
  const s = event.start?.dateTime ? new Date(event.start.dateTime) : null
  const e = event.end?.dateTime ? new Date(event.end.dateTime) : null
  if (!s || !e) return 30
  return Math.round((e.getTime() - s.getTime()) / 60000)
}

/** PATCH a Google Calendar event */
async function patchGoogleEvent(calendarId: string, eventId: string, token: string, body: Record<string, unknown>) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`

  // If we're changing start/end, we need to GET+PUT to handle all-day → timed conversion
  const hasTimeChange = 'start' in body || 'end' in body
  if (hasTimeChange) {
    const getRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!getRes.ok) {
      const err = await getRes.text()
      throw new Error(`Google Calendar GET failed (${getRes.status}): ${err}`)
    }
    const existing = await getRes.json()
    // Merge patch fields into existing event
    const updated = { ...existing, ...body }
    // If converting from all-day (date) to timed (dateTime), remove the date fields
    if (body.start && (body.start as any).dateTime) {
      delete updated.start.date
    }
    if (body.end && (body.end as any).dateTime) {
      delete updated.end.date
    }
    console.log('[CalendarSave] PUT body start:', JSON.stringify(updated.start), 'end:', JSON.stringify(updated.end))
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    if (!putRes.ok) {
      const err = await putRes.text()
      throw new Error(`Google Calendar PUT failed (${putRes.status}): ${err}`)
    }
    return putRes.json() as Promise<CalendarEvent>
  }

  // Simple PATCH for non-time changes (summary, description, attendees)
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google Calendar PATCH failed (${res.status}): ${err}`)
  }
  return res.json() as Promise<CalendarEvent>
}

export function CalendarLinkPage({ usersData = [], assignmentsData = [], scheduleEntriesData = [] }: { usersData?: RuntimeUserSnapshot[]; assignmentsData?: RuntimeAssignmentSnapshot[]; scheduleEntriesData?: RuntimeScheduleEntrySnapshot[] }) {
  const { accessToken, isReady: isGoogleReady, error: authError, needsReauth, fetchToken } = useGoogleCalendarAuth()
  const technicians = useMemo(() => buildTechnicians(usersData), [usersData])

  // Build lookup: Google Calendar event ID → schedule entry (for Monday sync)
  const scheduleByCalRef = useMemo(() => {
    const m = new Map<string, RuntimeScheduleEntrySnapshot>()
    for (const entry of scheduleEntriesData) {
      if (entry.calendarEventRef) {
        // calendarEventRef may contain the full event ID or partial — normalize
        m.set(entry.calendarEventRef.toLowerCase(), entry)
      }
    }
    return m
  }, [scheduleEntriesData])
  const [selectedCalendarId, setSelectedCalendarId] = useState('')
  const [selectedCalendarName, setSelectedCalendarName] = useState(TARGET_CALENDAR_NAME)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedTask, setSelectedTask] = useState<{ technician: string; event: CalendarEvent } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Modal edit state
  const [editTech, setEditTech] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editEndTime, setEditEndTime] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])

  // Initialize modal edit fields when task is selected
  useEffect(() => {
    if (!selectedTask) return
    const ev = selectedTask.event
    setEditTech(selectedTask.technician === 'ללא שיוך' ? '' : selectedTask.technician)
    const startDt = ev.start?.dateTime ? new Date(ev.start.dateTime) : null
    setEditDate(startDt ? toIsoDateKey(startDt) : '')
    // Snap to nearest 30-min slot
    const snap30 = (dt: Date) => {
      const h = dt.getHours()
      const m = dt.getMinutes()
      const snapped = m < 15 ? 0 : m < 45 ? 30 : 0
      const hh = String(snapped === 0 && m >= 45 ? h + 1 : h).padStart(2, '0')
      return `${hh}:${snapped === 0 ? '00' : '30'}`
    }
    setEditTime(startDt ? snap30(startDt) : '')
    const endDtInit = ev.end?.dateTime ? new Date(ev.end.dateTime) : null
    setEditEndTime(endDtInit ? snap30(endDtInit) : '')
    setSaveMsg(null)
  }, [selectedTask?.event.id])

  /** Save changes → Google Calendar + Monday */
  async function handleSave() {
    if (!selectedTask || !accessToken || !selectedCalendarId) return
    setIsSaving(true)
    setSaveMsg(null)

    const ev = selectedTask.event
    const opId = extractOperationId(ev)
    // Try to find the schedule entry via calendarEventRef (Google event ID)
    const scheduleEntry = scheduleByCalRef.get(ev.id.toLowerCase())
      || Array.from(scheduleByCalRef.entries()).find(([k]) => ev.id.toLowerCase().includes(k) || k.includes(ev.id.toLowerCase()))?.[1]
      || null
    const scheduleItemId = scheduleEntry?.id || null
    const effectiveOpId = opId || scheduleEntry?.operationId || scheduleEntry?.operationIdRef || null
    console.log('[CalendarSave] opId:', opId, 'scheduleItemId:', scheduleItemId, 'effectiveOpId:', effectiveOpId, 'calRef keys:', [...scheduleByCalRef.keys()].slice(0, 5))
    const patchBody: Record<string, unknown> = {}

    // --- Technician change ---
    const techChanged = editTech !== selectedTask.technician && editTech !== ''
    const selectedTechObj = technicians.find((t) => t.name === editTech)

    if (techChanged && selectedTechObj) {
      // Update summary: prepend technician first name
      const firstName = editTech.split(' ')[0]
      const currentSummary = ev.summary || ''
      // Remove any existing technician prefix (first word before the ID number)
      const baseSummary = currentSummary.replace(/^[^\d]*(?=\d)/, '').trim() || currentSummary
      patchBody.summary = `${firstName} - ${baseSummary}`

      // Update description: fill in טכנאי: field
      if (ev.description) {
        patchBody.description = ev.description.replace(/(טכנאי:\s*)(.*)/, `$1${editTech}`)
      }

      // Add as attendee
      const existingAttendees = (ev.attendees || []).filter(
        (a) => !selectedTechObj.aliases.includes((a.email || '').toLowerCase()),
      )
      patchBody.attendees = [
        ...existingAttendees,
        { email: selectedTechObj.aliases[0], displayName: editTech },
      ]
    }

    // --- Date/time change ---
    const origStart = ev.start?.dateTime ? new Date(ev.start.dateTime) : null
    const origEnd = ev.end?.dateTime ? new Date(ev.end.dateTime) : null
    const origDate = origStart ? toIsoDateKey(origStart) : ''
    const origTime = origStart ? origStart.toTimeString().slice(0, 5) : ''
    const origEndTime = origEnd ? origEnd.toTimeString().slice(0, 5) : ''
    const dateChanged = editDate !== origDate || editTime !== origTime || editEndTime !== origEndTime

    if (dateChanged && editDate && editTime && editEndTime) {
      // Compute Israel offset (+02:00 or +03:00 during DST)
      const probe = new Date(`${editDate}T12:00:00`)
      const offsetMin = -probe.getTimezoneOffset()
      const sign = offsetMin >= 0 ? '+' : '-'
      const absH = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0')
      const absM = String(Math.abs(offsetMin) % 60).padStart(2, '0')
      const tz = `${sign}${absH}:${absM}`
      // If end time is before start time, assume next day
      const endDate = editEndTime <= editTime
        ? toIsoDateKey(new Date(new Date(`${editDate}T12:00:00`).getTime() + 86400000))
        : editDate
      // RFC3339 with explicit offset
      patchBody.start = { dateTime: `${editDate}T${editTime}:00${tz}` }
      patchBody.end = { dateTime: `${endDate}T${editEndTime}:00${tz}` }
    }

    if (Object.keys(patchBody).length === 0) {
      setSaveMsg({ type: 'ok', text: 'אין שינויים לשמור' })
      setIsSaving(false)
      return
    }

    try {
      // 1. Update Google Calendar
      console.log('[CalendarSave] calendarId:', selectedCalendarId, 'eventId:', ev.id)
      console.log('[CalendarSave] patchBody:', JSON.stringify(patchBody, null, 2))
      const updated = await patchGoogleEvent(selectedCalendarId, ev.id, accessToken, patchBody)

      // 2. Update Monday — technician assignment (use effectiveOpId)
      if (effectiveOpId && techChanged && selectedTechObj) {
        try {
          await fetch('/api/monday/operations/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationId: effectiveOpId, technicianName: editTech, technicianEmail: selectedTechObj.aliases[0] }),
          })
        } catch (mondayErr) {
          console.warn('Monday assign update failed:', mondayErr)
        }
      }

      // 3. Update Monday — date/time change
      if (dateChanged && editDate) {
        try {
          // If we have a direct schedule item ID, update it directly; otherwise search by operationId
          const payload: Record<string, string> = { date: editDate }
          if (editTime) payload.startTime = editTime
          if (editEndTime) payload.endTime = editEndTime
          if (scheduleItemId) payload.scheduleItemId = scheduleItemId
          if (effectiveOpId) payload.operationId = effectiveOpId
          console.log('[CalendarSave] Monday date update:', payload)
          const dateRes = await fetch('/api/monday/operations/update-date', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const dateResult = await dateRes.json()
          console.log('[CalendarSave] Monday date result:', dateResult)
        } catch (mondayErr) {
          console.warn('Monday date update failed:', mondayErr)
        }
      }

      // Update local state
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, ...updated } : e)))
      setSelectedTask({ technician: editTech || selectedTask.technician, event: { ...ev, ...updated } })
      const hasMondayLink = !!(effectiveOpId || scheduleItemId)
      const mondayNote = !hasMondayLink ? ' (ללא עדכון מאנדיי — אין קישור)' : ''
      setSaveMsg({ type: 'ok', text: `נשמר בהצלחה${mondayNote}` })
    } catch (err) {
      setSaveMsg({ type: 'err', text: `שגיאה: ${err instanceof Error ? err.message : 'לא ידועה'}` })
    } finally {
      setIsSaving(false)
    }
  }

  // Initialize calendar when token becomes available, or fallback to backend
  useEffect(() => {
    let canceled = false

    async function init() {
      setIsLoading(true)
      try {
        if (accessToken) {
          // Direct Google Calendar API access (admin/operations users)
          await initializeCalendar(accessToken)
        } else if (isGoogleReady) {
          // No direct access — use backend Service Account endpoint
          await pullEventsFromBackend()
        }
      } catch {
        if (!canceled) setError('נכשלה משיכת יומנים/אירועים.')
      } finally {
        if (!canceled) setIsLoading(false)
      }
    }

    init()
    return () => { canceled = true }
  }, [accessToken, isGoogleReady])

  useEffect(() => {
    if (!selectedCalendarId) return

    if (accessToken) {
      pullWeekEvents(selectedCalendarId, accessToken).catch(() => {
        setError('נכשלה משיכת אירועי שבוע.')
      })
    } else if (isGoogleReady) {
      pullEventsFromBackend().catch(() => {
        setError('נכשלה משיכת אירועי שבוע.')
      })
    }
  }, [weekOffset])

  async function googleGet<T>(path: string, token: string): Promise<T> {
    const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Google API ${response.status}`)
    }

    return response.json() as Promise<T>
  }

  async function initializeCalendar(token: string) {
    setIsLoading(true)

    try {
      type CalendarListResponse = { items?: CalendarItem[] }
      const calendarList = await googleGet<CalendarListResponse>('/users/me/calendarList', token)
      const calendars = calendarList.items || []

      let chosenId = TARGET_CALENDAR_ID
      let chosenName = TARGET_CALENDAR_NAME

      if (!chosenId) {
        const byName = calendars.find((item) => item.summary === TARGET_CALENDAR_NAME)
        chosenId = byName?.id || calendars[0]?.id || ''
      }

      if (chosenId) {
        const selected = calendars.find((item) => item.id === chosenId)
        chosenName = selected?.summary || chosenName
      }

      setSelectedCalendarId(chosenId)
      setSelectedCalendarName(chosenName)

      if (chosenId) {
        await pullWeekEvents(chosenId, token)
      } else {
        setEvents([])
        setError('לא נמצא יומן זמין להצגה.')
      }
    } catch {
      setError('נכשלה משיכת יומנים/אירועים מ-Google Calendar.')
    } finally {
      setIsLoading(false)
    }
  }

  async function pullWeekEvents(calendarId: string, token: string) {
    if (!weekDays.length) return

    const rangeStart = weekDays[0].isoStart
    const rangeEnd = weekDays[weekDays.length - 1].isoEnd

    type EventsResponse = { items?: CalendarEvent[] }

    const params = new URLSearchParams({
      timeMin: rangeStart,
      timeMax: rangeEnd,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '500',
    })

    const payload = await googleGet<EventsResponse>(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`, token)
    setEvents(payload.items || [])
  }

  /** Fetch events from backend Service Account (for technicians without direct calendar access) */
  async function pullEventsFromBackend() {
    const response = await fetch('/api/calendar/my-events', {
      method: 'GET',
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Backend calendar API ${response.status}`)
    }

    const data = await response.json() as { events?: CalendarEvent[]; calendarId?: string }
    setEvents(data.events || [])
    if (data.calendarId) {
      setSelectedCalendarId(data.calendarId)
    }
    setSelectedCalendarName(TARGET_CALENDAR_NAME)
  }

  // Build operationId → technician name(s) lookup from assignments
  const opToTechnicians = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const a of assignmentsData) {
      if (!a.technicianName) continue
      const existing = m.get(a.operationId) || []
      if (!existing.includes(a.technicianName)) existing.push(a.technicianName)
      m.set(a.operationId, existing)
    }
    return m
  }, [assignmentsData])

  const tasksGrid = useMemo(() => {
    const daySet = new Set(weekDays.map((day) => day.key))
    const map = new Map<string, CalendarEvent[]>()

    for (const technician of technicians) {
      for (const day of weekDays) {
        map.set(`${technician.id}|${day.key}`, [])
      }
    }
    // Initialize unassigned row
    for (const day of weekDays) {
      map.set(`__unassigned__|${day.key}`, [])
    }

    for (const event of events) {
      const start = eventStartDate(event)
      if (!start) continue

      const dayKey = toIsoDateKey(start)
      if (!daySet.has(dayKey)) continue

      let matchedAny = false

      // Strategy 1: Match via operationId from description → assignments
      const opId = extractOperationId(event)
      if (opId) {
        const assignedNames = opToTechnicians.get(opId) || []
        for (const techName of assignedNames) {
          const tech = technicians.find((t) => t.name === techName)
          if (tech) {
            matchedAny = true
            const key = `${tech.id}|${dayKey}`
            map.set(key, [...(map.get(key) || []), event])
          }
        }
      }

      // Strategy 2: Fallback — text match (name/email in event text)
      if (!matchedAny) {
        const haystack = eventSearchText(event)
        for (const technician of technicians) {
          const matched =
            haystack.includes(technician.name.toLowerCase()) ||
            technician.aliases.some((alias) => haystack.includes(alias))
          if (!matched) continue

          matchedAny = true
          const key = `${technician.id}|${dayKey}`
          map.set(key, [...(map.get(key) || []), event])
        }
      }

      if (!matchedAny) {
        // Place in "unassigned" row
        const key = `__unassigned__|${dayKey}`
        map.set(key, [...(map.get(key) || []), event])
      }
    }

    return map
  }, [events, weekDays, technicians, opToTechnicians])

  return (
    <section className="calendar-layout">
      <article className="panel calendar-panel compact-head-panel">
        <div className="calendar-header-row compact-controls-row">
          <div className="calendar-actions">
            <button
              type="button"
              className="tab"
              onClick={() => {
                if (needsReauth || !accessToken) {
                  window.location.href = '/api/auth/google/start?prompt=consent'
                } else {
                  fetchToken()
                }
              }}
              disabled={!isGoogleReady || isLoading}
            >
              {accessToken ? 'רענון מגוגל' : 'חיבור ל-Google Calendar'}
            </button>
          </div>
        </div>

        <div className="week-toolbar">
          <button
            type="button"
            className="week-nav"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            aria-label="שבוע קודם"
          >
            ▶
          </button>
          <div className="week-title-wrap">
            <strong>{weekTitle(weekDays)}</strong>
            <span>{selectedCalendarName}</span>
          </div>
          <button
            type="button"
            className="week-nav"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            aria-label="שבוע הבא"
          >
            ◀
          </button>
        </div>

        {(error || authError) ? <p className="calendar-error">{error || authError}</p> : null}
      </article>

      <article className="panel schedule-board-wrap">
        <div className="schedule-scroll">
          <table className="schedule-table">
            <thead>
              <tr>
                <th className="tech-col">טכנאי / יום</th>
                {weekDays.map((day) => (
                  <th key={day.key}>
                    <div className="day-head">
                      <span>{day.weekdayLabel}</span>
                      <small>{day.dateLabel}</small>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const DISPLAY_ORDER = [
                  '__unassigned__',
                  'רותם פוטוק',
                  'נמרוד כפרי',
                  'אור ויינשטיין',
                  'עידן קורן',
                  'דני בורדה',
                  'אופיר גרונר',
                  'ברק מרדוק',
                  'עידו שני',
                ]

                // Build ordered rows: fixed order first, then any extras not in the list
                const orderedIds = [...DISPLAY_ORDER]
                for (const t of technicians) {
                  if (!orderedIds.includes(t.id)) orderedIds.push(t.id)
                }

                // Check if a row has any events this week
                const rowHasEvents = (rowId: string) =>
                  weekDays.some((day) => (tasksGrid.get(`${rowId}|${day.key}`) || []).length > 0)

                return orderedIds.filter(rowHasEvents).map((rowId) => {
                  const isUnassigned = rowId === '__unassigned__'
                  const label = isUnassigned ? 'ללא שיוך' : rowId

                  return (
                    <tr key={rowId} className={isUnassigned ? 'unassigned-row' : ''}>
                      <td
                        className="tech-col tech-name"
                        style={isUnassigned ? { color: '#c62828', fontWeight: 700 } : undefined}
                      >
                        {label}
                      </td>
                      {weekDays.map((day) => {
                        const cellTasks = tasksGrid.get(`${rowId}|${day.key}`) || []

                        return (
                          <td key={`${rowId}-${day.key}`} className="day-cell">
                            {cellTasks.length === 0 ? <span className="cell-empty">-</span> : null}
                            {cellTasks.map((task) => (
                              <button
                                key={`${rowId}-${day.key}-${task.id}`}
                                type="button"
                                className="cell-task"
                                style={isUnassigned ? { borderColor: '#c62828', background: '#ffebee' } : undefined}
                                onClick={() => setSelectedTask({ technician: label, event: task })}
                              >
                                <strong>{eventTimeLabel(task)}</strong>
                                <span>{task.summary || 'ללא כותרת'}</span>
                              </button>
                            ))}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
      </article>

      {selectedTask ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedTask(null) }}
        >
          <article
            className="panel"
            dir="rtl"
            style={{
              width: '90%',
              maxWidth: 560,
              maxHeight: '85vh',
              overflow: 'auto',
              padding: '1.5rem',
              borderRadius: '12px',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>{selectedTask.event.summary || 'ללא כותרת'}</h3>
              <button type="button" className="tab" onClick={() => setSelectedTask(null)}>
                סגור
              </button>
            </div>

            {/* Date / Day / Time display */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '0.9rem' }}>
              <span><strong>תאריך:</strong> {eventFullDate(selectedTask.event)}</span>
              <span><strong>שעות:</strong> {eventTimeRange(selectedTask.event)}</span>
            </div>

            <p style={{ margin: '4px 0' }}>
              <strong>טכנאי נוכחי:</strong> {selectedTask.technician}
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>מיקום:</strong> {selectedTask.event.location || 'לא צוין'}
            </p>

            {/* Description */}
            <p style={{ marginBottom: '4px', marginTop: '12px' }}>
              <strong>תיאור:</strong>
            </p>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', background: 'var(--surface-alt, #1e293b)', color: 'var(--text-primary, #e2e8f0)', padding: '12px', borderRadius: '6px', maxHeight: '180px', overflow: 'auto', margin: 0, fontFamily: 'inherit', lineHeight: 1.6 }}>
              {selectedTask.event.description ? linkifyText(selectedTask.event.description) : 'אין תיאור'}
            </div>

            {/* Edit section */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '16px', paddingTop: '16px' }}>
              <h4 style={{ margin: '0 0 12px' }}>עריכה</h4>

              {/* Technician select */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}><strong>שיוך טכנאי:</strong></label>
                <select
                  value={editTech}
                  onChange={(e) => setEditTech(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'var(--surface-alt, #1e293b)', color: 'var(--text-primary, #e2e8f0)', fontSize: '0.9rem' }}
                >
                  <option value="">-- ללא שיוך --</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Date picker */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}><strong>תאריך:</strong></label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'var(--surface-alt, #1e293b)', color: 'var(--text-primary, #e2e8f0)', fontSize: '0.9rem' }}
                />
              </div>

              {/* Time range picker */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}><strong>שעת התחלה:</strong></label>
                  <select
                    value={editTime}
                    onChange={(e) => {
                      setEditTime(e.target.value)
                      // Auto-advance end time by 30 min if end is before new start
                      if (editEndTime && e.target.value >= editEndTime) {
                        const [h, m] = e.target.value.split(':').map(Number)
                        const total = h * 60 + m + 30
                        const eh = String(Math.floor(total / 60) % 24).padStart(2, '0')
                        const em = String(total % 60).padStart(2, '0')
                        setEditEndTime(`${eh}:${em}`)
                      }
                    }}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'var(--surface-alt, #1e293b)', color: 'var(--text-primary, #e2e8f0)', fontSize: '0.9rem' }}
                  >
                    <option value="">--</option>
                    {Array.from({ length: 48 }, (_, i) => {
                      const hh = String(Math.floor(i / 2)).padStart(2, '0')
                      const mm = i % 2 === 0 ? '00' : '30'
                      return <option key={`s${i}`} value={`${hh}:${mm}`}>{`${hh}:${mm}`}</option>
                    })}
                  </select>
                </div>
                <span style={{ paddingTop: '22px', fontSize: '1rem' }}>—</span>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}><strong>שעת סיום:</strong></label>
                  <select
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'var(--surface-alt, #1e293b)', color: 'var(--text-primary, #e2e8f0)', fontSize: '0.9rem' }}
                  >
                    <option value="">--</option>
                    {Array.from({ length: 48 }, (_, i) => {
                      const hh = String(Math.floor(i / 2)).padStart(2, '0')
                      const mm = i % 2 === 0 ? '00' : '30'
                      return <option key={`e${i}`} value={`${hh}:${mm}`}>{`${hh}:${mm}`}</option>
                    })}
                  </select>
                </div>
              </div>

              {/* Save button */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="tab"
                  disabled={isSaving}
                  onClick={() => void handleSave()}
                  style={{ padding: '8px 20px', fontWeight: 600 }}
                >
                  {isSaving ? 'שומר...' : 'שמור שינויים'}
                </button>

                {selectedTask.event.htmlLink ? (
                  <a
                    href={selectedTask.event.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tab"
                    style={{ textDecoration: 'none', textAlign: 'center', padding: '8px 16px' }}
                  >
                    פתח ב-Google Calendar
                  </a>
                ) : null}

                {saveMsg ? (
                  <span style={{ fontSize: '0.85rem', color: saveMsg.type === 'ok' ? '#52c41a' : '#ff4d4f' }}>
                    {saveMsg.text}
                  </span>
                ) : null}
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  )
}

