import { readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleAuthRoutes } from './server/auth/routes'
import { requireApprovedPermissions } from './server/auth/guards'
import { handlePermissionsRoutes } from './server/auth/permissionsRoutes'
import type { ApprovalStatus, PermissionKey, PlatformRole } from './server/auth/permissions'
import { buildMondayMappingInventory } from './server/monday/mappingInventory'
import { checkSupabaseRuntimeHealth, createSupabaseAdminClient, readSupabaseRuntimeConfig } from './server/runtime/supabase'
import { persistRuntimeSnapshotToSupabase } from './server/runtime/sync'
import { normalizeOperationsFromBoard, normalizeReportsFromBoard, normalizeScheduleEntriesFromBoard, normalizeUsersFromAuthBoard } from './server/runtime/mondayRuntimeNormalize'
import { buildRuntimeOperationalProjections, readLatestRuntimeSyncRun, readRuntimeClientsAndFacilities } from './server/runtime/read'
import { sanitizeRuntimeErrorMessage } from './server/runtime/security'
import { computeCanonicalRuntimeExceptions } from './server/runtime/exceptions'
import { fetchGoogleCalendarEventsByRefs } from './server/calendar/googleBackend'

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
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  supabaseDbSchema: string
  isProduction: boolean
}

interface MondayColumnValue {
  id: string
  title: string
  type: string
  text: string
  value: string | null
  displayValue?: string | null
  relationIds?: string[]
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
  facilitiesRelationIds: string[]
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
const RUNTIME_SYNC_SIGNATURE = 'runtime-sync-v14-derived-status-fallback-2026-03-09'

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
    '׳§׳™׳©׳•׳¨',
    '׳§׳™׳©׳•׳¨׳™׳',
    '׳׳™׳ ׳§',
    '׳׳™׳ ׳§׳™׳',
    '׳§׳•׳‘׳¥',
    '׳§׳‘׳¦׳™׳',
    '׳׳¡׳׳',
    '׳׳¡׳׳›׳™׳',
    'pdf',
    '׳“׳¨׳™׳™׳‘',
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
  const match = /׳©׳:\s*([^|]+)/.exec(line)
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

    if (line.startsWith('׳׳–׳”׳”:') && line.includes('׳©׳:')) {
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
        facility: currentFacility || '׳׳׳ ׳©׳™׳•׳ מתקן',
        column: column || '׳׳׳ ׳©׳ ׳¢׳׳•׳“׳”',
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
    const sourceLabel = entry.source === 'monday' ? 'Monday' : entry.source === 'google_drive' ? 'Google Drive' : '׳׳—׳¨'
    return `- ׳׳§׳•׳¨: ${sourceLabel} | מתקן: ${entry.facility} | ׳©׳“׳”: ${entry.column} | ׳§׳™׳©׳•׳¨: ${entry.url}`
  })

  return ['׳׳™׳ ׳“׳§׳¡ ׳§׳™׳©׳•׳¨׳™ ׳§׳‘׳¦׳™׳ ׳©׳—׳•׳׳¥ ׳׳”׳ ׳×׳•׳ ׳™׳:', ...lines].join('\n')
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
    candidates.push(`׳©׳׳: ${normalizedQuestion}`)
  }

  const answerLines = answer
    .split(/\n+/)
    .map((line) => sanitizeText(line, 240))
    .filter(Boolean)

  for (const line of answerLines.slice(0, 5)) {
    if (line.length < 12) continue
    candidates.push(`׳×׳©׳•׳‘׳”: ${line}`)
  }

  return candidates.slice(0, 8)
}

function extractHiveHighlights(question: string, answer: string, userId: string) {
  const highlights: string[] = []
  const q = sanitizeText(question, 240)
  if (q) highlights.push(`׳©׳׳׳” ׳—׳•׳–׳¨׳× ׳׳₪׳©׳¨׳™׳×: ${q}`)

  const answerLine = answer
    .split(/\n+/)
    .map((line) => sanitizeText(line, 220))
    .find((line) => line.length >= 16)

  if (answerLine) {
    highlights.push(`׳×׳•׳‘׳ ׳” (${userId}): ${answerLine}`)
  }

  return highlights.slice(0, 3)
}

function buildHiveSummary(hive: HiveMemory) {
  const top = Object.entries(hive.topQuestions)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)

  const topLines = top.map(([question, details]) => `- ${question} (׳ ׳©׳׳ ${details.count} ׳₪׳¢׳׳™׳)`).join('\n') || '- ׳׳™׳ ׳¢׳“׳™׳™׳ ׳©׳׳׳•׳× ׳ ׳₪׳•׳¦׳•׳×'
  const recentHighlights = hive.highlights.slice(-10).map((line) => `- ${line}`).join('\n') || '- ׳׳™׳ ׳¢׳“׳™׳™׳ ׳×׳•׳‘׳ ׳•׳× ׳׳©׳•׳×׳₪׳•׳×'

  return ['׳©׳׳׳•׳× ׳ ׳₪׳•׳¦׳•׳× (׳›׳•׳•׳¨׳×):', topLines, '', '׳×׳•׳‘׳ ׳•׳× ׳¦׳•׳•׳× ׳׳—׳¨׳•׳ ׳•׳×:', recentHighlights].join('\n')
}

