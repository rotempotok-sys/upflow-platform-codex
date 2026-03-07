import { readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleAuthRoutes } from './server/auth/routes'
import { requireApprovedPermissions } from './server/auth/guards'
import { handlePermissionsRoutes } from './server/auth/permissionsRoutes'
import type { ApprovalStatus, PermissionKey, PlatformRole } from './server/auth/permissions'

interface ChatRequestBody {
  userId?: string
  question?: string
  context?: string
}

interface MemoryRequestBody {
  userId?: string
}

interface ModelSelection {
  models: string[]
  reason: 'simple' | 'complex'
}

interface FileLinkEntry {
  source: 'monday' | 'google_drive' | 'other'
  url: string
  facility: string
  column: string
  contextLine: string
  score: number
}

interface ProxyEnv {
  openRouterApiKey: string
  simpleModel: string
  complexModel: string
  mondayApiToken: string
  mondayClientsBoardId: string
  mondayEquipmentBoardId: string
  mondayAuthBoardId: string
  googleClientId: string
  roleStatusMap: Partial<Record<string, PlatformRole>>
  approvalStatusMap: Partial<Record<string, ApprovalStatus>>
  authRoleColumnId: string
  authApprovalColumnId: string
  authEmailColumnId: string
  authPhoneColumnId: string
  authGoogleSubColumnId: string
  authAssignedClientsColumnId: string
  authAssignedFacilitiesColumnId: string
  authToggleAssistantColumnId: string
  authToggleCalendarColumnId: string
  authToggleClientsColumnId: string
  authToggleTeamColumnId: string
  authToggleEquipmentColumnId: string
  authToggleAiAskColumnId: string
  isProduction: boolean
}

interface MondayColumnValue {
  id: string
  title: string
  type: string
  text: string
  value: string | null
}

interface MondayClientRecord {
  id: string
  name: string
  facilityType: string
  facilityStatus: string
  contractType: string
  openTickets: number
  city: string
  group: string
}

interface MondayFacilityRecord extends MondayClientRecord {
  columns: MondayColumnValue[]
}

type StoredRole = 'user' | 'assistant'

interface StoredMessage {
  role: StoredRole
  text: string
  model?: string
  ts: string
}

interface UserMemory {
  history: StoredMessage[]
  longTerm: string[]
  updatedAt: string
}

interface HiveMemory {
  topQuestions: Record<string, { count: number; lastAskedAt: string; lastAskedBy: string }>
  highlights: string[]
  updatedAt: string
}

interface MemoryStore {
  users: Record<string, UserMemory>
  hive: HiveMemory
}

const MONDAY_API_URL = 'https://api.monday.com/v2'
const STORE_PATH = path.resolve(process.cwd(), '.upflow-ai-memory.json')
const MAX_USER_HISTORY = 300
const CONTEXT_HISTORY_WINDOW = 5
const MAX_LONG_TERM_ITEMS = 80
const MAX_HIVE_HIGHLIGHTS = 80

let memoryCache: MemoryStore | null = null

function createEmptyStore(): MemoryStore {
  return {
    users: {},
    hive: {
      topQuestions: {},
      highlights: [],
      updatedAt: new Date(0).toISOString(),
    },
  }
}

async function loadMemoryStore() {
  if (memoryCache) return memoryCache

  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as MemoryStore
    memoryCache = {
      users: parsed.users ?? {},
      hive: {
        topQuestions: parsed.hive?.topQuestions ?? {},
        highlights: parsed.hive?.highlights ?? [],
        updatedAt: parsed.hive?.updatedAt ?? new Date().toISOString(),
      },
    }
  } catch {
    memoryCache = createEmptyStore()
  }

  return memoryCache
}

async function persistMemoryStore(store: MemoryStore) {
  memoryCache = store
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
}

function sanitizeUserId(value: unknown) {
  const id = String(value ?? '').trim()
  if (!id) return ''
  return id.slice(0, 120)
}

function sanitizeText(value: unknown, max = 4000) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function sanitizeMultilineText(value: unknown, max = 800000) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

function normalizeQuestionKey(value: string) {
  return sanitizeText(value, 280).toLowerCase()
}

function questionKeywords(question: string) {
  return normalizeQuestionKey(question)
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length >= 2)
    .slice(0, 16)
}

