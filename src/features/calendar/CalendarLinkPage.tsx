import { useEffect, useMemo, useState } from 'react'
import { useGoogleCalendarAuth } from './GoogleCalendarContext'

type CalendarItem = {
  id: string
  summary: string
}

type CalendarEvent = {
  id: string
  summary?: string
  description?: string
  location?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  attendees?: Array<{ email?: string; displayName?: string }>
}

type Technician = {
  id: string
  name: string
}

type DayMeta = {
  key: string
  weekdayLabel: string
  dateLabel: string
  isoStart: string
  isoEnd: string
}

const TECHNICIANS: Technician[] = [
  { id: 'nimrod', name: 'נמרוד כפרי' },
  { id: 'or', name: 'אור ויינשטיין' },
  { id: 'idan', name: 'עידן קורן' },
  { id: 'dani', name: 'דני בורדה' },
  { id: 'ran', name: 'רן שחם' },
  { id: 'sivan', name: 'סיוון שפר' },
]

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

function eventSearchText(event: CalendarEvent) {
  const attendeeText = (event.attendees || [])
    .map((attendee) => `${attendee.displayName || ''} ${attendee.email || ''}`.trim())
    .join(' ')

  return [event.summary || '', event.description || '', event.location || '', attendeeText].join(' ').toLowerCase()
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

export function CalendarLinkPage() {
  const { accessToken, isReady: isGoogleReady, error: authError, requestToken } = useGoogleCalendarAuth()
  const [selectedCalendarId, setSelectedCalendarId] = useState('')
  const [selectedCalendarName, setSelectedCalendarName] = useState(TARGET_CALENDAR_NAME)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedTask, setSelectedTask] = useState<{ technician: string; event: CalendarEvent } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])

  // Initialize calendar when token becomes available
  useEffect(() => {
    if (!accessToken) return
    let canceled = false

    async function init() {
      setIsLoading(true)
      try {
        await initializeCalendar(accessToken!)
      } catch {
        if (!canceled) setError('נכשלה משיכת יומנים/אירועים מ-Google Calendar.')
      } finally {
        if (!canceled) setIsLoading(false)
      }
    }

    init()
    return () => { canceled = true }
  }, [accessToken])

  useEffect(() => {
    if (!accessToken || !selectedCalendarId) return

    pullWeekEvents(selectedCalendarId, accessToken).catch(() => {
      setError('נכשלה משיכת אירועי שבוע.')
    })
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

  const tasksGrid = useMemo(() => {
    const daySet = new Set(weekDays.map((day) => day.key))
    const map = new Map<string, CalendarEvent[]>()

    for (const technician of TECHNICIANS) {
      for (const day of weekDays) {
        map.set(`${technician.id}|${day.key}`, [])
      }
    }

    for (const event of events) {
      const start = eventStartDate(event)
      if (!start) continue

      const dayKey = toIsoDateKey(start)
      if (!daySet.has(dayKey)) continue

      const haystack = eventSearchText(event)

      for (const technician of TECHNICIANS) {
        const matched = haystack.includes(technician.name.toLowerCase()) || haystack.includes(technician.id.toLowerCase())
        if (!matched) continue

        const key = `${technician.id}|${dayKey}`
        map.set(key, [...(map.get(key) || []), event])
      }
    }

    return map
  }, [events, weekDays])

  return (
    <section className="calendar-layout">
      <article className="panel calendar-panel compact-head-panel">
        <div className="calendar-header-row compact-controls-row">
          <div className="calendar-actions">
            <button
              type="button"
              className="tab"
              onClick={() => requestToken(accessToken ? '' : 'consent')}
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
              {TECHNICIANS.map((technician) => (
                <tr key={technician.id}>
                  <td className="tech-col tech-name">{technician.name}</td>
                  {weekDays.map((day) => {
                    const cellTasks = tasksGrid.get(`${technician.id}|${day.key}`) || []

                    return (
                      <td key={`${technician.id}-${day.key}`} className="day-cell">
                        {cellTasks.length === 0 ? <span className="cell-empty">-</span> : null}
                        {cellTasks.map((task) => (
                          <button
                            key={`${technician.id}-${day.key}-${task.id}`}
                            type="button"
                            className="cell-task"
                            onClick={() => setSelectedTask({ technician: technician.name, event: task })}
                          >
                            <strong>{eventTimeLabel(task)}</strong>
                            <span>{task.summary || 'ללא כותרת'}</span>
                          </button>
                        ))}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {selectedTask ? (
        <article className="panel task-details-panel">
          <div className="task-details-header">
            <h3>פרטי משימה</h3>
            <button type="button" className="tab" onClick={() => setSelectedTask(null)}>
              סגור
            </button>
          </div>
          <p>
            <strong>טכנאי:</strong> {selectedTask.technician}
          </p>
          <p>
            <strong>כותרת:</strong> {selectedTask.event.summary || 'ללא כותרת'}
          </p>
          <p>
            <strong>מועד:</strong> {eventTimeLabel(selectedTask.event)}
          </p>
          <p>
            <strong>מיקום:</strong> {selectedTask.event.location || 'לא צוין'}
          </p>
          <p>
            <strong>תיאור:</strong> {selectedTask.event.description || 'אין תיאור'}
          </p>
        </article>
      ) : null}
    </section>
  )
}

