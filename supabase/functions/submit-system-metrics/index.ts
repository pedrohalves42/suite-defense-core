import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { selectPrimaryDisk, insertDiskMetrics, DiskInfo } from './disk-processor.ts';
import { generateAlerts, autoResolveAlerts } from './alert-engine.ts';
import { evaluateLightMode } from './light-mode-evaluator.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest();
  const methodError = validateHttpMethod(req, ['POST']);
  if (methodError) return methodError;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Token auth
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      return new Response(JSON.stringify({ error: 'Missing agent token' }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, is_active, agents (id, agent_name, tenant_id, hmac_secret, status)')
      .eq('token_hash', tokenHash).eq('is_active', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (tokenError || !tokenData || !tokenData.agents) {
      return new Response(JSON.stringify({ error: 'Invalid agent token' }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const agent = tokenData.agents as Record<string, unknown>;

    // HMAC validation
    if (agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name as string, agent.hmac_secret as string);
      if (!hmacResult.valid) {
        return new Response(JSON.stringify({ error: 'unauthorized', code: hmacResult.errorCode, message: hmacResult.errorMessage, transient: hmacResult.transient }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
    }

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, `metrics:${agent.agent_name}`, 'submit-system-metrics', { maxRequests: 60, windowMinutes: 60, blockMinutes: 10 });
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded', resetAt: rateLimitResult.resetAt }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const metrics: SystemMetrics = await req.json();
    logger.info('Received metrics payload', { agent: agent.agent_name, cpu: metrics.cpu_usage_percent, memory: metrics.memory_usage_percent, disks_count: metrics.disks?.length || 0 });

    // Disk processing
    const primaryDisk = selectPrimaryDisk(metrics.disks, metrics.disk_total_gb, metrics.disk_used_gb, metrics.disk_free_gb, metrics.disk_usage_percent);

    // Insert main metrics
    const { error: insertError } = await supabase.from('agent_system_metrics_partitioned').insert({
      agent_id: agent.id, tenant_id: agent.tenant_id,
      cpu_usage_percent: metrics.cpu_usage_percent, cpu_name: metrics.cpu_name, cpu_cores: metrics.cpu_cores,
      memory_total_gb: metrics.memory_total_gb, memory_used_gb: metrics.memory_used_gb, memory_free_gb: metrics.memory_free_gb, memory_usage_percent: metrics.memory_usage_percent,
      disk_total_gb: primaryDisk.total_gb, disk_used_gb: primaryDisk.used_gb, disk_free_gb: primaryDisk.free_gb, disk_usage_percent: primaryDisk.usage_percent,
      network_bytes_sent: metrics.network_bytes_sent, network_bytes_received: metrics.network_bytes_received,
      uptime_seconds: metrics.uptime_seconds, last_boot_time: metrics.last_boot_time ? new Date(metrics.last_boot_time).toISOString() : null,
    });

    if (insertError) {
      logger.error('Failed to insert metrics', insertError);
      return new Response(JSON.stringify({ error: 'Failed to store metrics' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // Insert individual disk metrics
    if (metrics.disks) await insertDiskMetrics(supabase, agent.id as string, agent.tenant_id as string, metrics.disks);

    // Alert generation
    const alertsGenerated = await generateAlerts(supabase, { id: agent.id as string, agent_name: agent.agent_name as string, tenant_id: agent.tenant_id as string }, {
      cpu_usage_percent: metrics.cpu_usage_percent, memory_usage_percent: metrics.memory_usage_percent,
      memory_used_gb: metrics.memory_used_gb, memory_total_gb: metrics.memory_total_gb, disk_usage_percent: metrics.disk_usage_percent,
    });

    // Auto-resolve alerts
    await autoResolveAlerts(supabase, agent.id as string, { cpu_usage_percent: metrics.cpu_usage_percent, memory_usage_percent: metrics.memory_usage_percent, disk_usage_percent: metrics.disk_usage_percent });

    // Automation rules evaluation
    let automationTriggered = 0;
    try {
      const { data: activeRules } = await supabase.from('automation_rules').select('id').eq('tenant_id', agent.tenant_id).eq('is_active', true).eq('trigger_type', 'metric_threshold').limit(1);
      if (activeRules && activeRules.length > 0) {
        const evalResponse = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/evaluate-automation-rules`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ tenant_id: agent.tenant_id }),
        });
        if (evalResponse.ok) {
          const evalResult = await evalResponse.json();
          automationTriggered = evalResult.triggered || 0;
        }
      }
    } catch (automationError) {
      logger.warn('Automation evaluation failed (non-blocking)', automationError);
    }

    // Light mode evaluation
    const lightModeConfig = await evaluateLightMode(supabase, agent.id as string, agent.agent_name as string, agent.tenant_id as string,
      metrics.cpu_usage_percent ?? 0, (metrics.network_bytes_sent ?? 0) + (metrics.network_bytes_received ?? 0));

    logger.success(`Metrics processed, ${alertsGenerated} alerts generated, ${automationTriggered} automations triggered`);

    return new Response(
      JSON.stringify({ success: true, alerts_generated: alertsGenerated, automation_triggered: automationTriggered, light_mode: lightModeConfig }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    logger.error('Metrics submission failed', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
});
