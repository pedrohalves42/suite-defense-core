/**
 * submit-system-metrics — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { selectPrimaryDisk, insertDiskMetrics, DiskInfo } from './disk-processor.ts';
import { generateAlerts, autoResolveAlerts } from './alert-engine.ts';
import { evaluateLightMode } from './light-mode-evaluator.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const DiskInfoSchema = z.object({
  drive_letter: z.string().max(10).optional(),
  drive_label: z.string().max(255).optional(),
  drive_type: z.string().max(50).optional(),
  total_gb: z.number().min(0).optional(),
  used_gb: z.number().min(0).optional(),
  free_gb: z.number().min(0).optional(),
  usage_percent: z.number().min(0).max(100).optional(),
  is_system_drive: z.boolean().optional(),
}).passthrough();

const SystemMetricsSchema = z.object({
  cpu_usage_percent: z.number().min(0).max(100).optional(),
  cpu_name: z.string().max(255).optional(),
  cpu_cores: z.number().int().min(1).max(1024).optional(),
  memory_total_gb: z.number().min(0).optional(),
  memory_used_gb: z.number().min(0).optional(),
  memory_free_gb: z.number().min(0).optional(),
  memory_usage_percent: z.number().min(0).max(100).optional(),
  disk_total_gb: z.number().min(0).optional(),
  disk_used_gb: z.number().min(0).optional(),
  disk_free_gb: z.number().min(0).optional(),
  disk_usage_percent: z.number().min(0).max(100).optional(),
  disks: z.array(DiskInfoSchema).max(50).optional(),
  network_bytes_sent: z.number().min(0).optional(),
  network_bytes_received: z.number().min(0).optional(),
  uptime_seconds: z.number().min(0).optional(),
  last_boot_time: z.string().max(50).optional(),
});

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, body } = ctx;

  const parsed = SystemMetricsSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const metrics = parsed.data as typeof parsed.data & { disks?: DiskInfo[] };

  logger.info('Received metrics', { agent: agentName, cpu: metrics.cpu_usage_percent, memory: metrics.memory_usage_percent, disks_count: metrics.disks?.length || 0 });

  const primaryDisk = selectPrimaryDisk(metrics.disks, metrics.disk_total_gb, metrics.disk_used_gb, metrics.disk_free_gb, metrics.disk_usage_percent);

  const { error: insertError } = await supabase.from('agent_system_metrics_partitioned').insert({
    agent_id: agentId, tenant_id: tenantId,
    cpu_usage_percent: metrics.cpu_usage_percent, cpu_name: metrics.cpu_name, cpu_cores: metrics.cpu_cores,
    memory_total_gb: metrics.memory_total_gb, memory_used_gb: metrics.memory_used_gb, memory_free_gb: metrics.memory_free_gb, memory_usage_percent: metrics.memory_usage_percent,
    disk_total_gb: primaryDisk.total_gb, disk_used_gb: primaryDisk.used_gb, disk_free_gb: primaryDisk.free_gb, disk_usage_percent: primaryDisk.usage_percent,
    network_bytes_sent: metrics.network_bytes_sent, network_bytes_received: metrics.network_bytes_received,
    uptime_seconds: metrics.uptime_seconds, last_boot_time: metrics.last_boot_time ? new Date(metrics.last_boot_time).toISOString() : null,
  });

  if (insertError) {
    logger.error('Failed to insert metrics', insertError);
    return new Response(JSON.stringify({ error: 'Failed to store metrics' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  if (metrics.disks) await insertDiskMetrics(supabase, agentId, tenantId, metrics.disks);

  const alertsGenerated = await generateAlerts(supabase, { id: agentId, agent_name: agentName, tenant_id: tenantId }, {
    cpu_usage_percent: metrics.cpu_usage_percent, memory_usage_percent: metrics.memory_usage_percent,
    memory_used_gb: metrics.memory_used_gb, memory_total_gb: metrics.memory_total_gb, disk_usage_percent: metrics.disk_usage_percent,
  });

  await autoResolveAlerts(supabase, agentId, { cpu_usage_percent: metrics.cpu_usage_percent, memory_usage_percent: metrics.memory_usage_percent, disk_usage_percent: metrics.disk_usage_percent });

  // Automation rules evaluation
  let automationTriggered = 0;
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { data: activeRules } = await supabase.from('automation_rules').select('id').eq('tenant_id', tenantId).eq('is_active', true).eq('trigger_type', 'metric_threshold').limit(1);
    if (activeRules?.length) {
      const evalResponse = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/evaluate-automation-rules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      if (evalResponse.ok) {
        const evalResult = await evalResponse.json();
        automationTriggered = evalResult.triggered || 0;
      }
    }
  } catch (automationError) {
    logger.warn('Automation evaluation failed (non-blocking)', automationError);
  }

  const lightModeConfig = await evaluateLightMode(supabase, agentId, agentName, tenantId,
    metrics.cpu_usage_percent ?? 0, (metrics.network_bytes_sent ?? 0) + (metrics.network_bytes_received ?? 0));

  return { success: true, alerts_generated: alertsGenerated, automation_triggered: automationTriggered, light_mode: lightModeConfig };
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-system-metrics', maxRequests: 60, windowMinutes: 60, blockMinutes: 10 },
});
