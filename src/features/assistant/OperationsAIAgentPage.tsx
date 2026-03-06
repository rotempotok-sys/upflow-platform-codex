import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { clients as fallbackClients } from '../../data/clientsData'
import { facilities as fallbackFacilities } from '../../data/facilitiesData'
import { pendingTasks, technicians } from '../../data/teamData'
import type { Client, FacilityRecord } from '../../types/scheduling'

type ChatRole = 'user' | 'assistant'

interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  model?: string
}

interface StoredMessage {
  role: ChatRole
  text: string
  model?: string
  ts: string
}

interface MemoryPayload {
  history: StoredMessage[]
  longTerm: string[]
  hiveSummary: string
}

interface AiResponse {
  answer: string
  model: string
  complexity: 'simple' | 'complex'
  memory?: MemoryPayload & { contextWindowSize: number }
}

interface OperationsAIAgentPageProps {
  clientsData?: Client[]
  facilitiesData?: FacilityRecord[]
}

const USER_ID_STORAGE_KEY = 'upflow_user_id'

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function getOrCreateUserId() {
  const existing = localStorage.getItem(USER_ID_STORAGE_KEY)
  if (existing) return existing

  const created = `user-${crypto.randomUUID()}`
  localStorage.setItem(USER_ID_STORAGE_KEY, created)
  return created
}

function summarizeFacilityStatuses(facilityRows: FacilityRecord[]) {
  return facilityRows.reduce(
    (summary, facility) => {
      if (facility.facilityStatus.includes('פעיל')) {
        summary.active += 1
      } else if (facility.facilityStatus.includes('הקמה') || facility.facilityStatus.includes('הרצה')) {
        summary.setup += 1
      } else if (facility.facilityStatus.includes('מושבת')) {
        summary.down += 1
      } else {
        summary.other += 1
      }

      return summary
    },
    { active: 0, setup: 0, down: 0, other: 0 },
  )
}

function extractKeywords(question: string) {
  return normalizeText(question)
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length >= 2)
    .slice(0, 12)
}

function normalizeBoardValue(value: string | null | undefined) {
  if (!value) return ''
  return value.replace(/\s+/g, ' ').trim()
}

function buildFullFacilitiesBoardContext(facilityRows: FacilityRecord[]) {
  return facilityRows
    .map((facility) => {
      const header = [
        `מזהה: ${facility.id}`,
        `שם: ${facility.name}`,
        `יישוב: ${facility.city}`,
        `קבוצה: ${facility.group}`,
        `סוג מתקן: ${facility.facilityType}`,
        `סטטוס: ${facility.facilityStatus}`,
        `חוזה: ${facility.contractType}`,
      ].join(' | ')

      const columns = facility.columns
        .map((column) => {
          const textValue = normalizeBoardValue(column.text)
          const rawValue = normalizeBoardValue(column.value)
          const displayValue = textValue || rawValue
          if (!displayValue) return null
          return `- ${column.title} (${column.id}): ${displayValue}`
        })
        .filter((value): value is string => Boolean(value))

      return [header, ...columns].join('\n')
    })
    .join('\n\n')
}

function buildContextForQuestion(question: string, clientRows: Client[], facilityRows: FacilityRecord[]) {
  const keywords = extractKeywords(question)
  const statusSummary = summarizeFacilityStatuses(facilityRows)
  const fullFacilitiesBoardContext = buildFullFacilitiesBoardContext(facilityRows)

  const matchesQuestion = (value: string) => {
    const normalized = normalizeText(value)
    if (!normalized) return false
    return keywords.some((keyword) => normalized.includes(keyword))
  }

  const matchedClients = clientRows
    .filter((client) => {
      return [client.name, client.city, client.group, client.contractType, client.facilityType].some((field) => matchesQuestion(field))
    })
    .slice(0, 8)

  const matchedFacilities = facilityRows
    .filter((facility) => {
      return [facility.name, facility.city, facility.group, facility.facilityStatus, facility.facilityType].some((field) =>
        matchesQuestion(field),
      )
    })
    .slice(0, 8)

  const matchedTechnicians = technicians
    .filter((technician) => [technician.name, technician.role].some((field) => matchesQuestion(field)))
    .slice(0, 5)

  const matchedTasks = pendingTasks
    .filter((task) => {
      const owner = technicians.find((technician) => technician.id === task.technicianId)
      return [task.title, task.priority, owner?.name ?? ''].some((field) => matchesQuestion(field))
    })
    .slice(0, 10)

  const fallbackClients = clientRows.slice(0, 5)

  const clientLines = (matchedClients.length > 0 ? matchedClients : fallbackClients).map((client) => {
    return `${client.name} | עיר: ${client.city} | סטטוס: ${client.facilityStatus} | חוזה: ${client.contractType} | מזהה: ${client.id}`
  })

  const facilityLines = matchedFacilities.map((facility) => {
    return `${facility.name} | עיר: ${facility.city} | קבוצה: ${facility.group} | סוג: ${facility.facilityType} | סטטוס: ${facility.facilityStatus} | מזהה: ${facility.id}`
  })

  const technicianLines = technicians.map((technician) => {
    const openTasks = pendingTasks.filter((task) => task.technicianId === technician.id).length
    return `${technician.name} (${technician.role}) | משימות פתוחות: ${openTasks}`
  })

  const taskLines = (matchedTasks.length > 0 ? matchedTasks : pendingTasks).map((task) => {
    const owner = technicians.find((technician) => technician.id === task.technicianId)
    return `${task.title} | טכנאי: ${owner?.name ?? task.technicianId} | עדיפות: ${task.priority} | Monday: ${task.mondayId}`
  })

  const matchedTechLines = matchedTechnicians.map((technician) => `${technician.name} (${technician.role})`)

  return [
    `שאלה מקורית: ${question}`,
    `מילות מפתח: ${keywords.join(', ') || 'ללא מילות מפתח'}`,
    '',
    'סיכום מספרי:',
    `לקוחות: ${clientRows.length}`,
    `מתקנים: ${facilityRows.length}`,
    `משימות פתוחות: ${pendingTasks.length}`,
    `טכנאים פעילים: ${technicians.length}`,
    `מתקנים פעילים: ${statusSummary.active}`,
    `מתקנים בהקמה/הרצה: ${statusSummary.setup}`,
    `מתקנים מושבתים: ${statusSummary.down}`,
    '',
    'לקוחות רלוונטיים:',
    ...clientLines,
    '',
    'מתקנים רלוונטיים:',
    ...(facilityLines.length > 0 ? facilityLines : ['לא נמצאו מתקנים תואמים ישירות לשאלה']),
    '',
    'טכנאים:',
    ...technicianLines,
    '',
    'משימות:',
    ...taskLines,
    '',
    'טכנאים תואמים לשאלה (אם יש):',
    ...(matchedTechLines.length > 0 ? matchedTechLines : ['לא נמצאו התאמות ישירות']),
    '',
    'בורד תיקי מתקן מלא (כל הרשומות והעמודות הזמינות):',
    fullFacilitiesBoardContext,
  ].join('\n')
}