function isFileLinkRequest(question: string) {
  const normalized = normalizeQuestionKey(question)
  const signals = [
    'קישור',
    'קישורים',
    'לינק',
    'לינקים',
    'קובץ',
    'קבצים',
    'מסמך',
    'מסמכים',
    'pdf',
    'דרייב',
    'drive',
    'link',
    'links',
    'file',
    'files',
    'doc',
  ]

  return signals.some((signal) => normalized.includes(signal))
}

function linkSource(url: string): FileLinkEntry['source'] {
  const lower = url.toLowerCase()
  if (lower.includes('monday.com')) return 'monday'
  if (lower.includes('drive.google.com') || lower.includes('docs.google.com')) return 'google_drive'
  return 'other'
}

function parseFacilityFromLine(line: string) {
  const match = /שם:\s*([^|]+)/.exec(line)
  return match?.[1]?.trim() || ''
}

function parseColumnFromLine(line: string) {
  const match = /^-\s*([^:(]+)(?:\s*\(|:)/.exec(line.trim())
  return match?.[1]?.trim() || ''
}

function extractFileLinks(question: string, context: string) {
  const lines = context.split('\n')
  const keywords = questionKeywords(question)
  const found: FileLinkEntry[] = []
  const dedupe = new Set<string>()
  let currentFacility = ''

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('מזהה:') && line.includes('שם:')) {
      currentFacility = parseFacilityFromLine(line)
    }

    const urls = line.match(/https?:\/\/[^\s,]+/g) ?? []
    if (urls.length === 0) continue

    const column = parseColumnFromLine(line)
    const normalizedLine = normalizeQuestionKey(line)

    for (const url of urls) {
      const key = `${url}::${currentFacility}::${column}`
      if (dedupe.has(key)) continue
      dedupe.add(key)

      let score = 1
      if (currentFacility && keywords.some((keyword) => normalizeQuestionKey(currentFacility).includes(keyword))) score += 3
      if (column && keywords.some((keyword) => normalizeQuestionKey(column).includes(keyword))) score += 2
      if (keywords.some((keyword) => normalizedLine.includes(keyword))) score += 1

      found.push({
        source: linkSource(url),
        url,
        facility: currentFacility || 'ללא שיוך מתקן',
        column: column || 'ללא שם עמודה',
        contextLine: line.slice(0, 220),
        score,
      })
    }
  }

  return found
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.source === b.source) return a.facility.localeCompare(b.facility, 'he')
      if (a.source === 'monday') return -1
      if (b.source === 'monday') return 1
      if (a.source === 'google_drive') return -1
      if (b.source === 'google_drive') return 1
      return 0
    })
    .slice(0, 18)
}

function buildFileLinksContext(question: string, context: string) {
  const links = extractFileLinks(question, context)
  if (links.length === 0) return ''

  const mondayLinks = links.filter((entry) => entry.source === 'monday')
  const driveLinks = links.filter((entry) => entry.source === 'google_drive')
  const otherLinks = links.filter((entry) => entry.source === 'other')
  const ordered = [...mondayLinks, ...driveLinks, ...otherLinks]

  const lines = ordered.map((entry) => {
    const sourceLabel = entry.source === 'monday' ? 'Monday' : entry.source === 'google_drive' ? 'Google Drive' : 'אחר'
    return `- מקור: ${sourceLabel} | מתקן: ${entry.facility} | שדה: ${entry.column} | קישור: ${entry.url}`
  })

  return ['אינדקס קישורי קבצים שחולץ מהנתונים:', ...lines].join('\n')
}

function ensureUser(store: MemoryStore, userId: string) {
  if (!store.users[userId]) {
    store.users[userId] = {
      history: [],
      longTerm: [],
      updatedAt: new Date().toISOString(),
    }
  }

  return store.users[userId]
}

function mergeUniqueTail(existing: string[], incoming: string[], limit: number) {
  const seen = new Set(existing)
  const merged = [...existing]

  for (const value of incoming) {
    if (!value || seen.has(value)) continue
    merged.push(value)
    seen.add(value)
  }

  if (merged.length <= limit) return merged
  return merged.slice(merged.length - limit)
}