function buildUserMemoryContext(user: UserMemory, hive: HiveMemory) {
  const recentHistory = user.history.slice(-CONTEXT_HISTORY_WINDOW)
  const recentHistoryText =
    recentHistory.map((msg) => `${msg.role === 'user' ? '׳׳©׳×׳׳©' : '׳¢׳•׳–׳¨'}: ${sanitizeText(msg.text, 350)}`).join('\n') || '׳׳™׳ ׳”׳™׳¡׳˜׳•׳¨׳™׳” ׳§׳•׳“׳׳×'

  const longTermText = user.longTerm.slice(-24).map((line) => `- ${line}`).join('\n') || '- ׳׳™׳ ׳¢׳“׳™׳™׳ ׳–׳™׳›׳¨׳•׳ ׳׳¨׳•׳ ׳˜׳•׳•׳—'

  return [
    '׳”׳™׳¡׳˜׳•׳¨׳™׳™׳× ׳©׳™׳—׳” ׳׳™׳©׳™׳× (5 ׳”׳•׳“׳¢׳•׳× ׳׳—׳¨׳•׳ ׳•׳×):',
    recentHistoryText,
    '',
    '׳–׳™׳›׳¨׳•׳ ׳׳¨׳•׳ ׳˜׳•׳•׳— ׳׳™׳©׳™:',
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
    '׳”׳©׳•׳•׳”',
    '׳”׳©׳•׳•׳׳”',
    '׳ ׳×׳—',
    '׳ ׳™׳×׳•׳—',
    '׳”׳׳׳¦׳”',
    '׳”׳׳׳¥',
    '׳×׳›׳ ׳™׳×',
    '׳×׳•׳›׳ ׳™׳×',
    '׳׳¡׳˜׳¨׳˜׳’',
    '׳׳“׳•׳¢',
    '׳׳׳”',
    '׳׳™׳ ׳׳‘׳ ׳•׳×',
    '׳×׳—׳–׳™׳×',
    'scenario',
    'compare',
    'analysis',
    'strategy',
    'plan',
    'root cause',
  ]

  const multiTopicSignals = [
    ['מתקן', '׳׳×׳§׳ ׳™׳', 'facility'],
    ['׳׳§׳•׳—', '׳׳§׳•׳—׳•׳×', 'client'],
    ['׳׳©׳™׳׳”', '׳׳©׳™׳׳•׳×', 'task'],
    ['׳˜׳›׳ ׳׳™', '׳˜׳›׳ ׳׳™׳', 'technician', 'team'],
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

  const hasCorruptedPattern = /[\u0080-\u00FF]|׳³/.test(value)
  if (!hasCorruptedPattern) return value

  const bytes = Buffer.from(value, 'latin1')
  const utf8Decoded = bytes.toString('utf8')
  const cp1255Decoded = new TextDecoder('windows-1255').decode(bytes)

  const hasHebrew = (text: string) => /[׳-׳×]/.test(text)

  if (hasHebrew(cp1255Decoded)) return cp1255Decoded
  if (hasHebrew(utf8Decoded)) return utf8Decoded
  return value
}

function asNonEmpty(value: unknown) {
  const normalized = decodePossiblyMojibake(String(value ?? '')).trim()
  return normalized.length ? normalized : ''
}

function extractRelationIdsFromRaw(rawValue: unknown): string[] {
  const out = new Set<string>()
  const push = (value: unknown) => {
    const text = asNonEmpty(value)
    if (text) out.add(text)
  }

  const walk = (value: unknown): void => {
    if (value == null) return

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return

      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          walk(JSON.parse(trimmed))
          return
        } catch {
          // keep scalar fallback below
        }
      }

      if (/^\d+$/.test(trimmed)) push(trimmed)
      return
    }

    if (typeof value === 'number') {
      push(value)
      return
    }

    if (Array.isArray(value)) {
      for (const entry of value) walk(entry)
      return
    }

    if (typeof value !== 'object') return

    const record = value as Record<string, unknown>

    if (Array.isArray(record.linked_item_ids)) {
      for (const id of record.linked_item_ids) walk(id)
    }

    if (Array.isArray(record.linked_items)) {
      for (const item of record.linked_items) {
        if (item && typeof item === 'object' && 'id' in (item as Record<string, unknown>)) {
          walk((item as Record<string, unknown>).id)
        } else {
          walk(item)
        }
      }
    }

    if (Array.isArray(record.item_ids)) {
      for (const id of record.item_ids) walk(id)
    }

    if (Array.isArray(record.linkedPulseIds)) {
      for (const entry of record.linkedPulseIds) {
        if (entry && typeof entry === 'object' && 'linkedPulseId' in (entry as Record<string, unknown>)) {
          walk((entry as Record<string, unknown>).linkedPulseId)
        } else {
          walk(entry)
        }
      }
    }

    if ('value' in record) walk(record.value)
    if ('data' in record) walk(record.data)
  }

  walk(rawValue)
  return Array.from(out)
}

function extractRelationIdsFromGraphQLColumn(column: any): string[] {
  if (!column || typeof column !== 'object') return []

  if (Array.isArray(column.linked_item_ids)) {
    return Array.from(new Set(column.linked_item_ids.map((entry: unknown) => asNonEmpty(entry)).filter((entry: string) => Boolean(entry))))
  }

  return extractRelationIdsFromRaw(column.value)
}

