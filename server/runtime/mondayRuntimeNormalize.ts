import type { MondayMappingInventory } from '../monday/mappingInventory'

interface MondayColumnValue {
  id: string
  text?: string | null
  value?: string | null
  display_value?: string | null
}

interface MondayItem {
  id: string
  name?: string | null
  column_values?: MondayColumnValue[]
}

interface MondayBoard {
  id: string
  name?: string | null
  columns?: Array<{ id: string }>
  items_page?: {
    items?: MondayItem[]
  }
}

export interface RuntimeUserSnapshotRow {
  email: string
  displayName: string
  role: string | null
  approval: string | null
  metadata: Record<string, unknown>
}

export interface RuntimeOperationSnapshotRow {
  id: string
  shortOperationId: string | null
  assignedTechnicianEmail: string | null
  executionStatus: string | null
  metadata: Record<string, unknown>
}

export interface RuntimeOperationAssignmentSnapshotRow {
  operationId: string
  userEmail: string
  role: 'performer'
  metadata: Record<string, unknown>
}

export interface UsersNormalizationDiagnostics {
  boardId: string
  boardName: string
  fetchedItems: number
  normalizedUsers: number
  skipped: {
    missingEmail: number
    duplicateEmail: number
  }
}

export interface OperationsNormalizationDiagnostics {
  boardId: string
  boardName: string
  fetchedItems: number
  normalizedOperations: number
  normalizedAssignments: number
  skipped: {
    missingOperationId: number
    assignmentMissingEmail: number
    duplicateOperation: number
    duplicateAssignment: number
  }
}

function normalizedText(value: unknown) {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : ''
}

function normalizedEmail(value: unknown) {
  const email = normalizedText(value).toLowerCase()
  if (!email) return ''
  return email
}

function getColumnText(item: MondayItem, columnId: string) {
  const column = (item.column_values ?? []).find((entry) => String(entry.id) === columnId)
  if (!column) return ''

  const display = normalizedText(column.display_value)
  if (display) return display

  const text = normalizedText(column.text)
  if (text) return text

  return ''
}

function getColumnRawValue(item: MondayItem, columnId: string) {
  const column = (item.column_values ?? []).find((entry) => String(entry.id) === columnId)
  return column?.value ?? null
}

function assertBoardHasColumns(board: MondayBoard, boardLabel: string, requiredColumnIds: string[]) {
  const existing = new Set((board.columns ?? []).map((column) => String(column.id)))
  const missing = requiredColumnIds.filter((columnId) => !existing.has(columnId))

  if (missing.length > 0) {
    throw new Error(`MAPPING_CONFIG_MISSING: ${boardLabel} is missing required columns: ${missing.join(', ')}`)
  }
}

export function normalizeUsersFromAuthBoard(
  board: MondayBoard,
  mapping: MondayMappingInventory,
): {
  users: RuntimeUserSnapshotRow[]
  diagnostics: UsersNormalizationDiagnostics
} {
  assertBoardHasColumns(board, 'auth board', [mapping.columns.auth.email, mapping.columns.auth.role, mapping.columns.auth.approval])

  const users: RuntimeUserSnapshotRow[] = []
  const dedupe = new Map<string, RuntimeUserSnapshotRow>()

  let missingEmail = 0
  let duplicateEmail = 0

  for (const item of board.items_page?.items ?? []) {
    const email = normalizedEmail(getColumnText(item, mapping.columns.auth.email))
    if (!email) {
      missingEmail += 1
      continue
    }

    const row: RuntimeUserSnapshotRow = {
      email,
      displayName: normalizedText(item.name) || email,
      role: normalizedText(getColumnText(item, mapping.columns.auth.role)) || null,
      approval: normalizedText(getColumnText(item, mapping.columns.auth.approval)) || null,
      metadata: {
        mondayBoardId: board.id,
        mondayItemId: item.id,
      },
    }

    if (dedupe.has(email)) {
      duplicateEmail += 1
    }

    dedupe.set(email, row)
    users.push(row)
  }

  const uniqueUsers = Array.from(dedupe.values())

  return {
    users: uniqueUsers,
    diagnostics: {
      boardId: normalizedText(board.id),
      boardName: normalizedText(board.name) || 'auth',
      fetchedItems: (board.items_page?.items ?? []).length,
      normalizedUsers: uniqueUsers.length,
      skipped: {
        missingEmail,
        duplicateEmail,
      },
    },
  }
}

