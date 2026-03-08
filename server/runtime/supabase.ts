import { createClient } from '@supabase/supabase-js'

export interface SupabaseRuntimeConfig {
  url: string
  anonKey: string
  serviceRoleKey: string
  schema: string
}

export interface SupabaseRuntimeHealth {
  ready: boolean
  schema: string
  missingConfig: string[]
  missingTables: string[]
  details: string[]
}

const REQUIRED_TABLES = [
  'users',
  'clients',
  'facilities',
  'operations',
  'assignments',
  'schedule_entries',
  'reports',
  'exceptions',
  'sync_runs',
  'raw_events',
  'agent_actions',
] as const

export function readSupabaseRuntimeConfig(source: Record<string, string | undefined>): SupabaseRuntimeConfig {
  return {
    url: String(source.SUPABASE_URL ?? '').trim(),
    anonKey: String(source.SUPABASE_ANON_KEY ?? '').trim(),
    serviceRoleKey: String(source.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
    schema: String(source.SUPABASE_DB_SCHEMA ?? 'public').trim() || 'public',
  }
}

export function getSupabaseConfigMissing(config: SupabaseRuntimeConfig): string[] {
  const missing: string[] = []
  if (!config.url) missing.push('SUPABASE_URL')
  if (!config.anonKey) missing.push('SUPABASE_ANON_KEY')
  if (!config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return missing
}

export function createSupabaseAdminClient(config: SupabaseRuntimeConfig) {
  const missing = getSupabaseConfigMissing(config)
  if (missing.length > 0) {
    throw new Error(`SUPABASE_CONFIG_MISSING: ${missing.join(', ')}`)
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: config.schema,
    },
    global: {
      headers: {
        'X-Client-Info': 'upflow-platform-runtime/1.0',
      },
    },
  })
}

async function tableExists(client: any, table: string): Promise<boolean> {
  const result = await client.from(table).select('id', { head: true, count: 'exact' }).limit(1)

  if (!result.error) return true

  const msg = (result.error.message || '').toLowerCase()
  const details = (result.error.details || '').toLowerCase()
  if (msg.includes('does not exist') || details.includes('does not exist') || msg.includes('relation')) {
    return false
  }

  throw new Error(`SUPABASE_HEALTHCHECK_FAILED: ${table}: ${result.error.message}`)
}

export async function checkSupabaseRuntimeHealth(config: SupabaseRuntimeConfig): Promise<SupabaseRuntimeHealth> {
  const missingConfig = getSupabaseConfigMissing(config)
  if (missingConfig.length > 0) {
    return {
      ready: false,
      schema: config.schema,
      missingConfig,
      missingTables: [...REQUIRED_TABLES],
      details: ['Missing critical Supabase runtime configuration.'],
    }
  }

  const client = createSupabaseAdminClient(config)
  const missingTables: string[] = []

  for (const table of REQUIRED_TABLES) {
    const exists = await tableExists(client, table)
    if (!exists) missingTables.push(table)
  }

  return {
    ready: missingTables.length === 0,
    schema: config.schema,
    missingConfig: [],
    missingTables,
    details: missingTables.length === 0 ? ['Supabase runtime is configured and required tables exist.'] : ['Apply initial schema SQL to create missing tables.'],
  }
}

