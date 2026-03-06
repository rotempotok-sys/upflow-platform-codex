import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MONDAY_API_URL = 'https://api.monday.com/v2'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CLIENTS_BOARD_ID = process.env.MONDAY_ACTIVE_CLIENTS_BOARD_ID || '1284652674'
const EQUIPMENT_BOARD_ID = process.env.MONDAY_EQUIPMENT_BOARD_ID || '2119399147'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

async function mondayRequest(query, variables, token) {
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

  const body = await response.json()
  if (body.errors?.length) {
    throw new Error(`Monday API errors: ${JSON.stringify(body.errors)}`)
  }

  return body.data
}

function decodePossiblyMojibake(value) {
  if (!value) return ''

  const hasCorruptedPattern = /[\u0080-\u00FF]|׳/.test(value)
  if (!hasCorruptedPattern) return value

  const bytes = Buffer.from(value, 'latin1')
  const utf8Decoded = bytes.toString('utf8')
  const cp1255Decoded = new TextDecoder('windows-1255').decode(bytes)

  const hasHebrew = (text) => /[א-ת]/.test(text)

  if (hasHebrew(cp1255Decoded)) return cp1255Decoded
  if (hasHebrew(utf8Decoded)) return utf8Decoded
  return value
}

function asNonEmpty(value) {
  const normalized = decodePossiblyMojibake(String(value ?? '')).trim()
  return normalized.length ? normalized : ''
}

function normalizeColumns(item, titleById, typeById) {
  return (item.column_values ?? []).map((column) => ({
    id: String(column.id),
    title: asNonEmpty(titleById.get(column.id) ?? column.id),
    type: String(column.type ?? typeById.get(column.id) ?? 'unknown'),
    text: asNonEmpty(column.display_value) || asNonEmpty(column.text),
    value: typeof column.value === 'string' ? column.value : null,
  }))
}

function pickColumnText(columns, options) {
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

function normalizeClientsBoard(board) {
  const titleById = new Map((board.columns ?? []).map((column) => [column.id, column.title]))
  const typeById = new Map((board.columns ?? []).map((column) => [column.id, column.type]))

  const clients = (board.items_page?.items ?? []).map((item) => {
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

  clients.sort((a, b) => a.name.localeCompare(b.name, 'he'))
  return clients
}

function normalizeEquipmentBoard(board) {
  const titleById = new Map((board.columns ?? []).map((column) => [column.id, column.title]))
  const typeById = new Map((board.columns ?? []).map((column) => [column.id, column.type]))

  const facilities = (board.items_page?.items ?? []).map((item) => {
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

  facilities.sort((a, b) => a.name.localeCompare(b.name, 'he'))
  return facilities
}

async function fetchBoard(token, boardId) {
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

async function writeClientsTs(clients) {
  const targetPath = path.resolve(__dirname, '../src/data/clientsData.ts')
  const body = [
    "import type { Client } from '../types/scheduling'",
    '',
    '// Auto-generated from Monday board read-only pull. Do not edit manually.',
    `export const clients: Client[] = ${JSON.stringify(clients, null, 2)}`,
    '',
  ].join('\n')

  await writeFile(targetPath, body, 'utf8')
  return targetPath
}

async function writeFacilitiesTs(facilities) {
  const targetPath = path.resolve(__dirname, '../src/data/facilitiesData.ts')
  const body = [
    "import type { FacilityRecord } from '../types/scheduling'",
    '',
    '// Auto-generated from Monday board read-only pull. Do not edit manually.',
    `export const facilities: FacilityRecord[] = ${JSON.stringify(facilities, null, 2)}`,
    '',
  ].join('\n')

  await writeFile(targetPath, body, 'utf8')
  return targetPath
}

async function main() {
  const token = requireEnv('MONDAY_API_TOKEN')

  const clientsBoard = await fetchBoard(token, CLIENTS_BOARD_ID)
  const equipmentBoard = await fetchBoard(token, EQUIPMENT_BOARD_ID)

  const clients = normalizeClientsBoard(clientsBoard)
  const facilities = normalizeEquipmentBoard(equipmentBoard)

  const clientsTarget = await writeClientsTs(clients)
  const facilitiesTarget = await writeFacilitiesTs(facilities)

  console.log(`Pulled ${clients.length} clients from board ${CLIENTS_BOARD_ID}`)
  console.log(`Pulled ${facilities.length} facilities from board ${EQUIPMENT_BOARD_ID}`)
  console.log(`Updated file: ${clientsTarget}`)
  console.log(`Updated file: ${facilitiesTarget}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})




