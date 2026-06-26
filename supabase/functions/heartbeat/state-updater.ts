/**
 * Heartbeat state updater module.
 * Handles all DB writes: agent status update, system metrics, processes, token touch.
 * All operations are idempotent and safe for retries.
 *
 * COST OPTIMIZATION: Metrics and processes are throttled to 1 insert per 5 minutes
 * per agent to reduce IOPS (~80% reduction vs every heartbeat).
 *
 * D2 (Bloco D — type safety): typed end-to-end. No `any` in security-sensitive
 * paths. `stripMetadataHash` enforces the HOTFIX-AUTH-01 invariant at the type
 * level — `metadata_hash` cannot reach the agents UPDATE payload, ever.
 */

import { logger } from '../_shared/logger.ts'
import type { SupabaseClient, PostgrestError } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { Database, Json } from '../_shared/database.types.ts'
import type { AgentContext, AgentUpdate, OSInfo, ProcessesPayload, ProcessEntry } from './types.ts'

// Re-export types used by callers
export type { AgentContext, AgentUpdate, OSInfo }

/** Throttle interval for metrics/process/token-touch inserts (5 minutes) */
export const TELEMETRY_THROTTLE_MS = 5 * 60 * 1000

/**
 * Minimum interval between agent table updates if no metadata changed (1 minute)
 * Prevents redundant DB writes for frequent heartbeats.
 */
const HEARTBEAT_WRITE_THROTTLE_MS = 60 * 1000

/** Subset of agents columns we read for dirty-checking and MVCC fallback. */
type AgentSnapshot = Pick<
  Database['public']['Tables']['agents']['Row'],
  'version' | 'last_heartbeat'
>

/**
 * Extended update payload accepted by updateAgentStatus.
 * - `last_telemetry_at` / `update_timestamp` are accepted at the boundary but
 *   never written to `agents` (they only drive idempotency math).
 * - `_current_agent` is an in-memory hint to avoid re-fetching the snapshot.
 * - `metadata_hash` is tolerated at input for forward-compat but is stripped
 *   before any write via `stripMetadataHash` (HOTFIX-AUTH-01: column does not
 *   exist on public.agents).
 */
export interface HeartbeatUpdateData extends AgentUpdate {
  last_telemetry_at?: string
  update_timestamp?: string
  _current_agent?: AgentSnapshot | null
}

/**
 * Strip `metadata_hash` from any heartbeat-bound payload.
 *
 * The column does not exist on public.agents (HOTFIX-AUTH-01). Agents may keep
 * sending it for forward-compat; this helper guarantees it never reaches the
 * UPDATE/RPC payload. Typed so a regression that adds `metadata_hash` to
 * `AgentUpdate` would still be neutralized at write-time.
 */
export function stripMetadataHash<T extends Record<string, unknown>>(
  data: T,
): Omit<T, 'metadata_hash'> {
  if ('metadata_hash' in data) {
    // Use rest-destructure so we never mutate the caller's object.
    const { metadata_hash: _discarded, ...safe } = data as T & { metadata_hash?: unknown }
    return safe as Omit<T, 'metadata_hash'>
  }
  return data as Omit<T, 'metadata_hash'>
}

/** Internal helpers for control-key handling (kept in one place). */
const CONTROL_KEYS = new Set<string>([
  'last_telemetry_at',
  'update_timestamp',
  'last_heartbeat',
  '_current_agent',
])

/**
 * Per-key dirty-check: returns true if `incoming` would actually change the
 * stored value. Handles object-vs-object comparison via JSON.stringify.
 */
function isMetadataChanged(
  updateData: HeartbeatUpdateData,
  currentAgent: AgentSnapshot | Record<string, unknown> | null | undefined,
): boolean {
  const current = (currentAgent ?? {}) as Record<string, unknown>
  return Object.entries(updateData)
    .filter(([k]) => !CONTROL_KEYS.has(k))
    .some(([k, v]) => {
      const currentVal = current[k]
      if (v === currentVal) return false
      if (typeof v === 'object' && v !== null && typeof currentVal === 'object' && currentVal !== null) {
        return JSON.stringify(v) !== JSON.stringify(currentVal)
      }
      return v !== currentVal
    })
}

/**
 * Update agent heartbeat status in DB using an atomic RPC call.
 */