function normalizeColumns(item: any, titleById: Map<string, string>, typeById: Map<string, string>): MondayColumnValue[] {
  return (item.column_values ?? []).map((column: any) => {
    const relationIds = extractRelationIdsFromGraphQLColumn(column)

    const normalizedValue =
      column.value != null
        ? typeof column.value === 'string'
          ? column.value
          : JSON.stringify(column.value)
        : relationIds.length > 0
          ? JSON.stringify({ linked_item_ids: relationIds })
          : null

    return {
      id: String(column.id),
      title: asNonEmpty(titleById.get(column.id) ?? column.id),
      type: String(column.type ?? typeById.get(column.id) ?? 'unknown'),
      text: asNonEmpty(column.display_value) || asNonEmpty(column.text),
      displayValue: asNonEmpty(column.display_value) || null,
      value: normalizedValue,
      relationIds,
    }
  })
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

function normalizeClientsBoard(board: any, facilitiesRelationColumnId: string): MondayClientRecord[] {
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
      facilitiesRelationIds: (() => {
        const relationColumn = columns.find((column) => column.id === facilitiesRelationColumnId)
        if (relationColumn?.relationIds?.length) return relationColumn.relationIds
        return extractRelationIdsFromRaw(relationColumn?.value ?? null)
      })(),
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
          settings_str
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
              ... on BoardRelationValue { display_value linked_item_ids }
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
    '׳׳×׳” ׳¡׳•׳›׳ ׳×׳₪׳¢׳•׳׳™ ׳©׳ Upflow.',
    '׳¢׳ ׳” ׳‘׳¢׳‘׳¨׳™׳× ׳‘׳¨׳•׳¨׳” ׳•׳§׳¦׳¨׳”.',
    '׳”׳©׳×׳׳© ׳׳ ׳•׳¨׳§ ׳‘׳׳™׳“׳¢ ׳©׳¡׳•׳₪׳§ ׳‘׳§׳•׳ ׳˜׳§׳¡׳˜.',
    '׳׳ ׳”׳׳™׳“׳¢ ׳׳ ׳§׳™׳™׳ ׳‘׳§׳•׳ ׳˜׳§׳¡׳˜, ׳¦׳™׳™׳ ׳–׳׳× ׳‘׳׳₪׳•׳¨׳© ׳•׳׳ ׳×׳׳¦׳™׳ ׳ ׳×׳•׳ ׳™׳.',
    '׳›׳׳©׳¨ ׳¨׳׳•׳•׳ ׳˜׳™, ׳”׳—׳–׳¨ ׳ ׳§׳•׳“׳•׳× ׳§׳¦׳¨׳•׳× ׳¢׳ ׳׳¡׳₪׳¨׳™׳ ׳׳“׳•׳™׳§׳™׳.',
    shouldReturnLinks
      ? '׳”׳׳©׳×׳׳© ׳‘׳™׳§׳© ׳§׳™׳©׳•׳¨׳™׳ ׳׳§׳‘׳¦׳™׳. ׳”׳—׳–׳¨ ׳§׳™׳©׳•׳¨׳™׳ ׳׳—׳™׳¦׳™׳ ׳‘׳₪׳•׳¨׳׳˜ Markdown: [׳©׳ ׳§׳¦׳¨](https://...). ׳×׳¢׳“׳£ Monday ׳•-Google Drive ׳›׳©׳”׳ ׳§׳™׳™׳׳™׳.'
      : '׳׳ ׳™׳© URL-׳™׳ ׳¨׳׳•׳•׳ ׳˜׳™׳™׳ ׳‘׳×׳©׳•׳‘׳”, ׳”׳—׳–׳¨ ׳׳•׳×׳ ׳›׳׳™׳ ׳§׳™׳ ׳׳—׳™׳¦׳™׳ ׳‘׳₪׳•׳¨׳׳˜ Markdown.',
  ].join('\n')

  const userPrompt = [`׳©׳׳׳”: ${question}`, '', '׳§׳•׳ ׳˜׳§׳¡׳˜ ׳ ׳×׳•׳ ׳™׳:', context || '׳׳ ׳¡׳•׳₪׳§ ׳§׳•׳ ׳˜׳§׳¡׳˜.'].join('\n')

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
    const requestPath = String(req.url ?? '').split('?')[0]
    const runtimeSecrets = [env.supabaseAnonKey, env.supabaseServiceRoleKey, env.mondayApiToken, env.openRouterApiKey]
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
    
    if (requestPath === '/api/runtime-db/health' && req.method === 'GET') {
      const guard = await requireApprovedPermissions({
        req,
        res,
        env: toGuardEnv(env),
        requiredPermissions: [],
      })
      if (!guard) return

      try {
        const health = await checkSupabaseRuntimeHealth(
          readSupabaseRuntimeConfig({
            SUPABASE_URL: env.supabaseUrl,
            SUPABASE_ANON_KEY: env.supabaseAnonKey,
            SUPABASE_SERVICE_ROLE_KEY: env.supabaseServiceRoleKey,
            SUPABASE_DB_SCHEMA: env.supabaseDbSchema,
          }),
        )

        if (health.missingConfig.length > 0) {
          jsonError(res, 500, 'SUPABASE_CONFIG_MISSING', 'Supabase runtime config is missing', {
            missingConfig: health.missingConfig,
            schema: health.schema,
          })
          return
        }

        if (health.missingTables.length > 0) {
          jsonError(res, 503, 'SUPABASE_SCHEMA_MISSING', 'Supabase runtime schema is incomplete', {
            missingTables: health.missingTables,
            schema: health.schema,
          })
          return
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            ok: true,
            health: {
              ready: true,
              schema: health.schema,
              checkedAt: new Date().toISOString(),
            },
          }),
        )
      } catch (error) {
        const safeMessage = sanitizeRuntimeErrorMessage(error instanceof Error ? error.message : 'Supabase health check failed', runtimeSecrets)
        console.error('[runtime-db.health]', safeMessage)
        jsonError(res, 500, 'SUPABASE_HEALTHCHECK_FAILED', safeMessage)
      }

      return
    }

    if (requestPath === '/api/runtime-db/sync/monday-snapshot' && req.method === 'POST') {
      const guard = await requireApprovedPermissions({
        req,
        res,
        env: toGuardEnv(env),
        requiredPermissions: ['screen.clients', 'screen.equipment'],
      })
      if (!guard) return

      if (guard.user.role !== 'Admin' && guard.user.role !== 'Operations') {
        jsonError(res, 403, 'AUTH_PERMISSION_DENIED', 'Only Admin/Operations can trigger runtime sync')
        return
      }

      if (!env.mondayApiToken) {
        jsonError(res, 500, 'MONDAY_CONFIG_MISSING', 'MONDAY_API_TOKEN is missing on server')
        return
      }

      const supabaseConfig = readSupabaseRuntimeConfig({
        SUPABASE_URL: env.supabaseUrl,
        SUPABASE_ANON_KEY: env.supabaseAnonKey,
        SUPABASE_SERVICE_ROLE_KEY: env.supabaseServiceRoleKey,
        SUPABASE_DB_SCHEMA: env.supabaseDbSchema,
      })

      try {
        const health = await checkSupabaseRuntimeHealth(supabaseConfig)
        if (health.missingConfig.length > 0) {
          jsonError(res, 500, 'SUPABASE_CONFIG_MISSING', 'Critical Supabase runtime config is missing', {
            missingConfig: health.missingConfig,
          })
          return
        }

        if (health.missingTables.length > 0) {
          jsonError(res, 412, 'SUPABASE_SCHEMA_MISSING', 'Supabase runtime schema is not ready', {
            missingTables: health.missingTables,
          })
          return
        }
        const mappingInventory = buildMondayMappingInventory()

        const clientsBoard = await fetchBoard(env.mondayApiToken, env.mondayClientsBoardId)
        const equipmentBoard = await fetchBoard(env.mondayApiToken, env.mondayEquipmentBoardId)
        const authBoard = await fetchBoard(env.mondayApiToken, mappingInventory.boards.auth)
        const operationsBoard = await fetchBoard(env.mondayApiToken, mappingInventory.boards.operations)
        const scheduleBoard = await fetchBoard(env.mondayApiToken, mappingInventory.boards.schedule)
        const reportsBoard = await fetchBoard(env.mondayApiToken, mappingInventory.boards.reports)

        const clients = normalizeClientsBoard(clientsBoard, mappingInventory.columns.clients.facilitiesRelation)
        const facilities = normalizeEquipmentBoard(equipmentBoard)
        const usersSnapshot = normalizeUsersFromAuthBoard(authBoard, mappingInventory)
        const operationsSnapshot = normalizeOperationsFromBoard({
          operationsBoard,
          clientsBoard,
          scheduleBoard,
          mapping: mappingInventory,
          runtimeUsers: usersSnapshot.users,
        })
        const scheduleSnapshot = normalizeScheduleEntriesFromBoard({
          scheduleBoard,
          operations: operationsSnapshot.operations,
          runtimeUsers: usersSnapshot.users,
          mapping: mappingInventory,
        })

        // ====== GOOGLE CALENDAR DIRECT BACKEND SYNC ======
        const calendarRefsToFetch = Array.from(
          new Set(
            scheduleSnapshot.scheduleEntries
              .map(s => s.calendarEventRef)
              .filter((ref): ref is string => Boolean(ref))
          )
        )
        const gcalCalendarId = process.env.VITE_GOOGLE_TARGET_CALENDAR_ID || 'upflow.operations@gmail.com'
        const gcalEventsMap = await fetchGoogleCalendarEventsByRefs(gcalCalendarId, calendarRefsToFetch)
        
        // Mutate schedule entries with verified Google Dates
        for (const entry of scheduleSnapshot.scheduleEntries) {
          if (entry.calendarEventRef) {
            const cleanRef = entry.calendarEventRef.toLowerCase()
            const match = gcalEventsMap.get(cleanRef) || 
                          gcalEventsMap.get(cleanRef.replace('@google.com', '')) ||
                          Array.from(gcalEventsMap.entries()).find(([k]) => k.includes(cleanRef) || cleanRef.includes(k))?.[1]
            
            if (match) {
              entry.plannedDate = match.startDate
              entry.plannedDateTime = match.startDateTime
              entry.plannedDateTimeSource = 'calendar'
            }
          }
        }
        // =================================================
        const reportsSnapshot = normalizeReportsFromBoard({
          reportsBoard,
          operations: operationsSnapshot.operations,
          scheduleEntries: scheduleSnapshot.scheduleEntries,
          mapping: mappingInventory,
        })
        const exceptionsSnapshot = computeCanonicalRuntimeExceptions({
          operations: operationsSnapshot.operations,
          scheduleEntries: scheduleSnapshot.scheduleEntries,
          reports: reportsSnapshot.reports,
        })
        const fetchedAt = new Date().toISOString()

        const diagnostics = {
          runtimeSyncSignature: RUNTIME_SYNC_SIGNATURE,
          schema: env.supabaseDbSchema,
          fetchedBoards: {
            clients: { id: String(clientsBoard.id), name: String(clientsBoard.name ?? 'clients'), items: (clientsBoard.items_page?.items ?? []).length },
            equipment: { id: String(equipmentBoard.id), name: String(equipmentBoard.name ?? 'equipment'), items: (equipmentBoard.items_page?.items ?? []).length },
            auth: { id: String(authBoard.id), name: String(authBoard.name ?? 'auth'), items: (authBoard.items_page?.items ?? []).length },
            operations: { id: String(operationsBoard.id), name: String(operationsBoard.name ?? 'operations'), items: (operationsBoard.items_page?.items ?? []).length },
            schedule: { id: String(scheduleBoard.id), name: String(scheduleBoard.name ?? 'schedule'), items: (scheduleBoard.items_page?.items ?? []).length },
            reports: { id: String(reportsBoard.id), name: String(reportsBoard.name ?? 'reports'), items: (reportsBoard.items_page?.items ?? []).length },
          },
          normalized: {
            clients: clients.length,
            facilities: facilities.length,
            users: usersSnapshot.users.length,
            operations: operationsSnapshot.operations.length,
            assignments: operationsSnapshot.assignments.length,
            scheduleEntries: scheduleSnapshot.scheduleEntries.length,
            reports: reportsSnapshot.reports.length,
            exceptions: exceptionsSnapshot.exceptions.length,
          },
          skipped: {
            users: usersSnapshot.diagnostics.skipped,
            operations: operationsSnapshot.diagnostics.skipped,
            schedule: scheduleSnapshot.diagnostics.skipped,
            reports: reportsSnapshot.diagnostics.skipped,
          },
          payloadSamples: {
            auth: usersSnapshot.diagnostics.payloadSamples?.auth ?? [],
            operationsClientRelation: operationsSnapshot.diagnostics.payloadSamples?.operationsClientRelation ?? [],
            clientsFacilitiesRelation: operationsSnapshot.diagnostics.payloadSamples?.clientsFacilitiesRelation ?? [],
            scheduleCalendarEventRef: scheduleSnapshot.diagnostics.payloadSamples?.calendarEventRef ?? [],
            scheduleCalendarSyncStatus: scheduleSnapshot.diagnostics.payloadSamples?.calendarSyncStatus ?? [],
            scheduleControlStatus: scheduleSnapshot.diagnostics.payloadSamples?.scheduleControlStatus ?? [],
            scheduleReportRelation: scheduleSnapshot.diagnostics.payloadSamples?.reportRelation ?? [],
          },
        }

        const supabase = createSupabaseAdminClient(supabaseConfig)
        const result = await persistRuntimeSnapshotToSupabase(supabase, {
          source: 'monday_snapshot',
          fetchedAt,
          clients,
          facilities,
          users: usersSnapshot.users,
          operations: operationsSnapshot.operations,
          assignments: operationsSnapshot.assignments,
          scheduleEntries: scheduleSnapshot.scheduleEntries,
          reports: reportsSnapshot.reports,
          exceptions: exceptionsSnapshot.exceptions,
          syncDiagnostics: diagnostics,
        })

        const persisted = {
          clients: result.clientsUpserted,
          facilities: result.facilitiesUpserted,
          users: result.usersUpserted,
          operations: result.operationsUpserted,
          assignments: result.assignmentsUpserted,
          scheduleEntries: result.scheduleEntriesUpserted,
          reports: result.reportsUpserted,
          exceptions: result.exceptionsUpserted,
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            ok: true,
            fetchedAt,
            runtimeSyncSignature: RUNTIME_SYNC_SIGNATURE,
            diagnostics: {
              ...diagnostics,
              persisted,
            },
            sync: result,
          }),
        )
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Runtime sync failed'
        const safeMessage = sanitizeRuntimeErrorMessage(rawMessage, runtimeSecrets)
        console.error('[runtime-db.sync]', safeMessage)
        if (rawMessage.includes('SUPABASE_')) {
          jsonError(res, 502, 'SUPABASE_SYNC_FAILED', safeMessage)
          return
        }

        if (rawMessage.includes('MAPPING_')) {
          jsonError(res, 500, 'MAPPING_CONFIG_ERROR', safeMessage)
          return
        }

        if (rawMessage.includes('Monday')) {
          jsonError(res, 502, 'UPSTREAM_FETCH_FAILED', safeMessage)
          return
        }

        jsonError(res, 500, 'RUNTIME_SYNC_FAILED', safeMessage)
      }

      return
    }

    if (requestPath === '/api/runtime-db/sync/latest' && req.method === 'GET') {
      const guard = await requireApprovedPermissions({
        req,
        res,
        env: toGuardEnv(env),
        requiredPermissions: [],
      })
      if (!guard) return

      const snapshotPermissions: PermissionKey[] = ['screen.assistant', 'screen.clients', 'screen.equipment', 'screen.team']
      if (!hasAnyPermission(guard.user.permissions.keys, snapshotPermissions)) {
        jsonError(res, 403, 'AUTH_PERMISSION_DENIED', 'Missing runtime sync diagnostics permissions', {
          requiredAnyOf: snapshotPermissions,
        })
        return
      }

      const supabaseConfig = readSupabaseRuntimeConfig({
        SUPABASE_URL: env.supabaseUrl,
        SUPABASE_ANON_KEY: env.supabaseAnonKey,
        SUPABASE_SERVICE_ROLE_KEY: env.supabaseServiceRoleKey,
        SUPABASE_DB_SCHEMA: env.supabaseDbSchema,
      })

      try {
        const health = await checkSupabaseRuntimeHealth(supabaseConfig)
        if (health.missingConfig.length > 0) {
          jsonError(res, 500, 'SUPABASE_CONFIG_MISSING', 'Supabase runtime config is missing', {
            missingConfig: health.missingConfig,
            schema: health.schema,
          })
          return
        }

        if (health.missingTables.length > 0) {
          jsonError(res, 503, 'SUPABASE_SCHEMA_MISSING', 'Supabase runtime schema is incomplete', {
            missingTables: health.missingTables,
            schema: health.schema,
          })
          return
        }

        const supabase = createSupabaseAdminClient(supabaseConfig)
        const latest = await readLatestRuntimeSyncRun(supabase, runtimeSecrets)

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            ok: true,
            source: 'supabase_runtime',
            ...latest,
          }),
        )
      } catch (error) {
        const safeMessage = sanitizeRuntimeErrorMessage(
          error instanceof Error ? error.message : 'Runtime sync latest failed',
          runtimeSecrets,
        )
        console.error('[runtime-db.sync.latest]', safeMessage)
        jsonError(res, 502, 'RUNTIME_SYNC_LATEST_FAILED', safeMessage)
      }

      return
    }

    if (requestPath === '/api/runtime-db/smoke' && req.method === 'GET') {
      const guard = await requireApprovedPermissions({
        req,
        res,
        env: toGuardEnv(env),
        requiredPermissions: [],
      })
      if (!guard) return

      if (guard.user.role !== 'Admin' && guard.user.role !== 'Operations') {
        jsonError(res, 403, 'AUTH_PERMISSION_DENIED', 'Only Admin/Operations can run runtime smoke checks')
        return
      }

      const supabaseConfig = readSupabaseRuntimeConfig({
        SUPABASE_URL: env.supabaseUrl,
        SUPABASE_ANON_KEY: env.supabaseAnonKey,
        SUPABASE_SERVICE_ROLE_KEY: env.supabaseServiceRoleKey,
        SUPABASE_DB_SCHEMA: env.supabaseDbSchema,
      })

      try {
        const health = await checkSupabaseRuntimeHealth(supabaseConfig)
        if (health.missingConfig.length > 0) {
          jsonError(res, 500, 'SUPABASE_CONFIG_MISSING', 'Supabase runtime config is missing', {
            missingConfig: health.missingConfig,
            schema: health.schema,
          })
          return
        }

        if (health.missingTables.length > 0) {
          jsonError(res, 503, 'SUPABASE_SCHEMA_MISSING', 'Supabase runtime schema is incomplete', {
            missingTables: health.missingTables,
            schema: health.schema,
          })
          return
        }

        const supabase = createSupabaseAdminClient(supabaseConfig)
        const latestSync = await readLatestRuntimeSyncRun(supabase, runtimeSecrets)
        const runtimeSnapshot = await readRuntimeClientsAndFacilities(supabase, runtimeSecrets)

        const latest = latestSync.latest as Record<string, unknown> | null

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            ok: true,
            source: 'supabase_runtime',
            smoke: {
              checkedAt: new Date().toISOString(),
              health: {
                ready: true,
                schema: health.schema,
              },
              latestSync: latest
                ? {
                    id: latest.id ?? null,
                    source: latest.source ?? null,
                    status: latest.status ?? null,
                    startedAt: latest.started_at ?? null,
                    finishedAt: latest.finished_at ?? null,
                    rowsUpserted: latest.rows_upserted ?? null,
                  }
                : null,
              snapshot: {
                fetchedAt: runtimeSnapshot.fetchedAt,
                clients: runtimeSnapshot.clients.length,
                facilities: runtimeSnapshot.facilities.length,
              },
            },
          }),
        )
      } catch (error) {
        const safeMessage = sanitizeRuntimeErrorMessage(
          error instanceof Error ? error.message : 'Runtime smoke check failed',
          runtimeSecrets,
        )
        console.error('[runtime-db.smoke]', safeMessage)
        jsonError(res, 502, 'RUNTIME_SMOKE_FAILED', safeMessage)
      }

      return
    }

    if (requestPath === '/api/monday/operations/assign' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req) as { operationId?: string; technicianName?: string; technicianEmail?: string }
        const { operationId, technicianName, technicianEmail } = body || {}

        if (!operationId || !technicianName) {
          jsonError(res, 400, 'MISSING_PARAMS', 'operationId and technicianName are required')
          return
        }

        const mondayToken = env.mondayApiToken
        if (!mondayToken) {
          jsonError(res, 500, 'CONFIG_ERROR', 'Monday API token not configured')
          return
        }

        const opsBoardId = (env as any).runtimeSecrets?.boards?.operations || '1798247340'
        const performerCol = (env as any).runtimeSecrets?.columns?.operations?.performerRelation || 'board_relation_mm17kvck'

        // Find the technician item ID on the connected board by searching all boards for the email
        // First, search the auth board for the person item by name
        const searchQuery = `query ($name: String!) { items_page_by_column_values (board_id: ${env.mondayAuthBoardId}, limit: 5, columns: [{column_id: "name", column_values: [$name]}]) { items { id name } } }`
        const searchResult = await mondayRequest(searchQuery, { name: technicianName }, mondayToken)
        const matchedItems = searchResult?.items_page_by_column_values?.items || []
        const techItem = matchedItems.find((item: any) => item.name === technicianName) || matchedItems[0]

        if (techItem) {
          // Update the performer relation column on the operation
          const updateQuery = `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }`
          const columnValues = JSON.stringify({ [performerCol]: { item_ids: [Number(techItem.id)] } })
          await mondayRequest(updateQuery, { boardId: opsBoardId, itemId: operationId, columnValues }, mondayToken)
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, matched: !!techItem, techItemId: techItem?.id ?? null }))
      } catch (err: any) {
        console.error('[monday/operations/assign]', err)
        jsonError(res, 500, 'MONDAY_UPDATE_FAILED', err?.message || 'Unknown error')
      }
      return
    }

    // --- Update planned date on the schedule board linked to an operation ---
    if (requestPath === '/api/monday/operations/update-date' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req) as { operationId?: string; scheduleItemId?: string; date?: string; startTime?: string; endTime?: string }
        const { operationId, scheduleItemId, date, startTime } = body || {}

        if (!date) {
          jsonError(res, 400, 'MISSING_PARAMS', 'date is required')
          return
        }
        if (!scheduleItemId && !operationId) {
          jsonError(res, 400, 'MISSING_PARAMS', 'scheduleItemId or operationId is required')
          return
        }

        const mondayToken = env.mondayApiToken
        if (!mondayToken) {
          jsonError(res, 500, 'CONFIG_ERROR', 'Monday API token not configured')
          return
        }

        const scheduleBoardId = (env as any).runtimeSecrets?.boards?.schedule || '1783389345'
        const plannedDateCol = (env as any).runtimeSecrets?.columns?.schedule?.plannedDate || 'date4'

        let targetItemId = scheduleItemId || null

        // If no direct schedule item ID, search by operation ID
        if (!targetItemId && operationId) {
          const opIdRefCol = (env as any).runtimeSecrets?.columns?.schedule?.operationIdRef || 'text_mknfnj59'
          const searchQuery = `query ($boardId: [ID!]!) { boards(ids: $boardId) { items_page(limit: 500) { items { id column_values { id text } } } } }`
          const searchResult = await mondayRequest(searchQuery, { boardId: scheduleBoardId }, mondayToken)
          const allItems = searchResult?.boards?.[0]?.items_page?.items || []
          const scheduleItem = allItems.find((item: any) =>
            item.column_values?.some((cv: any) => cv.id === opIdRefCol && cv.text === operationId)
          )
          targetItemId = scheduleItem?.id || null
        }

        if (!targetItemId) {
          console.warn('[monday/operations/update-date] No schedule item found', { operationId, scheduleItemId })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, matched: false, note: 'No schedule item found' }))
          return
        }

        // Build the date column value — Monday date format: { date: "YYYY-MM-DD", time: "HH:MM:SS" }
        const dateValue: any = { date }
        if (startTime) dateValue.time = `${startTime}:00`

        console.log('[monday/operations/update-date] Updating item', targetItemId, 'with', JSON.stringify(dateValue))
        const updateQuery = `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }`
        const columnValues = JSON.stringify({ [plannedDateCol]: dateValue })
        await mondayRequest(updateQuery, { boardId: scheduleBoardId, itemId: String(targetItemId), columnValues }, mondayToken)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, matched: true, scheduleItemId: targetItemId }))
      } catch (err: any) {
        console.error('[monday/operations/update-date]', err)
        jsonError(res, 500, 'MONDAY_UPDATE_FAILED', err?.message || 'Unknown error')
      }
      return
    }

    if (requestPath === '/api/monday/snapshot' && req.method === 'GET') {
      jsonError(res, 410, 'API_DEPRECATED', 'Use /api/runtime-db/snapshot')
      return
    }

    if (requestPath === '/api/runtime-db/snapshot' && req.method === 'GET') {
      const guard = await requireApprovedPermissions({
        req,
        res,
        env: toGuardEnv(env),
        requiredPermissions: [],
      })
      if (!guard) return

      const snapshotPermissions: PermissionKey[] = ['screen.assistant', 'screen.clients', 'screen.equipment', 'screen.team']
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

      const supabaseConfig = readSupabaseRuntimeConfig({
        SUPABASE_URL: env.supabaseUrl,
        SUPABASE_ANON_KEY: env.supabaseAnonKey,
        SUPABASE_SERVICE_ROLE_KEY: env.supabaseServiceRoleKey,
        SUPABASE_DB_SCHEMA: env.supabaseDbSchema,
      })

      try {
        const health = await checkSupabaseRuntimeHealth(supabaseConfig)

        if (health.missingConfig.length > 0) {
          jsonError(res, 500, 'SUPABASE_CONFIG_MISSING', 'Supabase runtime config is missing', {
            missingConfig: health.missingConfig,
            schema: health.schema,
          })
          return
        }

        if (health.missingTables.length > 0) {
          jsonError(res, 503, 'SUPABASE_SCHEMA_MISSING', 'Supabase runtime schema is incomplete', {
            missingTables: health.missingTables,
            schema: health.schema,
          })
          return
        }

        const supabase = createSupabaseAdminClient(supabaseConfig)
        const runtimeSnapshot = await readRuntimeClientsAndFacilities(supabase, runtimeSecrets)

        let clients = runtimeSnapshot.clients
        let facilities = runtimeSnapshot.facilities
        let operations = runtimeSnapshot.operations
        let assignments = runtimeSnapshot.assignments
        let scheduleEntries = runtimeSnapshot.scheduleEntries
        let reports = runtimeSnapshot.reports
        let exceptions = runtimeSnapshot.exceptions
        let users = runtimeSnapshot.users

        if (guard.user.scope.scopedRole) {
          clients = filterByScope(clients, guard.user.scope.clientIds)
          facilities = filterByScope(facilities, guard.user.scope.facilityIds)

          const scopedEmail = String(guard.user.email ?? '')
            .trim()
            .toLowerCase()
          operations = operations.filter((entry) => String(entry.assignedTechnicianEmail ?? '').trim().toLowerCase() === scopedEmail)
          const allowedOperationIds = new Set(operations.map((entry) => entry.id))
          assignments = assignments.filter(
            (entry) => String(entry.userEmail ?? '').trim().toLowerCase() === scopedEmail && allowedOperationIds.has(entry.operationId),
          )
          users = users.filter((entry) => entry.email === scopedEmail)
          scheduleEntries = scheduleEntries.filter((entry) => {
            const scheduleEmail = String(entry.technicianEmail ?? '').trim().toLowerCase()
            return scheduleEmail === scopedEmail && allowedOperationIds.has(String(entry.operationId ?? ''))
          })
          reports = reports.filter((entry) => allowedOperationIds.has(String(entry.operationId ?? '')))
          exceptions = exceptions.filter((entry) => {
            if (entry.operationId && allowedOperationIds.has(String(entry.operationId))) return true
            const exceptionEmail = String(entry.technicianEmail ?? '').trim().toLowerCase()
            return exceptionEmail === scopedEmail
          })
        }

        const projections = buildRuntimeOperationalProjections({
          clients,
          facilities,
          operations,
          assignments,
          users,
          scheduleEntries,
          reports,
          exceptions,
          fetchedAt: runtimeSnapshot.fetchedAt,
        })

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            clients,
            facilities,
            operations,
            assignments,
            users,
            scheduleEntries,
            reports,
            exceptions,
            projections,
            fetchedAt: runtimeSnapshot.fetchedAt,
            source: 'supabase_runtime',
          }),
        )
      } catch (error) {
        const safeMessage = sanitizeRuntimeErrorMessage(
          error instanceof Error ? error.message : 'Runtime snapshot failed',
          runtimeSecrets,
        )
        console.error('[runtime-db.snapshot]', safeMessage)
        jsonError(res, 502, 'RUNTIME_SNAPSHOT_FAILED', safeMessage)
      }

      return
    }
    if (requestPath === '/api/ai/memory' && req.method === 'POST') {
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

    if (requestPath === '/api/ai/chat' && req.method === 'POST') {
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
        const fullContext = [memoryContext, '', '׳§׳•׳ ׳˜׳§׳¡׳˜ ׳¢׳¡׳§׳™ ׳ ׳•׳¡׳£:', context, linksContext ? `\n${linksContext}` : ''].join('\n')

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
    supabaseUrl: (loaded.SUPABASE_URL || '').trim(),
    supabaseAnonKey: (loaded.SUPABASE_ANON_KEY || '').trim(),
    supabaseServiceRoleKey: (loaded.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    supabaseDbSchema: (loaded.SUPABASE_DB_SCHEMA || 'public').trim() || 'public',
    isProduction: mode === 'production',
  }

  // Task 001: fail-closed validation for critical board/column mappings.
  // Uses explicit defaults from the system spec and throws on missing/ambiguous mappings.
  buildMondayMappingInventory({
    boards: {
      auth: env.mondayAuthBoardId,
      clients: env.mondayClientsBoardId,
      equipment: env.mondayEquipmentBoardId,
      operations: (loaded.MONDAY_OPERATIONS_BOARD_ID || '1798247340').trim(),
      schedule: (loaded.MONDAY_SCHEDULE_BOARD_ID || '1783389345').trim(),
      reports: (loaded.MONDAY_REPORTS_BOARD_ID || '1282241018').trim(),
    },
    columns: {
      auth: {
        role: (loaded.AUTH_ROLE_COLUMN_ID || 'color_mm16fjq9').trim(),
        approval: (loaded.AUTH_APPROVAL_COLUMN_ID || 'color_mm167kpn').trim(),
        employeeStatus: (loaded.AUTH_EMPLOYEE_STATUS_COLUMN_ID || 'status_mkmesmm9').trim(),
        email: (loaded.AUTH_EMAIL_COLUMN_ID || 'email').trim(),
        phone: (loaded.AUTH_PHONE_COLUMN_ID || 'phone_mkn2my3a').trim(),
        assistantToggle: (loaded.AUTH_TOGGLE_ASSISTANT_COLUMN_ID || 'boolean_mm16vydm').trim(),
        calendarToggle: (loaded.AUTH_TOGGLE_CALENDAR_COLUMN_ID || 'boolean_mm1680j8').trim(),
        clientsToggle: (loaded.AUTH_TOGGLE_CLIENTS_COLUMN_ID || 'boolean_mm16kwda').trim(),
        teamToggle: (loaded.AUTH_TOGGLE_TEAM_COLUMN_ID || 'boolean_mm1699jc').trim(),
        equipmentToggle: (loaded.AUTH_TOGGLE_EQUIPMENT_COLUMN_ID || 'boolean_mm16e9yf').trim(),
        aiAskToggle: (loaded.AUTH_TOGGLE_AI_ASK_COLUMN_ID || 'boolean_mm16vdk4').trim(),
        assignedClientsRelation: (loaded.AUTH_ASSIGNED_CLIENTS_COLUMN_ID || 'board_relation_mm172f5y').trim(),
        assignedFacilitiesRelation: (loaded.AUTH_ASSIGNED_FACILITIES_COLUMN_ID || 'board_relation_mm17fgf6').trim(),
      },
      operations: {
        shortOperationId: (loaded.OPERATIONS_SHORT_ID_COLUMN_ID || 'text_mknfh1x1').trim(),
        requestPurpose: (loaded.OPERATIONS_REQUEST_PURPOSE_COLUMN_ID || 'dropdown_mkmm9qzh').trim(),
        businessStatus: (loaded.OPERATIONS_BUSINESS_STATUS_COLUMN_ID || 'color_mkngxc3y').trim(),
        clientRelation: (loaded.OPERATIONS_CLIENT_RELATION_COLUMN_ID || 'connect_boards_mkmmhxe7').trim(),
        performerRelation: (loaded.OPERATIONS_PERFORMER_RELATION_COLUMN_ID || 'board_relation_mm17kvck').trim(),
        performerEmailMirror: (loaded.OPERATIONS_PERFORMER_EMAIL_MIRROR_COLUMN_ID || 'lookup_mm174zqb').trim(),
        scheduleRelation: (loaded.OPERATIONS_SCHEDULE_RELATION_COLUMN_ID || 'connect_boards_mkn82w54').trim(),
        calendarEventMirror: (loaded.OPERATIONS_CALENDAR_EVENT_MIRROR_COLUMN_ID || 'lookup_mm17kybq').trim(),
        reportSequenceNumber: (loaded.OPERATIONS_REPORT_SEQUENCE_COLUMN_ID || 'numbers_mkmvq21y').trim(),
        executionStatusCheck: (loaded.OPERATIONS_EXECUTION_STATUS_COLUMN_ID || 'color_mm17daw5').trim(),
      },
      clients: {
        facilitiesRelation: (loaded.CLIENTS_FACILITIES_RELATION_COLUMN_ID || 'board_relation_mm18w9fb').trim(),
      },
      schedule: {
        operationIdRef: (loaded.SCHEDULE_OPERATION_ID_REF_COLUMN_ID || 'text_mknfnj59').trim(),
        technicianRelation: (loaded.SCHEDULE_TECHNICIAN_RELATION_COLUMN_ID || 'board_relation_mm173tqk').trim(),
        technicianEmailMirror: (loaded.SCHEDULE_TECHNICIAN_EMAIL_MIRROR_COLUMN_ID || 'lookup_mm17dqgp').trim(),
        technicianLegacyDropdown: (loaded.SCHEDULE_TECHNICIAN_LEGACY_DROPDOWN_COLUMN_ID || 'dropdown_mkmmb2x').trim(),
        taskType: (loaded.SCHEDULE_TASK_TYPE_COLUMN_ID || 'dropdown_mkn9g57j').trim(),
        plannedDate: (loaded.SCHEDULE_PLANNED_DATE_COLUMN_ID || 'date4').trim(),
        calendarEventRef: (loaded.SCHEDULE_CALENDAR_EVENT_REF_COLUMN_ID || 'integration').trim(),
        scheduleStatus: (loaded.SCHEDULE_STATUS_COLUMN_ID || 'status').trim(),
        reportRelation: (loaded.SCHEDULE_REPORT_RELATION_COLUMN_ID || 'connect_boards_mkn1c2vc').trim(),
        calendarSyncStatus: (loaded.SCHEDULE_CALENDAR_SYNC_STATUS_COLUMN_ID || 'color_mm17pp1n').trim(),
        scheduleControlStatus: (loaded.SCHEDULE_CONTROL_STATUS_COLUMN_ID || 'color_mm179n1t').trim(),
      },
      reports: {
        operationIdRef: (loaded.REPORTS_OPERATION_ID_REF_COLUMN_ID || 'text_mkmemh8m').trim(),
        scheduleRelation: (loaded.REPORTS_SCHEDULE_RELATION_COLUMN_ID || 'connect_boards_1_mkmxq34v').trim(),
        technicianEmailMirror: (loaded.REPORTS_TECHNICIAN_EMAIL_MIRROR_COLUMN_ID || 'lookup_mm171ygf').trim(),
        flowStatus: (loaded.REPORTS_FLOW_STATUS_COLUMN_ID || 'status_12').trim(),
        qaStatus: (loaded.REPORTS_QA_STATUS_COLUMN_ID || 'status6').trim(),
        executedAt: (loaded.REPORTS_EXECUTED_AT_COLUMN_ID || 'date4').trim(),
      },
    },
  })

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




























































