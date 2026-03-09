import { sanitizeRuntimeErrorMessage } from './security'
import type {
  RuntimeOperationAssignmentSnapshotRow,
  RuntimeOperationSnapshotRow,
  RuntimeReportSnapshotRow,
  RuntimeScheduleEntrySnapshotRow,
  RuntimeUserSnapshotRow,
} from './mondayRuntimeNormalize'
import type { RuntimeExceptionSnapshotRow } from './exceptions'

interface RuntimeClient {
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

interface RuntimeFacility extends RuntimeClient {
  columns: Array<{
    id: string
    title: string
    type: string
    text: string
    value: string | null
  }>
}

export interface RuntimeSyncDiagnosticsPayload {
  runtimeSyncSignature?: string
  fetchedBoards?: Record<string, { id: string; name: string; items: number }>
  normalized?: {
    clients: number
    facilities: number
    users: number
    operations: number
    assignments: number
    scheduleEntries: number
    reports: number
    exceptions: number
  }
  skipped?: {
    users?: Record<string, number>
    operations?: Record<string, number>
    schedule?: Record<string, number>
    reports?: Record<string, number>
  }
}

export interface RuntimeSnapshotPayload {
  fetchedAt: string
  clients: RuntimeClient[]
  facilities: RuntimeFacility[]
  users: RuntimeUserSnapshotRow[]
  operations: RuntimeOperationSnapshotRow[]
  assignments: RuntimeOperationAssignmentSnapshotRow[]
  scheduleEntries: RuntimeScheduleEntrySnapshotRow[]
  reports: RuntimeReportSnapshotRow[]
  exceptions: RuntimeExceptionSnapshotRow[]
  source: 'monday_snapshot'
  syncDiagnostics?: RuntimeSyncDiagnosticsPayload
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return sanitizeRuntimeErrorMessage(error.message || 'unknown error')
  if (typeof error === 'string') return sanitizeRuntimeErrorMessage(error || 'unknown error')

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const parts = [
      typeof record.code === 'string' ? `code=${String(record.code)}` : null,
      typeof record.message === 'string' ? record.message : null,
      typeof record.details === 'string' ? `details=${String(record.details)}` : null,
      typeof record.hint === 'string' ? `hint=${String(record.hint)}` : null,
    ].filter((value): value is string => Boolean(value))

    if (parts.length > 0) return sanitizeRuntimeErrorMessage(parts.join(' | '))
    return sanitizeRuntimeErrorMessage(JSON.stringify(record))
  }

  return sanitizeRuntimeErrorMessage('unknown error')
}

async function hasClientsFacilitiesRelationIdsColumn(client: any): Promise<boolean> {
  const probe = await client.from('clients').select('facilities_relation_ids', { head: true, count: 'exact' }).limit(1)
  if (!probe.error) return true

  const message = String(probe.error.message ?? '').toLowerCase()
  if (message.includes('column') && message.includes('does not exist')) return false

  throw new Error(`SUPABASE_CLIENTS_COLUMN_CHECK_FAILED: ${normalizeErrorMessage(probe.error)}`)
}