function extractLongTermCandidates(question: string, answer: string) {
  const candidates: string[] = []
  const normalizedQuestion = sanitizeText(question, 500)
  if (normalizedQuestion.length >= 10) {
    candidates.push(`שאל: ${normalizedQuestion}`)
  }

  const answerLines = answer
    .split(/\n+/)
    .map((line) => sanitizeText(line, 240))
    .filter(Boolean)

  for (const line of answerLines.slice(0, 5)) {
    if (line.length < 12) continue
    candidates.push(`תשובה: ${line}`)
  }

  return candidates.slice(0, 8)
}

function extractHiveHighlights(question: string, answer: string, userId: string) {
  const highlights: string[] = []
  const q = sanitizeText(question, 240)
  if (q) highlights.push(`שאלה חוזרת אפשרית: ${q}`)

  const answerLine = answer
    .split(/\n+/)
    .map((line) => sanitizeText(line, 220))
    .find((line) => line.length >= 16)

  if (answerLine) {
    highlights.push(`תובנה (${userId}): ${answerLine}`)
  }

  return highlights.slice(0, 3)
}

function buildHiveSummary(hive: HiveMemory) {
  const top = Object.entries(hive.topQuestions)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)

  const topLines = top.map(([question, details]) => `- ${question} (נשאל ${details.count} פעמים)`).join('\n') || '- אין עדיין שאלות נפוצות'
  const recentHighlights = hive.highlights.slice(-10).map((line) => `- ${line}`).join('\n') || '- אין עדיין תובנות משותפות'

  return ['שאלות נפוצות (כוורת):', topLines, '', 'תובנות צוות אחרונות:', recentHighlights].join('\n')
}

function buildUserMemoryContext(user: UserMemory, hive: HiveMemory) {
  const recentHistory = user.history.slice(-CONTEXT_HISTORY_WINDOW)
  const recentHistoryText =
    recentHistory.map((msg) => `${msg.role === 'user' ? 'משתמש' : 'עוזר'}: ${sanitizeText(msg.text, 350)}`).join('\n') || 'אין היסטוריה קודמת'

  const longTermText = user.longTerm.slice(-24).map((line) => `- ${line}`).join('\n') || '- אין עדיין זיכרון ארוך טווח'

  return [
    'היסטוריית שיחה אישית (5 הודעות אחרונות):',
    recentHistoryText,
    '',
    'זיכרון ארוך טווח אישי:',
    longTermText,
    '',
    buildHiveSummary(hive),
  ].join('\n')
}

function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ''

    req.on('data', (chunk) => {
      raw += chunk.toString()
    })

    req.on('end', () => resolve(raw))
    req.on('error', () => reject(new Error('Failed reading request body')))
  })
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const raw = await readRawBody(req)
  if (!raw) return {} as T

  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error('Invalid JSON body')
  }
}

function parseStatusMap<T extends string>(value: string): Partial<Record<string, T>> {
  const trimmed = value.trim()
  if (!trimmed) return {}

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const output: Partial<Record<string, T>> = {}

    for (const [key, mapped] of Object.entries(parsed)) {
      const normalizedKey = key.trim().toLowerCase().normalize('NFC')
      if (!normalizedKey) continue
      if (typeof mapped !== 'string' || !mapped.trim()) continue
      output[normalizedKey] = mapped.trim() as T
    }

    return output
  } catch {
    return {}
  }
}
function hasAnyPermission(keys: PermissionKey[], required: PermissionKey[]) {
  return required.some((permission) => keys.includes(permission))
}

function filterByScope<T extends { id: string }>(items: T[], allowedIds: string[]) {
  if (allowedIds.length === 0) return []
  const allowed = new Set(allowedIds)
  return items.filter((item) => allowed.has(String(item.id)))
}

function jsonError(res: any, statusCode: number, code: string, message: string, extra?: Record<string, unknown>) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: { code, message, ...(extra ?? {}) } }))
}
function uniqueModels(models: string[]) {
  return Array.from(new Set(models.filter(Boolean)))
}

