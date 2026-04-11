/**
 * Handler: system metrics submission (migrated from submit-system-metrics)
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../logger.ts';
import { selectPrimaryDisk, insertDiskMetrics, DiskInfo } from './disk-processor.ts';
import { generateAlerts, autoResolveAlerts } from './alert-engine.ts';
import { evaluateLightMode } from './light-mode-evaluator.ts';

interface SystemMetrics {
  cpu_usage_percent?: number;
  cpu_name?: string;
  cpu_cores?: number;
  memory_total_gb?: number;
  memory_used_gb?: number;
  memory_free_gb?: number;
  memory_usage_percent?: number;
  disk_total_gb?: number;
  disk_used_gb?: number;
  disk_free_gb?: number;
  disk_usage_percent?: number;
  disks?: DiskInfo[];
  network_bytes_sent?: number;
  network_bytes_received?: number;
  uptime_seconds?: number;
  last_boot_time?: string;
}

export async function handleSystemMetrics(
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
  _agentData?: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const metrics = body as unknown as SystemMetrics;

  logger.info(`[${requestId}] Received metrics`, {
    agent: agentName,
    cpu: metrics.cpu_usage_percent,
    memory: metrics.memory_usage_percent,
    disks_count: metrics.disks?.length || 0,
  });

  const primaryDisk = selectPrimaryDisk(
    metrics.disks,
    metrics.disk_total_gb,
    metrics.disk_used_gb,
    metrics.disk_free_gb,
    metrics.disk_usage_percent,
  );

  const { error: insertError } = await supabase.from('agent_system_metrics_partitioned').insert({
    agent_id: agentId,
    tenant_id: tenantId,
    cpu_usage_percent: metrics.cpu_usage_percent,
    cpu_name: metrics.cpu_name,
    cpu_cores: metrics.cpu_cores,
    memory_total_gb: metrics.memory_total_gb,
    memory_used_gb: metrics.memory_used_gb,
    memory_free_gb: metrics.memory_free_gb,
    memory_usage_percent: metrics.memory_usage_percent,
    disk_total_gb: primaryDisk.total_gb,
    disk_used_gb: primaryDisk.used_gb,
    disk_free_gb: primaryDisk.free_gb,
    disk_usage_percent: primaryDisk.usage_percent,
    network_bytes_sent: metrics.network_bytes_sent,
    network_bytes_received: metrics.network_bytes_received,
    uptime_seconds: metrics.uptime_seconds,
    last_boot_time: metrics.last_boot_time ? new Date(metrics.last_boot_time).toISOString() : null,
  });

  if (insertError) {
    logger.error(`[${requestId}] Failed to insert metrics`, insertError);
    return new Response(JSON.stringify({ error: 'Failed to store metrics' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (metrics.disks) {
    await insertDiskMetrics(supabase, agentId, tenantId, metrics.disks);
  }

  const alertsGenerated = await generateAlerts(supabase, { id: agentId, agent_name: agentName, tenant_id: tenantId }, {
    cpu_usage_percent: metrics.cpu_usage_percent,
    memory_usage_percent: metrics.memory_usage_percent,
    memory_used_gb: metrics.memory_used_gb,
    memory_total_gb: metrics.memory_total_gb,
    disk_usage_percent: metrics.disk_usage_percent,
  });

  await autoResolveAlerts(supabase, agentId, {
    cpu_usage_percent: metrics.cpu_usage_percent,
    memory_usage_percent: metrics.memory_usage_percent,
    disk_usage_percent: metrics.disk_usage_percent,
  });

  const lightModeConfig = await evaluateLightMode(
    supabase, agentId, agentName, tenantId,
    metrics.cpu_usage_percent ?? 0,
    (metrics.network_bytes_sent ?? 0) + (metrics.network_bytes_received ?? 0),
  );

  return {
    success: true,
    alerts_generated: alertsGenerated,
    automation_triggered: 0,
    light_mode: lightModeConfig,
  };
}