export async function updateAgentStatus(
  supabase: SupabaseClient<Database>,
  agentId: string,
  agentName: string,
  updateData: HeartbeatUpdateData,
  currentHeartbeat?: string | null,
): Promise<void> {
  const now = new Date()

  // 1. Pre-check for redundancy & idempotency
  const incomingTs = updateData.last_telemetry_at || updateData.update_timestamp
  const lastUpdate = currentHeartbeat ? new Date(currentHeartbeat).getTime() : 0
  const incomingTime = incomingTs ? new Date(incomingTs).getTime() : now.getTime()

  // STRICT IDEMPOTENCY: If incoming timestamp is older than current heartbeat,
  // we skip metadata updates to prevent overwriting with stale state.
  const isStale = incomingTime < lastUpdate

  // FETCH current state from DB for dirty-checking if not provided in context.
  // HOTFIX-AUTH-01: metadata_hash column does not exist on public.agents.
  // Strip it from updateData and fall back to per-field diff for change detection.
  const sanitizedUpdate = stripMetadataHash(
    updateData as HeartbeatUpdateData & Record<string, unknown>,
  ) as HeartbeatUpdateData

  let currentAgent: AgentSnapshot | null | undefined = sanitizedUpdate._current_agent
  if (!currentAgent) {
    const { data } = await supabase
      .from('agents')
      .select('version, last_heartbeat')
      .eq('id', agentId)
      .maybeSingle()
    currentAgent = (data as AgentSnapshot | null) ?? null
  }

  const metadataChanged = !isStale && isMetadataChanged(sanitizedUpdate, currentAgent)

  if (!metadataChanged && !isStale && (now.getTime() - lastUpdate) < HEARTBEAT_WRITE_THROTTLE_MS) {
    logger.debug('Skipping redundant agent heartbeat (throttled)', { agentName })
    return
  }

  // Build the RPC-bound payload: drop control-only keys that don't belong in
  // the JSON forwarded to the SQL function.
  const rpcPayload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(sanitizedUpdate)) {
    if (!CONTROL_KEYS.has(k)) rpcPayload[k] = v
  }

  // 2. Delegate to Atomic RPC (Locking + Transactional Update)
  // This prevents Race Conditions between concurrent heartbeat instances.
  // The RPC is not present in generated types — cast to the loose signature
  // accepted by the Supabase JS client. Payload is sanitized above.
  const rpcClient = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: PostgrestError | null }>
  const { error } = await rpcClient('update_agent_heartbeat_atomic', {
    p_agent_id: agentId,
    p_update_data: rpcPayload,
  })

  if (error) {
    // P3 FIX: Handle case where RPC doesn't exist or is inaccessible
    if (error.code === 'P0001' || error.message?.includes('database error')) {
      logger.error('CRITICAL: Failed to update agent heartbeat atomically', {
        error, errorMessage: error.message, agentId, agentName,
      })
      throw new Error(`Heartbeat persistence failed: ${error.message}`)
    }

    // Fallback to standard update with Optimistic Locking (MVCC) if atomic RPC is missing
    logger.warn('Atomic heartbeat RPC failed, falling back to MVCC update', { agentName, errorCode: error.code })

    // Use the captured current state or fetch if missing
    if (!currentAgent) {
      const { data } = await supabase
        .from('agents')
        .select('version, last_heartbeat')
        .eq('id', agentId)
        .maybeSingle()
      currentAgent = (data as AgentSnapshot | null) ?? null
    }

    const currentVersion = currentAgent?.version ?? sanitizedUpdate.version ?? 1
    const currentHb = currentAgent?.last_heartbeat ? new Date(currentAgent.last_heartbeat).getTime() : 0

    // Idempotency check before update
    if (incomingTime < currentHb) {
      logger.debug('Skipping stale heartbeat update (MVCC fallback)', { agentName })
      return
    }

    // Build the UPDATE payload: drop control keys, then re-apply enforced
    // values. metadata_hash is already stripped by stripMetadataHash above.
    const updatePayload: Record<string, unknown> = { ...rpcPayload }
    updatePayload.status = 'active'
    updatePayload.last_heartbeat = now.toISOString()
    updatePayload.version = currentVersion + 1

    const { error: updateError } = await supabase
      .from('agents')
      .update(updatePayload as Database['public']['Tables']['agents']['Update'])
      .eq('id', agentId)
      .eq('version', currentVersion) // The "Optimistic Lock"

    if (updateError) {
      if (updateError.code === 'P0001') {
        logger.warn('MVCC collision detected (concurrent update), retry handled by agent', { agentName })
      } else {
        throw updateError
      }
    }
  }

  logger.info('Agent heartbeat updated atomically', { agentName, metadataChanged })
}

/**
 * Execute all parallel side-effect operations (metrics, processes, token touch).
 * Fire-and-forget semantics — failures are logged but don't block heartbeat response.
 */