function chooseModels(question: string, simpleModel: string, complexModel: string): ModelSelection {
  const normalized = question.trim().toLowerCase()
  const words = normalized.split(/\s+/).filter(Boolean)

  const complexSignals = [
    'השווה',
    'השוואה',
    'נתח',
    'ניתוח',
    'המלצה',
    'המלץ',
    'תכנית',
    'תוכנית',
    'אסטרטג',
    'מדוע',
    'למה',
    'איך לבנות',
    'תחזית',
    'scenario',
    'compare',
    'analysis',
    'strategy',
    'plan',
    'root cause',
  ]

  const multiTopicSignals = [
    ['מתקן', 'מתקנים', 'facility'],
    ['לקוח', 'לקוחות', 'client'],
    ['משימה', 'משימות', 'task'],
    ['טכנאי', 'טכנאים', 'technician', 'team'],
  ]

  const matchedTopics = multiTopicSignals.filter((group) => group.some((token) => normalized.includes(token))).length
  const hasComplexSignal = complexSignals.some((signal) => normalized.includes(signal))
  const isLongQuestion = words.length >= 20

  if (hasComplexSignal || isLongQuestion || matchedTopics >= 3) {
    return {
      reason: 'complex',
      models: uniqueModels([complexModel, 'openai/gpt-5', 'openai/gpt-4.1', simpleModel]),
    }
  }

  return {
    reason: 'simple',
    models: uniqueModels([simpleModel]),
  }
}

function decodePossiblyMojibake(value: string) {
  if (!value) return ''

  const hasCorruptedPattern = /[\u0080-\u00FF]|׳/.test(value)
  if (!hasCorruptedPattern) return value

  const bytes = Buffer.from(value, 'latin1')
  const utf8Decoded = bytes.toString('utf8')
  const cp1255Decoded = new TextDecoder('windows-1255').decode(bytes)

  const hasHebrew = (text: string) => /[א-ת]/.test(text)

  if (hasHebrew(cp1255Decoded)) return cp1255Decoded
  if (hasHebrew(utf8Decoded)) return utf8Decoded
  return value
}

function asNonEmpty(value: unknown) {
  const normalized = decodePossiblyMojibake(String(value ?? '')).trim()
  return normalized.length ? normalized : ''
}

function normalizeColumns(item: any, titleById: Map<string, string>, typeById: Map<string, string>): MondayColumnValue[] {
  return (item.column_values ?? []).map((column: any) => ({
    id: String(column.id),
    title: asNonEmpty(titleById.get(column.id) ?? column.id),
    type: String(column.type ?? typeById.get(column.id) ?? 'unknown'),
    text: asNonEmpty(column.display_value) || asNonEmpty(column.text),
    value: typeof column.value === 'string' ? column.value : null,
  }))
}

function pickColumnText(columns: MondayColumnValue[], options: { ids?: string[]; titleIncludes?: string[] }) {
  const byId = new Map(columns.map((column) => [column.id, column]))

  for (const id of options.ids ?? []) {
    const candidate = byId.get(id)
    if (candidate?.text) return candidate.text
  }

  for (const marker of options.titleIncludes ?? []) {
    const candidate = columns.find((column) => column.title.includes(marker) && column.text)
    if (candidate?.text) return candidate.text
  }

  return ''
}

function normalizeClientsBoard(board: any): MondayClientRecord[] {
  const titleById = new Map<string, string>((board.columns ?? []).map((column: any) => [String(column.id), String(column.title ?? '')]))
  const typeById = new Map<string, string>((board.columns ?? []).map((column: any) => [String(column.id), String(column.type ?? '')]))

  const clients = (board.items_page?.items ?? []).map((item: any) => {
    const columns = normalizeColumns(item, titleById, typeById)

    const city =
      pickColumnText(columns, {
        ids: ['text_mkna2fph', '______________'],
        titleIncludes: ['ישוב', 'יישוב', 'שם העסק', 'הישוב', 'מיקום'],
      }) || asNonEmpty(item.name)

    const facilityType =
      pickColumnText(columns, {
        ids: ['_____________'],
        titleIncludes: ['סוג מתקן', 'מתקן'],
      }) || 'לא הוגדר'

    const facilityStatus =
      pickColumnText(columns, {
        ids: ['color__1'],
        titleIncludes: ['סטטוס מתקן', 'סטטוס'],
      }) || 'לא הוגדר'

    const contractType =
      pickColumnText(columns, {
        ids: ['status'],
        titleIncludes: ['סוג חוזה שירות', 'חוזה', 'שירות', 'חבילה'],
      }) || 'לא הוגדר'

    return {
      id: String(item.id),
      name: asNonEmpty(item.name),
      facilityType,
      facilityStatus,
      contractType,
      openTickets: 0,
      city,
      group: asNonEmpty(item.group?.title) || asNonEmpty(item.group?.id) || 'ללא קבוצה',
    }
  })

  clients.sort((a: MondayClientRecord, b: MondayClientRecord) => a.name.localeCompare(b.name, 'he'))
  return clients
}