export function normalizeOperationsFromBoard(
  board: MondayBoard,
  mapping: MondayMappingInventory,
): {
  operations: RuntimeOperationSnapshotRow[]
  assignments: RuntimeOperationAssignmentSnapshotRow[]
  diagnostics: OperationsNormalizationDiagnostics
} {
  assertBoardHasColumns(board, 'operations board', [
    mapping.columns.operations.shortOperationId,
    mapping.columns.operations.performerRelation,
    mapping.columns.operations.performerEmailMirror,
    mapping.columns.operations.executionStatusCheck,
    mapping.columns.operations.scheduleRelation,
  ])

  const operations: RuntimeOperationSnapshotRow[] = []
  const assignments: RuntimeOperationAssignmentSnapshotRow[] = []

  let missingOperationId = 0
  let assignmentMissingEmail = 0

  for (const item of board.items_page?.items ?? []) {
    const operationId = normalizedText(item.id)
    if (!operationId) {
      missingOperationId += 1
      continue
    }

    const assignedEmail = normalizedEmail(getColumnText(item, mapping.columns.operations.performerEmailMirror)) || null
    const performerDisplay = normalizedText(getColumnText(item, mapping.columns.operations.performerRelation))

    operations.push({
      id: operationId,
      shortOperationId: normalizedText(getColumnText(item, mapping.columns.operations.shortOperationId)) || null,
      assignedTechnicianEmail: assignedEmail,
      executionStatus: normalizedText(getColumnText(item, mapping.columns.operations.executionStatusCheck)) || null,
      metadata: {
        mondayBoardId: board.id,
        mondayItemId: operationId,
        performerDisplay,
        performerRelationValue: getColumnRawValue(item, mapping.columns.operations.performerRelation),
        scheduleRelationValue: getColumnRawValue(item, mapping.columns.operations.scheduleRelation),
      },
    })

    if (assignedEmail) {
      assignments.push({
        operationId,
        userEmail: assignedEmail,
        role: 'performer',
        metadata: {
          mondayBoardId: board.id,
          mondayItemId: operationId,
          performerDisplay,
        },
      })
    } else {
      assignmentMissingEmail += 1
    }
  }

  const operationDedupe = new Map<string, RuntimeOperationSnapshotRow>()
  let duplicateOperation = 0
  for (const row of operations) {
    if (operationDedupe.has(row.id)) duplicateOperation += 1
    operationDedupe.set(row.id, row)
  }

  const assignmentDedupe = new Map<string, RuntimeOperationAssignmentSnapshotRow>()
  let duplicateAssignment = 0
  for (const row of assignments) {
    const key = `${row.operationId}::${row.userEmail}::${row.role}`
    if (assignmentDedupe.has(key)) duplicateAssignment += 1
    assignmentDedupe.set(key, row)
  }

  const normalizedOperations = Array.from(operationDedupe.values())
  const normalizedAssignments = Array.from(assignmentDedupe.values())

  return {
    operations: normalizedOperations,
    assignments: normalizedAssignments,
    diagnostics: {
      boardId: normalizedText(board.id),
      boardName: normalizedText(board.name) || 'operations',
      fetchedItems: (board.items_page?.items ?? []).length,
      normalizedOperations: normalizedOperations.length,
      normalizedAssignments: normalizedAssignments.length,
      skipped: {
        missingOperationId,
        assignmentMissingEmail,
        duplicateOperation,
        duplicateAssignment,
      },
    },
  }
}