async function loadUserMemory(userId: string): Promise<MemoryPayload> {
  const response = await fetch('/api/ai/memory', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error || 'טעינת זיכרון נכשלה')
  }

  return payload as MemoryPayload
}

async function askOpenRouter(userId: string, question: string, context: string): Promise<AiResponse> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, question, context }),
  })

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload?.error || 'הקריאה ל-OpenRouter נכשלה')
  }

  return payload as AiResponse
}

const quickPrompts = [
  'איזה משאבה יש בעין המפרץ?',
  'כמה מתקנים פעילים וכמה מושבתים?',
  'מה עומס המשימות של הטכנאים כרגע?',
  'מי הלקוחות עם סטטוס מתקן מושבת?',
]

function mapStoredHistoryToUiMessages(history: StoredMessage[]) {
  return history.map((message, index) => ({
    id: `${message.role}-${message.ts}-${index}`,
    role: message.role,
    text: message.text,
    model: message.model,
  }))
}

function openExternalLink(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault()
  window.open(event.currentTarget.href, '_blank', 'noopener,noreferrer')
}

function renderLineWithLinks(line: string, lineIndex: number) {
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  const urlPattern = /https?:\/\/[^\s)]+/g
  const nodes: ReactNode[] = []
  let cursor = 0
  let segmentIndex = 0

  const pushText = (textValue: string) => {
    if (!textValue) return
    nodes.push(<span key={`txt-${lineIndex}-${segmentIndex++}`}>{textValue}</span>)
  }

  const pushLink = (url: string, label?: string) => {
    const display = (label || url).trim() || url
    nodes.push(
      <a
        key={`lnk-${lineIndex}-${segmentIndex++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="cgpt-link"
        onClick={openExternalLink}
      >
        {display}
      </a>,
    )
  }

  let markdownMatch: RegExpExecArray | null = null
  while ((markdownMatch = markdownLinkPattern.exec(line)) !== null) {
    const full = markdownMatch[0]
    const label = markdownMatch[1]
    const url = markdownMatch[2]
    const start = markdownMatch.index

    pushText(line.slice(cursor, start))
    pushLink(url, label)
    cursor = start + full.length
  }

  const tail = line.slice(cursor)
  if (tail.length === 0) {
    return nodes.length > 0 ? nodes : [<span key={`txt-${lineIndex}-0`} />]
  }

  let tailCursor = 0
  let urlMatch: RegExpExecArray | null = null
  while ((urlMatch = urlPattern.exec(tail)) !== null) {
    const url = urlMatch[0]
    const start = urlMatch.index
    pushText(tail.slice(tailCursor, start))
    pushLink(url)
    tailCursor = start + url.length
  }

  pushText(tail.slice(tailCursor))

  return nodes.length > 0 ? nodes : [<span key={`txt-${lineIndex}-0`}>{line}</span>]
}

function renderMessageContent(text: string) {
  const lines = text.split('\n')

  return lines.map((line, index) => (
    <span key={`line-${index}`}>
      {renderLineWithLinks(line, index)}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ))
}
export function OperationsAIAgentPage({ clientsData, facilitiesData }: OperationsAIAgentPageProps) {
  const clientRows = clientsData && clientsData.length > 0 ? clientsData : fallbackClients
  const facilityRows = facilitiesData && facilitiesData.length > 0 ? facilitiesData : fallbackFacilities

  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [memoryStatus, setMemoryStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [memoryError, setMemoryError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const threadRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const initializeMemory = async () => {
      try {
        const uid = getOrCreateUserId()
        setUserId(uid)
        const memory = await loadUserMemory(uid)
        const historyMessages = mapStoredHistoryToUiMessages(memory.history)

        if (historyMessages.length > 0) {
          setMessages(historyMessages)
        } else {
          setMessages([
            {
              id: 'welcome-assistant',
              role: 'assistant',
              text: 'אני סוכן Upflow. שאל על מתקנים, משאבות, לקוחות ומשימות טכנאים.',
              model: 'Upflow AI',
            },
          ])
        }

        setMemoryStatus('ready')
      } catch (error) {
        setMemoryStatus('error')
        setMemoryError(error instanceof Error ? error.message : 'שגיאה בטעינת זיכרון')
        setMessages([
          {
            id: 'welcome-assistant-fallback',
            role: 'assistant',
            text: 'אני סוכן Upflow. שאל על מתקנים, משאבות, לקוחות ומשימות טכנאים.',
            model: 'Upflow AI',
          },
        ])
      }
    }

    void initializeMemory()
  }, [])

  useEffect(() => {
    if (!threadRef.current) return

    const thread = threadRef.current
    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: 'auto',
    })
  }, [messages.length, isLoading])

  const kpis = useMemo(() => {
    const urgentTasks = pendingTasks.filter((task) => task.priority === 'P1').length
    const statusSummary = summarizeFacilityStatuses(facilityRows)

    return {
      totalClients: clientRows.length,
      totalFacilities: facilityRows.length,
      totalTasks: pendingTasks.length,
      urgentTasks,
      activeFacilities: statusSummary.active,
    }
  }, [clientRows, facilityRows])

  const submitQuestion = async (question: string) => {
    const normalized = normalizeText(question)
    if (!normalized || isLoading || !userId) return

    setIsLoading(true)
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: question.trim(),
    }

    setMessages((current) => [...current, userMessage])
    setInputValue('')

    try {
      const context = buildContextForQuestion(question, clientRows, facilityRows)
      const result = await askOpenRouter(userId, question, context)

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: result.answer.trim(),
          model: result.model,
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          text: `לא הצלחתי לקבל תשובה ממנוע ה-AI כרגע. שגיאה: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submitQuestion(inputValue)
  }

  const showStarters = messages.length <= 1

  return (
    <section className="cgpt-shell">
      <header className="cgpt-header panel">
        <h2>Upflow AI</h2>
        <p>
          מתקנים: {kpis.totalFacilities} | פעילים: {kpis.activeFacilities} | לקוחות: {kpis.totalClients} | משימות: {kpis.totalTasks} |
          P1: {kpis.urgentTasks}
        </p>
        <p>
          משתמש: {userId ?? 'מזהה נטען...'} | זיכרון: {memoryStatus === 'loading' ? 'נטען...' : memoryStatus === 'ready' ? 'פעיל' : 'שגיאה'}
          {memoryError ? ` | ${memoryError}` : ''}
        </p>
      </header>

      <section ref={threadRef} className="cgpt-thread panel" role="log" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} className={`cgpt-row ${message.role === 'user' ? 'cgpt-row-user' : 'cgpt-row-assistant'}`}>
            <div className="cgpt-avatar" aria-hidden>
              {message.role === 'user' ? 'U' : 'AI'}
            </div>
            <div className="cgpt-message-wrap">
              <div className="cgpt-role-line">
                <strong>{message.role === 'user' ? 'אתה' : 'Upflow AI'}</strong>
                {message.model ? <span>{message.model}</span> : null}
              </div>
              <p className="cgpt-message">{renderMessageContent(message.text)}</p>
            </div>
          </article>
        ))}

        {showStarters ? (
          <div className="cgpt-starters">
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" className="cgpt-starter-btn" onClick={() => void submitQuestion(prompt)} disabled={isLoading || !userId}>
                {prompt}
              </button>
            ))}
          </div>
        ) : null}

        {isLoading ? (
          <article className="cgpt-row cgpt-row-assistant">
            <div className="cgpt-avatar" aria-hidden>
              AI
            </div>
            <div className="cgpt-message-wrap">
              <div className="cgpt-role-line">
                <strong>Upflow AI</strong>
              </div>
              <p className="cgpt-message">חושב...</p>
            </div>
          </article>
        ) : null}
      </section>

      <form className="cgpt-composer panel" onSubmit={handleSubmit}>
        <input
          className="cgpt-input"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="הודעה ל-Upflow AI..."
          aria-label="שאלה לסוכן AI"
          disabled={isLoading || !userId}
        />
        <button type="submit" className="cgpt-send-btn" disabled={isLoading || inputValue.trim().length === 0 || !userId}>
          {isLoading ? '...' : 'שלח'}
        </button>
      </form>
    </section>
  )
}