function normalizeEquipmentBoard(board: any): MondayFacilityRecord[] {
  const titleById = new Map<string, string>((board.columns ?? []).map((column: any) => [String(column.id), String(column.title ?? '')]))
  const typeById = new Map<string, string>((board.columns ?? []).map((column: any) => [String(column.id), String(column.type ?? '')]))

  const facilities = (board.items_page?.items ?? []).map((item: any) => {
    const columns = normalizeColumns(item, titleById, typeById)

    const city =
      pickColumnText(columns, {
        ids: ['text_mkna2fph'],
        titleIncludes: ['יישוב', 'ישוב', 'עיר', 'מיקום'],
      }) || asNonEmpty(item.name)

    const facilityType =
      pickColumnText(columns, {
        titleIncludes: ['סוג המתקן', 'סוג מתקן', 'מתקן'],
      }) || 'לא הוגדר'

    const facilityStatus =
      pickColumnText(columns, {
        titleIncludes: ['סטטוס מתקן', 'סטטוס'],
      }) || 'לא הוגדר'

    const contractType =
      pickColumnText(columns, {
        titleIncludes: ['סוג חוזה שירות', 'חוזה שירות', 'חוזה'],
      }) || 'לא הוגדר'

    return {
      id: String(item.id),
      name: asNonEmpty(item.name),
      facilityType,
      facilityStatus,
      contractType,
      openTickets: 0,
      city,
      group: asNonEmpty(item.group?.title) || asNonEmpty(item.group?.id) || 'ללא קבוצה',
      columns,
    }
  })

  facilities.sort((a: MondayFacilityRecord, b: MondayFacilityRecord) => a.name.localeCompare(b.name, 'he'))
  return facilities
}

async function mondayRequest(query: string, variables: unknown, token: string) {
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`Monday API HTTP ${response.status}: ${await response.text()}`)
  }

  const body: any = await response.json()
  if (body.errors?.length) {
    throw new Error(`Monday API errors: ${JSON.stringify(body.errors)}`)
  }

  return body.data
}

async function fetchBoard(token: string, boardId: string) {
  const query = `
    query ($boardId: [ID!]) {
      boards(ids: $boardId) {
        id
        name
        columns {
          id
          title
          type
        }
        items_page(limit: 500) {
          items {
            id
            name
            group { id title }
            column_values {
              id
              text
              type
              value
              ... on MirrorValue { display_value }
              ... on BoardRelationValue { display_value }
              ... on DependencyValue { display_value }
              ... on FormulaValue { display_value }
              ... on SubtasksValue { display_value }
            }
          }
        }
      }
    }
  `

  const data = await mondayRequest(query, { boardId: [String(boardId)] }, token)
  const board = data?.boards?.[0]

  if (!board) {
    throw new Error(`Board ${boardId} not found`)
  }

  return board
}

async function requestOpenRouter(options: {
  apiKey: string
  models: string[]
  question: string
  context: string
  shouldReturnLinks: boolean
}) {
  const { apiKey, models, question, context, shouldReturnLinks } = options

  const systemPrompt = [
    'אתה סוכן תפעולי של Upflow.',
    'ענה בעברית ברורה וקצרה.',
    'השתמש אך ורק במידע שסופק בקונטקסט.',
    'אם המידע לא קיים בקונטקסט, ציין זאת במפורש ואל תמציא נתונים.',
    'כאשר רלוונטי, החזר נקודות קצרות עם מספרים מדויקים.',
    shouldReturnLinks
      ? 'המשתמש ביקש קישורים לקבצים. החזר קישורים לחיצים בפורמט Markdown: [שם קצר](https://...). תעדף Monday ו-Google Drive כשהם קיימים.'
      : 'אם יש URL-ים רלוונטיים בתשובה, החזר אותם כלינקים לחיצים בפורמט Markdown.',
  ].join('\n')

  const userPrompt = [`שאלה: ${question}`, '', 'קונטקסט נתונים:', context || 'לא סופק קונטקסט.'].join('\n')

  let lastErrorMessage = 'OpenRouter request failed'

  for (const model of models) {
    const upstreamResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://127.0.0.1:5175',
        'X-Title': 'Upflow Platform',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    const payload: any = await upstreamResponse.json()

    if (!upstreamResponse.ok) {
      lastErrorMessage = payload?.error?.message || `OpenRouter error (${upstreamResponse.status})`
      continue
    }

    const answer = payload?.choices?.[0]?.message?.content
    if (!answer || typeof answer !== 'string') {
      lastErrorMessage = `No text answer returned from model: ${model}`
      continue
    }

    return {
      ok: true as const,
      answer,
      model,
    }
  }

  return {
    ok: false as const,
    error: lastErrorMessage,
  }
}

