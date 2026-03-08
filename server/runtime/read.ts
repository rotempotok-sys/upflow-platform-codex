import { sanitizeRuntimeErrorMessage } from './security'

interface RuntimeClientRow {
  id: string
  name: string
  facility_type: string | null
  facility_status: string | null
  contract_type: string | null
  open_tickets: number | null
  city: string | null
  group_name: string | null
}

interface RuntimeFacilityRow extends RuntimeClientRow {
  raw_columns: unknown
}

interface RuntimeFacilityColumnValue {
  id: string
  title: string
  type: string
  text: string
  value: string | null
}

interface RuntimeUserRow {
  email: string
  display_name: string | null
  role: string | null
  approval: string | null
}

interface RuntimeOperationRow {
  id: string
  short_operation_id: string | null
  assigned_technician_email: string | null
  execution_status: string | null
}

interface RuntimeAssignmentRow {
  operation_id: string
  user_email: string | null
  role: string | null
}

function normalizeColumns(raw: unknown): RuntimeFacilityColumnValue[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const obj = entry as Record<string, unknown>
      return {
        id: String(obj.id ?? '').trim(),
        title: String(obj.title ?? '').trim(),
        type: String(obj.type ?? '').trim(),
        text: String(obj.text ?? '').trim(),
        value: obj.value == null ? null : String(obj.value),
      }
    })
    .filter((entry): entry is RuntimeFacilityColumnValue => Boolean(entry && entry.id))
}

function mapClient(row: RuntimeClientRow) {
  return {
    id: String(row.id),
    name: String(row.name ?? '').trim(),
    facilityType: String(row.facility_type ?? '').trim() || 'לא הוגדר',
    facilityStatus: String(row.facility_status ?? '').trim() || 'לא הוגדר',
    contractType: String(row.contract_type ?? '').trim() || 'לא הוגדר',
    openTickets: Number.isFinite(Number(row.open_tickets ?? 0)) ? Number(row.open_tickets ?? 0) : 0,
    city: String(row.city ?? '').trim(),
    group: String(row.group_name ?? '').trim() || 'ללא קבוצה',
  }
}

function mapOperation(row: RuntimeOperationRow) {
  return {
    id: String(row.id ?? '').trim(),
    shortOperationId: String(row.short_operation_id ?? '').trim() || null,
    assignedTechnicianEmail:
      String(row.assigned_technician_email ?? '')
        .trim()
        .toLowerCase() || null,
    executionStatus: String(row.execution_status ?? '').trim() || null,
  }
}

function mapAssignment(row: RuntimeAssignmentRow) {
  return {
    operationId: String(row.operation_id ?? '').trim(),
    userEmail:
      String(row.user_email ?? '')
        .trim()
        .toLowerCase() || null,
    role: String(row.role ?? '').trim() || null,
  }
}

function mapUser(row: RuntimeUserRow) {
  const email = String(row.email ?? '')
    .trim()
    .toLowerCase()

  return {
    email,
    displayName: String(row.display_name ?? '').trim() || email,
    role: String(row.role ?? '').trim() || null,
    approval: String(row.approval ?? '').trim() || null,
  }
}

export async function readRuntimeClientsAndFacilities(client: any, knownSecrets: string[] = []) {
  const clientsResult = await client
    .from('clients')
    .select('id,name,facility_type,facility_status,contract_type,open_tickets,city,group_name')
    .order('name', { ascending: true })

  if (clientsResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(clientsResult.error.message, knownSecrets)}`)
  }

  const facilitiesResult = await client
    .from('facilities')
    .select('id,name,facility_type,facility_status,contract_type,open_tickets,city,group_name,raw_columns')
    .order('name', { ascending: true })

  if (facilitiesResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(facilitiesResult.error.message, knownSecrets)}`)
  }

  const operationsResult = await client
    .from('operations')
    .select('id,short_operation_id,assigned_technician_email,execution_status')
    .order('id', { ascending: true })

  if (operationsResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(operationsResult.error.message, knownSecrets)}`)
  }

  const assignmentsResult = await client
    .from('assignments')
    .select('operation_id,user_email,role')
    .order('operation_id', { ascending: true })

  if (assignmentsResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(assignmentsResult.error.message, knownSecrets)}`)
  }

  const usersResult = await client.from('users').select('email,display_name,role,approval').order('email', { ascending: true })

  if (usersResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(usersResult.error.message, knownSecrets)}`)
  }

  const syncResult = await client
    .from('sync_runs')
    .select('finished_at')
    .eq('source', 'monday_snapshot')
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(1)

  if (syncResult.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(syncResult.error.message, knownSecrets)}`)
  }

  const clients = ((clientsResult.data ?? []) as RuntimeClientRow[]).map(mapClient)
  const facilities = ((facilitiesResult.data ?? []) as RuntimeFacilityRow[]).map((row) => ({
    ...mapClient(row),
    columns: normalizeColumns(row.raw_columns),
  }))

  const operations = ((operationsResult.data ?? []) as RuntimeOperationRow[]).map(mapOperation).filter((row) => row.id)
  const assignments = ((assignmentsResult.data ?? []) as RuntimeAssignmentRow[]).map(mapAssignment).filter((row) => row.operationId)
  const users = ((usersResult.data ?? []) as RuntimeUserRow[]).map(mapUser).filter((row) => row.email)

  const latestFinishedAt = syncResult.data?.[0]?.finished_at

  return {
    clients,
    facilities,
    operations,
    assignments,
    users,
    fetchedAt: typeof latestFinishedAt === 'string' && latestFinishedAt.trim() ? latestFinishedAt : new Date().toISOString(),
  }
}

export async function readLatestRuntimeSyncRun(client: any, knownSecrets: string[] = []) {
  const latest = await client
    .from('sync_runs')
    .select('id,source,status,started_at,finished_at,rows_upserted,metadata')
    .eq('source', 'monday_snapshot')
    .order('started_at', { ascending: false })
    .limit(1)

  if (latest.error) {
    throw new Error(`SUPABASE_RUNTIME_READ_FAILED: ${sanitizeRuntimeErrorMessage(latest.error.message, knownSecrets)}`)
  }

  const row = latest.data?.[0] ?? null
  return {
    latest: row,
    checkedAt: new Date().toISOString(),
  }
}
