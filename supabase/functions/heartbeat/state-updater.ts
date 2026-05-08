/**
 * Heartbeat state updater module.
 * Handles all DB writes: agent status update, system metrics, processes, token touch.
 * All operations are idempotent and safe for retries.
 *
 * COST OPTIMIZATION: Metrics and processes are throttled to 1 insert per 5 minutes
 * per agent to reduce IOPS (~80% reduction vs every heartbeat).
 */

import { logger } from '../_shared/logger.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { Database } from '../_shared/database.types.ts'
import type { AgentContext, AgentUpdate, OSInfo } from './types.ts'

// Re-export types used by callers
export type { AgentContext, AgentUpdate, OSInfo }

/** Throttle interval for metrics/process/token-touch inserts (5 minutes) */
export const TELEMETRY_THROTTLE_MS = 5 * 60 * 1000

/**
 * Minimum interval between agent table updates if no metadata changed (1 minute)
 * Prevents redundant DB writes for frequent heartbeats.
 */
const HEARTBEAT_WRITE_THROTTLE_MS = 60 * 1000

/**
 * Update agent heartbeat status in DB using an atomic RPC call.
 */
export async function updateAgentStatus(
  supabase: SupabaseClient<Database>,
  agentId: string,
  agentName: string,
  updateData: AgentUpdate & { last_telemetry_at?: string, _current_agent?: any },
  currentHeartbeat?: string | null,
): Promise<void> {
  const now = new Date();
  
  // 1. Pre-check for redundancy
  const incomingTs = updateData.last_telemetry_at || (updateData as any).update_timestamp;
  const lastUpdate = currentHeartbeat ? new Date(currentHeartbeat).getTime() : 0;
  const incomingTime = incomingTs ? new Date(incomingTs).getTime() : now.getTime();
  
  // FETCH current state from DB for dirty-checking if not provided in context
  let currentAgent = (updateData as any)._current_agent; 
  if (!currentAgent && (updateData as any).metadata_hash) {
     const { data } = await supabase.from('agents').select('*').eq('id', agentId).single();
     currentAgent = data;
  }

  // OTIMIZACAO: Check metadata hash to avoid redundant DB reads/writes
  const incomingMetadataHash = (updateData as any).metadata_hash;
  const currentMetadataHash = (currentAgent as any)?.metadata_hash;
  
  const metadataChanged = incomingMetadataHash 
    ? incomingMetadataHash !== currentMetadataHash
    : Object.entries(updateData)
        .filter(([k]) => k !== 'last_telemetry_at' && k !== 'update_timestamp' && k !== 'last_heartbeat' && k !== 'metadata_hash' && k !== '_current_agent')
        .some(([k, v]) => {
          const currentVal = (currentAgent as any)?.[k];
          if (v === currentVal) return false;
          if (typeof v === 'object' && v !== null && typeof currentVal === 'object' && currentVal !== null) {
            return JSON.stringify(v) !== JSON.stringify(currentVal);
          }
          return v !== currentVal;
        });

  // STRICT IDEMPOTENCY: If incoming timestamp is older than current heartbeat, 
  // we still call RPC for online status but metadataChanged is effectively false for safety.
  // Note: timeThresholdReached is usually handled by the caller or implicitly in metadataChanged/lastUpdate comparison
  if (!metadataChanged && incomingTime <= lastUpdate) {
    logger.debug('Skipping redundant agent heartbeat DB update (idempotent)', { agentName });
    // Still ensure status is online by doing a fast partial update if needed, but RPC handles this better
    return;
  }

  // 2. Delegate to Atomic RPC (Locking + Transactional Update)
  // This prevents Race Conditions between concurrent heartbeat instances.
  const { error } = await supabase.rpc('update_agent_heartbeat_atomic', {
    p_agent_id: agentId,
    p_update_data: updateData as any
  });

  if (error) {
    // P3 FIX: Handle case where RPC doesn't exist or is inaccessible
    if (error.code === 'P0001' || error.message?.includes('database error')) {
      logger.error('CRITICAL: Failed to update agent heartbeat atomically', {
        error, errorMessage: error.message, agentId, agentName,
      });
      throw new Error(`Heartbeat persistence failed: ${error.message}`);
    }
    
    // Fallback to standard update with Optimistic Locking (MVCC) if atomic RPC is missing
    logger.warn('Atomic heartbeat RPC failed, falling back to MVCC update', { agentName, errorCode: error.code });
    
    // Use the captured current state or fetch if missing
    if (!currentAgent) {
        const { data } = await supabase
          .from('agents')
          .select('version, last_heartbeat')
          .eq('id', agentId)
          .single();
        currentAgent = data;
    }

    const currentVersion = currentAgent?.version || (updateData as any).version || 1;
    const currentHb = currentAgent?.last_heartbeat ? new Date(currentAgent.last_heartbeat).getTime() : 0;

    // Idempotency check before update
    if (incomingTime < currentHb) {
      logger.debug('Skipping stale heartbeat update (MVCC fallback)', { agentName });
      return;
    }

    const { error: updateError } = await supabase
      .from('agents')
      .update({ 
        ...updateData, 
        status: 'active', 
        last_heartbeat: now.toISOString(),
        version: currentVersion + 1
      } as any)
      .eq('id', agentId)
      .eq('version', currentVersion); // The "Optimistic Lock"

    if (updateError) {
      if (updateError.code === 'P0001') logger.warn('MVCC collision detected (concurrent update), retry handled by agent', { agentName });
      else throw updateError;
    }
  }
  
  logger.info('Agent heartbeat updated atomically', { agentName, metadataChanged });
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
    const touchToken = async () => {
      try {
        const { error } = await supabase
          .from('agent_tokens')
          .update({ last_used_at: new Date().toISOString() })
          .eq('agent_id', agent.id)
          .eq('is_active', true);
        if (error) logger.warn('Token touch failed', { error: error.message });
      } catch (e: any) {
        logger.warn('Token touch promise rejected', { error: e.message });
      }
    };
    parallelOps.push(touchToken());

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

async function insertProcessData(
  supabase: SupabaseClient<Database>,
  agent: AgentContext,
  processesPayload: NonNullable<OSInfo['processes']>,
  processAnomalies: any[] | undefined,
): Promise<void> {
  const allProcs: any[] = []
  const seenPids = new Set<number>()

  for (const p of [...(processesPayload.top_by_cpu || []), ...(processesPayload.top_by_memory || [])]) {
    if (p.pid && !seenPids.has(p.pid)) {
      seenPids.add(p.pid)
      allProcs.push({
        pid: p.pid,
        name: p.name,
        cpu_percent: p.cpu_percent ?? p.cpu_seconds ?? 0,
        memory_mb: p.memory_mb ?? 0,
        user: p.user ?? '',
        command_line: p.command_line,
      })
    }
  }

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
    suspicious_processes: Array.isArray(processAnomalies) ? processAnomalies : [],
    collected_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('agent_processes').insert(processRow)

  if (error) {
    logger.error('PROCESS INSERT FAILED', {
      agentId: agent.id, agentName: agent.agent_name, error: error.message,
    })
  }
}
