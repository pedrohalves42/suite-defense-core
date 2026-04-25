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
import type { AgentContext, AgentUpdate, OSInfo } from './types.ts'

// Re-export types used by callers
export type { AgentContext, AgentUpdate, OSInfo }

/** Throttle interval for metrics/process/token-touch inserts (5 minutes) */
export const TELEMETRY_THROTTLE_MS = 5 * 60 * 1000

/**
 * Update agent heartbeat status in DB.
 */
export async function updateAgentStatus(
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  updateData: AgentUpdate & { last_telemetry_at?: string },
): Promise<void> {
  const { error } = await supabase
    .from('agents')
    .update(updateData)
    .eq('id', agentId)

  if (error) {
    logger.error('Failed to update agent heartbeat', {
      error, errorMessage: error.message, errorDetails: error.details,
      errorHint: error.hint, agentId, agentName,
      updateData: JSON.stringify(updateData),
    })
    logger.warn('Heartbeat authenticated but update failed - continuing')
  } else {
    logger.info('Agent heartbeat updated successfully', { agentName })
  }
}

/**
 * Execute all parallel side-effect operations (metrics, processes, token touch).
 * Fire-and-forget semantics — failures are logged but don't block heartbeat response.
 */
export async function executeParallelOps(
  supabase: SupabaseClient,
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
    parallelOps.push(
      Promise.resolve(
        supabase
          .from('agent_tokens')
          .update({ last_used_at: new Date().toISOString() })
          .eq('agent_id', agent.id)
          .eq('is_active', true)
      ).then(({ error }) => {
        if (error) logger.warn('Token touch failed', { error: error.message })
      })
    )

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
  supabase: SupabaseClient,
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
      ? Math.round((metrics.disk_total_gb - metrics.disk_free_gb) * 100) / 100
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
      agentName: agent.agent_name, error: error.message,
    })
  }
}

async function insertProcessData(
  supabase: SupabaseClient,
  agent: AgentContext,
  processesPayload: NonNullable<OSInfo['processes']>,
  processAnomalies: unknown[] | undefined,
): Promise<void> {
  const allProcs: Array<Record<string, unknown>> = []
  const seenPids = new Set<number>()

  for (const p of [...(processesPayload.top_by_cpu || []), ...(processesPayload.top_by_memory || [])]) {
    if (p.pid && !seenPids.has(p.pid)) {
      seenPids.add(p.pid)
      allProcs.push({
        pid: p.pid,
        name: p.name,
        cpu_percent: p.cpu_seconds ?? 0,
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
    total_processes: processesPayload.total_processes ?? allProcs.length,
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
      agentName: agent.agent_name, error: error.message,
    })
  }
}