export async function persistRuntimeSnapshotToSupabase(client: any, payload: RuntimeSnapshotPayload) {
  const startedAt = new Date().toISOString()

  const syncRunInsert = await client
    .from('sync_runs')
    .insert({
      source: payload.source,
      status: 'running',
      started_at: startedAt,
      metadata: {
        fetchedAt: payload.fetchedAt,
        diagnostics: payload.syncDiagnostics ?? null,
      },
    })
    .select('id')
    .single()

  if (syncRunInsert.error || !syncRunInsert.data) {
    throw new Error(`SUPABASE_SYNC_RUN_CREATE_FAILED: ${normalizeErrorMessage(syncRunInsert.error?.message ?? 'unknown error')}`)
  }

  const syncRunId = syncRunInsert.data.id

  try {
    const clientsHasFacilitiesRelationIdsColumn = await hasClientsFacilitiesRelationIdsColumn(client)

    const clientRows = payload.clients.map((entry) => ({
      id: entry.id,
      name: entry.name,
      facility_type: entry.facilityType,
      facility_status: entry.facilityStatus,
      contract_type: entry.contractType,
      open_tickets: entry.openTickets,
      city: entry.city,
      group_name: entry.group,
      ...(clientsHasFacilitiesRelationIdsColumn
        ? { facilities_relation_ids: Array.isArray(entry.facilitiesRelationIds) ? entry.facilitiesRelationIds : [] }
        : {}),
      source: 'monday',
      updated_at: new Date().toISOString(),
    }))

    const facilityRows = payload.facilities.map((entry) => ({
      id: entry.id,
      client_id: null,
      name: entry.name,
      facility_type: entry.facilityType,
      facility_status: entry.facilityStatus,
      contract_type: entry.contractType,
      open_tickets: entry.openTickets,
      city: entry.city,
      group_name: entry.group,
      source: 'monday',
      raw_columns: entry.columns,
      updated_at: new Date().toISOString(),
    }))

    const userRows = payload.users.map((entry) => ({
      email: entry.email,
      display_name: entry.displayName,
      role: entry.role,
      approval: entry.approval,
      metadata: entry.metadata,
      updated_at: new Date().toISOString(),
    }))

    const operationRows = payload.operations.map((entry) => ({
      id: entry.id,
      short_operation_id: entry.shortOperationId,
      client_id: entry.clientItemId,
      facility_id: entry.facilityItemId,
      assigned_technician_email: entry.assignedTechnicianEmail,
      business_status: entry.operationStatus ?? entry.businessStatus,
      operation_group_status: entry.operationGroupStatus,
      execution_status: entry.executionStatus,
      source: 'monday',
      metadata: {
        ...entry.metadata,
        businessStatus: entry.businessStatus,
        operationStatus: entry.operationStatus,
        operationGroupStatus: entry.operationGroupStatus,
        isOpen: entry.isOpen,
      },
      updated_at: new Date().toISOString(),
    }))

    const scheduleEntryRows = payload.scheduleEntries.map((entry) => ({
      id: entry.id,
      operation_id_ref: entry.operationIdRef,
      operation_id: entry.operationId,
      technician_email: entry.canonicalTechnicianEmail,
      schedule_control_status: entry.controlStatus,
      calendar_sync_status: entry.calendarSyncStatus,
      calendar_event_id: entry.calendarEventRef,
      report_item_id_ref: null,
      source: 'monday',
      metadata: {
        ...entry.metadata,
        taskType: entry.taskType,
        legacyTechnicianDropdownValue: entry.legacyTechnicianDropdownValue,
        plannedDate: entry.plannedDate,
        plannedDateTime: entry.plannedDateTime,
        plannedDateTimeSource: entry.plannedDateTimeSource,
        scheduleStatus: entry.scheduleStatus,
        technicianLinkageState: entry.technicianLinkageState,
        technicianLinkageSource: entry.technicianLinkageSource,
      },
      updated_at: new Date().toISOString(),
    }))

    const reportRows = payload.reports.map((entry) => ({
      id: entry.id,
      operation_id_ref: entry.operationIdRef,
      operation_id: entry.operationId,
      schedule_entry_id_ref: entry.scheduleEntryIdRef,
      schedule_entry_id: entry.scheduleEntryId,
      technician_email: entry.technicianEmail,
      flow_status: entry.flowStatus,
      qa_status: entry.qaStatus,
      executed_at: entry.executedAt,
      source: 'monday',
      metadata: entry.metadata,
      updated_at: new Date().toISOString(),
    }))

    const assignmentRows = payload.assignments.map((entry) => ({
      operation_id: entry.operationId,
      user_email: entry.userEmail,
      role: entry.role,
      valid_from: null,
      valid_to: null,
      source: 'monday',
      metadata: entry.metadata,
      updated_at: new Date().toISOString(),
    }))

    const exceptionRows = payload.exceptions.map((entry) => ({
      code: entry.code,
      severity: entry.severity,
      operation_id: entry.operationId,
      schedule_entry_id: entry.scheduleEntryId,
      report_id: entry.reportId,
      technician_email: entry.technicianEmail,
      message: entry.message,
      source: 'runtime',
      metadata: entry.metadata,
      created_at: new Date().toISOString(),
    }))

    if (clientRows.length > 0) {
      const upsertClients = await client.from('clients').upsert(clientRows, { onConflict: 'id' })
      if (upsertClients.error) throw new Error(`SUPABASE_CLIENT_UPSERT_FAILED: ${normalizeErrorMessage(upsertClients.error)}`)
    }

    if (facilityRows.length > 0) {
      const upsertFacilities = await client.from('facilities').upsert(facilityRows, { onConflict: 'id' })
      if (upsertFacilities.error) throw new Error(`SUPABASE_FACILITY_UPSERT_FAILED: ${normalizeErrorMessage(upsertFacilities.error)}`)
    }

    if (userRows.length > 0) {
      const upsertUsers = await client.from('users').upsert(userRows, { onConflict: 'email' })
      if (upsertUsers.error) throw new Error(`SUPABASE_USERS_UPSERT_FAILED: ${normalizeErrorMessage(upsertUsers.error)}`)
    }

    if (operationRows.length > 0) {
      const upsertOperations = await client.from('operations').upsert(operationRows, { onConflict: 'id' })
      if (upsertOperations.error) throw new Error(`SUPABASE_OPERATIONS_UPSERT_FAILED: ${normalizeErrorMessage(upsertOperations.error)}`)
    }

    if (scheduleEntryRows.length > 0) {
      const upsertScheduleEntries = await client.from('schedule_entries').upsert(scheduleEntryRows, { onConflict: 'id' })
      if (upsertScheduleEntries.error) {
        throw new Error(`SUPABASE_SCHEDULE_ENTRIES_UPSERT_FAILED: ${normalizeErrorMessage(upsertScheduleEntries.error)}`)
      }
    }

    if (reportRows.length > 0) {
      const upsertReports = await client.from('reports').upsert(reportRows, { onConflict: 'id' })
      if (upsertReports.error) {
        throw new Error(`SUPABASE_REPORTS_UPSERT_FAILED: ${normalizeErrorMessage(upsertReports.error)}`)
      }
    }

    if (assignmentRows.length > 0) {
      const upsertAssignments = await client
        .from('assignments')
        .upsert(assignmentRows, { onConflict: 'operation_id,user_email,role,source' })
      if (upsertAssignments.error) {
        throw new Error(`SUPABASE_ASSIGNMENTS_UPSERT_FAILED: ${normalizeErrorMessage(upsertAssignments.error)}`)
      }
    }

    const clearRuntimeExceptions = await client.from('exceptions').delete().eq('source', 'runtime')
    if (clearRuntimeExceptions.error) {
      throw new Error(`SUPABASE_EXCEPTIONS_CLEAR_FAILED: ${normalizeErrorMessage(clearRuntimeExceptions.error)}`)
    }

    if (exceptionRows.length > 0) {
      const insertExceptions = await client.from('exceptions').insert(exceptionRows)
      if (insertExceptions.error) {
        throw new Error(`SUPABASE_EXCEPTIONS_INSERT_FAILED: ${normalizeErrorMessage(insertExceptions.error)}`)
      }
    }

    const finishedAt = new Date().toISOString()
    const persisted = {
      clients: clientRows.length,
      facilities: facilityRows.length,
      users: userRows.length,
      operations: operationRows.length,
      assignments: assignmentRows.length,
      scheduleEntries: scheduleEntryRows.length,
      reports: reportRows.length,
      exceptions: exceptionRows.length,
    }

    const totalRows =
      persisted.clients +
      persisted.facilities +
      persisted.users +
      persisted.operations +
      persisted.assignments +
      persisted.scheduleEntries +
      persisted.reports +
      persisted.exceptions

    await client
      .from('sync_runs')
      .update({
        status: 'success',
        finished_at: finishedAt,
        rows_upserted: totalRows,
        metadata: {
          fetchedAt: payload.fetchedAt,
          ...persisted,
          diagnostics: {
            ...(payload.syncDiagnostics ?? {}),
            persisted,
          },
        },
      })
      .eq('id', syncRunId)

    return {
      syncRunId,
      rowsUpserted: totalRows,
      clientsUpserted: persisted.clients,
      facilitiesUpserted: persisted.facilities,
      usersUpserted: persisted.users,
      operationsUpserted: persisted.operations,
      assignmentsUpserted: persisted.assignments,
      scheduleEntriesUpserted: persisted.scheduleEntries,
      reportsUpserted: persisted.reports,
      exceptionsUpserted: persisted.exceptions,
      finishedAt,
    }
  } catch (error) {
    const finishedAt = new Date().toISOString()
    const safeMessage = normalizeErrorMessage(error)

    await client
      .from('sync_runs')
      .update({
        status: 'failed',
        finished_at: finishedAt,
        metadata: {
          fetchedAt: payload.fetchedAt,
          diagnostics: payload.syncDiagnostics ?? null,
          error: safeMessage,
        },
      })
      .eq('id', syncRunId)

    throw new Error(safeMessage)
  }
}