export async function executeParallelOps(
  supabase: SupabaseClient<Database>,
  agent: AgentContext,
  osInfo: OSInfo,
  shouldInsertTelemetry: boolean,
): Promise<void> {
  const parallelOps: Promise<void>[] = []

  // 1. Telemetry processing (metrics + processes)
  const hasTelemetry = (osInfo.system_metrics && typeof osInfo.system_metrics === 'object' && !osInfo.system_metrics.error)
    || (osInfo.processes && typeof osInfo.processes === 'object' && !osInfo.processes.error)

  if (hasTelemetry && shouldInsertTelemetry) {
    // 1a. Token last_used_at update (throttled to match telemetry)
    // PERF-FIX: Only touch token timestamp when we are doing heavy telemetry work
    const touchToken = async (): Promise<void> => {
      try {
        const { error } = await supabase
          .from('agent_tokens')
          .update({ last_used_at: new Date().toISOString() })
          .eq('agent_id', agent.id)
          .eq('is_active', true)
        if (error) logger.warn('Token touch failed', { error: error.message })
      } catch (e: unknown) {
        logger.warn('Token touch promise rejected', {
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
    parallelOps.push(touchToken())

    // 1b. System metrics insert
    const systemMetrics = osInfo.system_metrics
    if (systemMetrics && typeof systemMetrics === 'object' && !systemMetrics.error) {
      parallelOps.push(insertSystemMetrics(supabase, agent, systemMetrics))
    }

    // 1c. Process data insert
    if (osInfo.processes && typeof osInfo.processes === 'object' && !osInfo.processes.error) {
      parallelOps.push(insertProcessData(supabase, agent, osInfo.processes, osInfo.process_anomalies))
    }
  }

  await Promise.all(parallelOps)
}

async function insertSystemMetrics(
  supabase: SupabaseClient<Database>,
  agent: AgentContext,
  metrics: NonNullable<OSInfo['system_metrics']>,
): Promise<void> {
  const metricsRow = {
    agent_id: agent.id,
    tenant_id: agent.tenant_id,
    cpu_usage_percent: metrics.cpu_percent ?? null,
    cpu_name: metrics.cpu_name ?? null,
    cpu_cores: metrics.cpu_cores ?? null,
    memory_total_gb: metrics.memory_total_gb ?? null,
    memory_used_gb: metrics.memory_used_gb ?? null,
    memory_free_gb: metrics.memory_free_gb != null
      ? metrics.memory_free_gb
      : (metrics.memory_total_gb != null && metrics.memory_used_gb != null
          ? Math.round((metrics.memory_total_gb - metrics.memory_used_gb) * 100) / 100
          : null),
    memory_usage_percent: metrics.memory_used_percent ?? null,
    disk_total_gb: metrics.disk_total_gb ?? null,
    disk_used_gb: metrics.disk_total_gb != null && metrics.disk_free_gb != null
      ? Math.max(0, Math.round((metrics.disk_total_gb - metrics.disk_free_gb) * 100) / 100)
      : null,
    disk_free_gb: metrics.disk_free_gb ?? null,
    disk_usage_percent: metrics.disk_used_percent ?? null,
    uptime_seconds: metrics.uptime_seconds ?? null,
    collected_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('agent_system_metrics_partitioned')
    .insert(metricsRow)

  if (error) {
    logger.error('METRICS INSERT FAILED', {
      agentId: agent.id, agentName: agent.agent_name, error: error.message,
    })
  }
}

/** Row shape inserted into agent_processes (subset of fields we set). */
interface ProcessSample {
  pid: number
  name: string
  cpu_percent: number
  memory_mb: number
  user: string
  command_line?: string
}

/**
 * D11-C: Convert ProcessSample[] / unknown[] into Json[] explicitly so the
 * generated agent_processes Insert type is satisfied without a wide cast.
 * Runtime payload is preserved byte-for-byte (same keys, same values).
 */
function processSamplesToJson(samples: ProcessSample[]): Json[] {
  return samples.map((s): Json => ({
    pid: s.pid,
    name: s.name,
    cpu_percent: s.cpu_percent,
    memory_mb: s.memory_mb,
    user: s.user,
    command_line: s.command_line ?? null,
  }))
}

function anomaliesToJson(items: unknown[]): Json[] {
  // Anomalies arrive as opaque payloads from the agent. Round-trip through
  // JSON.stringify/parse to guarantee Json compatibility without altering
  // structure or values.
  return items.map((item) => JSON.parse(JSON.stringify(item ?? null)) as Json)
}

async function insertProcessData(
  supabase: SupabaseClient<Database>,
  agent: AgentContext,
  processesPayload: ProcessesPayload,
  processAnomalies: unknown[] | undefined,
): Promise<void> {
  const allProcs: ProcessSample[] = []
  const seenPids = new Set<number>()

  const candidates: ProcessEntry[] = [
    ...(processesPayload.top_by_cpu ?? []),
    ...(processesPayload.top_by_memory ?? []),
  ]

  for (const p of candidates) {
    if (typeof p.pid === 'number' && !seenPids.has(p.pid)) {
      seenPids.add(p.pid)
      allProcs.push({
        pid: p.pid,
        name: p.name ?? '',
        cpu_percent: p.cpu_percent ?? p.cpu_seconds ?? 0,
        memory_mb: p.memory_mb ?? 0,
        user: p.user ?? '',
        command_line: p.command_line,
      })
    }
  }

  const anomalies: unknown[] = Array.isArray(processAnomalies) ? processAnomalies : []

  const processRow = {
    agent_id: agent.id,
    tenant_id: agent.tenant_id,
    processes: allProcs,
    services: [],
    total_processes: processesPayload.total_processes || 0, // Avoid using allProcs.length as it only contains TOP processes
    total_services: 0,
    services_running: 0,
    services_stopped: 0,
    new_processes: [],
    suspicious_processes: anomalies,
    collected_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('agent_processes').insert(processRow)

  if (error) {
    logger.error('PROCESS INSERT FAILED', {
      agentId: agent.id, agentName: agent.agent_name, error: error.message,
    })
  }
}