function toGuardEnv(env: ProxyEnv) {
  return {
    isProduction: env.isProduction,
    mondayApiToken: env.mondayApiToken,
    mondayAuthBoardId: env.mondayAuthBoardId,
    roleColumnId: env.authRoleColumnId,
    approvalColumnId: env.authApprovalColumnId,
    emailColumnId: env.authEmailColumnId,
    phoneColumnId: env.authPhoneColumnId,
    googleSubColumnId: env.authGoogleSubColumnId,
    assignedClientsColumnId: env.authAssignedClientsColumnId,
    assignedFacilitiesColumnId: env.authAssignedFacilitiesColumnId,
    toggleAssistantColumnId: env.authToggleAssistantColumnId,
    toggleCalendarColumnId: env.authToggleCalendarColumnId,
    toggleClientsColumnId: env.authToggleClientsColumnId,
    toggleTeamColumnId: env.authToggleTeamColumnId,
    toggleEquipmentColumnId: env.authToggleEquipmentColumnId,
    toggleAiAskColumnId: env.authToggleAiAskColumnId,
    roleStatusMap: env.roleStatusMap,
    approvalStatusMap: env.approvalStatusMap,
  }
}
function attachApiMiddleware(
  middlewares: { use: (handler: (req: IncomingMessage, res: any, next: () => void) => void) => void },
  env: ProxyEnv,
) {
  middlewares.use(async (req, res, next) => {
    const authHandled = await handleAuthRoutes(req, res, {
      googleClientId: env.googleClientId,
      isProduction: env.isProduction,
      mondayApiToken: env.mondayApiToken,
      mondayAuthBoardId: env.mondayAuthBoardId,
      roleColumnId: env.authRoleColumnId,
      approvalColumnId: env.authApprovalColumnId,
      emailColumnId: env.authEmailColumnId,
      phoneColumnId: env.authPhoneColumnId,
      googleSubColumnId: env.authGoogleSubColumnId,
      assignedClientsColumnId: env.authAssignedClientsColumnId,
      assignedFacilitiesColumnId: env.authAssignedFacilitiesColumnId,
      toggleAssistantColumnId: env.authToggleAssistantColumnId,
      toggleCalendarColumnId: env.authToggleCalendarColumnId,
      toggleClientsColumnId: env.authToggleClientsColumnId,
      toggleTeamColumnId: env.authToggleTeamColumnId,
      toggleEquipmentColumnId: env.authToggleEquipmentColumnId,
      toggleAiAskColumnId: env.authToggleAiAskColumnId,
      roleStatusMap: env.roleStatusMap,
      approvalStatusMap: env.approvalStatusMap,
    })

    if (authHandled || res.writableEnded) return

    const permissionsHandled = await handlePermissionsRoutes(req, res, {
      ...toGuardEnv(env),
      mondayClientsBoardId: env.mondayClientsBoardId,
      mondayEquipmentBoardId: env.mondayEquipmentBoardId,
    })

    if (permissionsHandled || res.writableEnded) return
    if (req.url === '/api/monday/snapshot' && req.method === 'GET') {
      const guard = await requireApprovedPermissions({
        req,
        res,
        env: toGuardEnv(env),
        requiredPermissions: [],
      })
      if (!guard) return

      const snapshotPermissions: PermissionKey[] = ['screen.assistant', 'screen.clients', 'screen.equipment']
      if (!hasAnyPermission(guard.user.permissions.keys, snapshotPermissions)) {
        jsonError(res, 403, 'AUTH_PERMISSION_DENIED', 'Missing snapshot access permissions', {
          requiredAnyOf: snapshotPermissions,
        })
        return
      }

      if (guard.user.scope.scopedRole && !guard.user.scope.scopeConfigured) {
        jsonError(
          res,
          403,
          'AUTH_SCOPE_CONFIG_MISSING',
          guard.user.scope.scopeConfigMissingReason ??
            'Scoped access is not configured (TODO configure assignment column IDs)',
        )
        return
      }
      if (!env.mondayApiToken) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'MONDAY_API_TOKEN is missing on server' }))
        return
      }

      try {
        const clientsBoard = await fetchBoard(env.mondayApiToken, env.mondayClientsBoardId)
        const equipmentBoard = await fetchBoard(env.mondayApiToken, env.mondayEquipmentBoardId)

        let clients = normalizeClientsBoard(clientsBoard)
        let facilities = normalizeEquipmentBoard(equipmentBoard)

        if (guard.user.scope.scopedRole) {
          clients = filterByScope(clients, guard.user.scope.clientIds)
          facilities = filterByScope(facilities, guard.user.scope.facilityIds)
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            clients,
            facilities,
            fetchedAt: new Date().toISOString(),
          }),
        )
      } catch (error) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Monday snapshot failed' }))
      }

      return
    }

    if (req.url === '/api/ai/memory' && req.method === 'POST') {
      const guard = await requireApprovedPermissions({
        req,
        res,
        env: toGuardEnv(env),
        requiredPermissions: ['screen.assistant', 'ai.ask'],
      })
      if (!guard) return
      try {
        const body = await readJsonBody<MemoryRequestBody>(req)
        const userId = sanitizeUserId(body.userId)

        if (!userId) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'Missing userId' }))
          return
        }

        const store = await loadMemoryStore()
        const user = ensureUser(store, userId)
        await persistMemoryStore(store)

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            history: user.history,
            longTerm: user.longTerm,
            hiveSummary: buildHiveSummary(store.hive),
          }),
        )
      } catch (error) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Memory load failed' }))
      }

      return
    }

    if (req.url === '/api/ai/chat' && req.method === 'POST') {
      const guard = await requireApprovedPermissions({
        req,
        res,
        env: toGuardEnv(env),
        requiredPermissions: ['screen.assistant', 'ai.ask'],
      })
      if (!guard) return
      if (!env.openRouterApiKey) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'OPENROUTER_API_KEY is missing on server' }))
        return
      }

      try {
        const body = await readJsonBody<ChatRequestBody>(req)
        const userId = sanitizeUserId(body.userId)
        const question = sanitizeText(body.question, 3000)
        const context = sanitizeMultilineText(body.context, 800000)

        if (!userId) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'Missing userId' }))
          return
        }

        if (!question) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'Missing question' }))
          return
        }

        const store = await loadMemoryStore()
        const user = ensureUser(store, userId)

        const memoryContext = buildUserMemoryContext(user, store.hive)
        const linksRequested = isFileLinkRequest(question)
        const linksContext = buildFileLinksContext(question, context)
        const fullContext = [memoryContext, '', 'קונטקסט עסקי נוסף:', context, linksContext ? `\n${linksContext}` : ''].join('\n')

        const modelSelection = chooseModels(question, env.simpleModel, env.complexModel)
        const aiResult = await requestOpenRouter({
          apiKey: env.openRouterApiKey,
          models: modelSelection.models,
          question,
          context: fullContext,
          shouldReturnLinks: linksRequested,
        })

        if (!aiResult.ok) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: aiResult.error }))
          return
        }

        const now = new Date().toISOString()
        const userQuestionMessage: StoredMessage = { role: 'user', text: question, ts: now }
        const assistantMessage: StoredMessage = { role: 'assistant', text: aiResult.answer, model: aiResult.model, ts: now }

        user.history.push(userQuestionMessage, assistantMessage)
        if (user.history.length > MAX_USER_HISTORY) {
          user.history = user.history.slice(user.history.length - MAX_USER_HISTORY)
        }

        const longTermCandidates = extractLongTermCandidates(question, aiResult.answer)
        user.longTerm = mergeUniqueTail(user.longTerm, longTermCandidates, MAX_LONG_TERM_ITEMS)
        user.updatedAt = now

        const questionKey = normalizeQuestionKey(question)
        if (questionKey) {
          const existingQuestion = store.hive.topQuestions[questionKey]
          if (!existingQuestion) {
            store.hive.topQuestions[questionKey] = {
              count: 1,
              lastAskedAt: now,
              lastAskedBy: userId,
            }
          } else {
            existingQuestion.count += 1
            existingQuestion.lastAskedAt = now
            existingQuestion.lastAskedBy = userId
          }
        }

        const hiveHighlights = extractHiveHighlights(question, aiResult.answer, userId)
        store.hive.highlights = mergeUniqueTail(store.hive.highlights, hiveHighlights, MAX_HIVE_HIGHLIGHTS)
        store.hive.updatedAt = now

        await persistMemoryStore(store)

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            answer: aiResult.answer,
            model: aiResult.model,
            complexity: modelSelection.reason,
            memory: {
              history: user.history,
              longTerm: user.longTerm,
              hiveSummary: buildHiveSummary(store.hive),
              contextWindowSize: CONTEXT_HISTORY_WINDOW,
            },
          }),
        )
      } catch (error) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown server error' }))
      }

      return
    }

    next()
  })
}

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), '')

  const env: ProxyEnv = {
    openRouterApiKey: loaded.OPENROUTER_API_KEY || '',
    simpleModel: loaded.OPENROUTER_SIMPLE_MODEL || 'google/gemini-2.5-flash',
    complexModel: loaded.OPENROUTER_COMPLEX_MODEL || 'openai/gpt-5.2',
    mondayApiToken: loaded.MONDAY_API_TOKEN || '',
    mondayClientsBoardId: loaded.MONDAY_ACTIVE_CLIENTS_BOARD_ID || '1284652674',
    mondayEquipmentBoardId: loaded.MONDAY_EQUIPMENT_BOARD_ID || '2119399147',
    mondayAuthBoardId: loaded.MONDAY_AUTH_BOARD_ID || '1729562303',
    googleClientId: (loaded.GOOGLE_CLIENT_ID || loaded.VITE_GOOGLE_CLIENT_ID || '').trim(),
    roleStatusMap: parseStatusMap<PlatformRole>(loaded.AUTH_ROLE_STATUS_MAP_JSON || ''),
    approvalStatusMap: parseStatusMap<ApprovalStatus>(loaded.AUTH_APPROVAL_STATUS_MAP_JSON || ''),
    authRoleColumnId: loaded.AUTH_ROLE_COLUMN_ID || 'color_mm16fjq9',
    authApprovalColumnId: loaded.AUTH_APPROVAL_COLUMN_ID || 'color_mm167kpn',
    authEmailColumnId: loaded.AUTH_EMAIL_COLUMN_ID || 'email',
    authPhoneColumnId: loaded.AUTH_PHONE_COLUMN_ID || 'phone_mkn2my3a',
    authGoogleSubColumnId: loaded.AUTH_GOOGLE_SUB_COLUMN_ID || '',
    authAssignedClientsColumnId: loaded.AUTH_ASSIGNED_CLIENTS_COLUMN_ID || '',
    authAssignedFacilitiesColumnId: loaded.AUTH_ASSIGNED_FACILITIES_COLUMN_ID || '',
    authToggleAssistantColumnId: loaded.AUTH_TOGGLE_ASSISTANT_COLUMN_ID || '',
    authToggleCalendarColumnId: loaded.AUTH_TOGGLE_CALENDAR_COLUMN_ID || '',
    authToggleClientsColumnId: loaded.AUTH_TOGGLE_CLIENTS_COLUMN_ID || '',
    authToggleTeamColumnId: loaded.AUTH_TOGGLE_TEAM_COLUMN_ID || '',
    authToggleEquipmentColumnId: loaded.AUTH_TOGGLE_EQUIPMENT_COLUMN_ID || '',
    authToggleAiAskColumnId: loaded.AUTH_TOGGLE_AI_ASK_COLUMN_ID || '',
    isProduction: mode === 'production',
  }

  return {
    plugins: [
      react(),
      {
        name: 'upflow-platform-api-middleware',
        configureServer(server) {
          attachApiMiddleware(server.middlewares, env)
        },
        configurePreviewServer(server) {
          attachApiMiddleware(server.middlewares, env)
        },
      },
    ],
  }
})







































