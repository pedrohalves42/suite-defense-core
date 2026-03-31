/**
 * calculate-behavioral-baselines → Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startTime = Date.now();
  logger.info(`[${requestId}] Starting baseline calculation...`);

  const { data: agents, error: agentsError } = await supabase
    .from('agents_safe').select('id, tenant_id, agent_name').is('archived_at', null).eq('status', 'active');

  if (agentsError) throw new Error(`Failed to fetch agents: ${agentsError.message}`);
  if (!agents || agents.length === 0) return { message: 'No active agents', processed: 0 };

  logger.info(`[${requestId}] Processing ${agents.length} agents`);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let processedCount = 0;
  let errorCount = 0;

  for (const agent of agents) {
    try {
      const { data: processData } = await supabase
        .from('agent_processes').select('processes, collected_at')
        .eq('agent_id', agent.id).gte('collected_at', sevenDaysAgo.toISOString())
        .order('collected_at', { ascending: true });

      if (!processData || processData.length < 3) continue;

      const cpuValues: number[] = [];
      const processCountValues: number[] = [];

      for (const snapshot of processData) {
        const processes = snapshot.processes as Array<Record<string, unknown>>;
        if (Array.isArray(processes)) {
          const totalCpu = processes.reduce((sum: number, p: { cpu_percent?: number; cpu?: number }) => sum + (Number(p.cpu_percent || p.cpu || 0)), 0);
          cpuValues.push(Math.min(totalCpu, 100));
          processCountValues.push(processes.length);
        }
      }

      for (const { type, values } of [{ type: 'cpu_usage', values: cpuValues }, { type: 'process_count', values: processCountValues }]) {
        if (values.length < 3) continue;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        const baselinePayload = {
          agent_id: agent.id, tenant_id: agent.tenant_id, baseline_type: type,
          mean_value: Math.round(mean * 100) / 100, std_deviation: Math.round(stdDev * 100) / 100,
          threshold_multiplier: 2.5,
          baseline_data: { sample_count: values.length, min: Math.min(...values), max: Math.max(...values), p50: percentile(values, 50), p90: percentile(values, 90), p99: percentile(values, 99) },
          baseline_period_start: sevenDaysAgo.toISOString(), baseline_period_end: now.toISOString(),
          is_active: true, last_updated: now.toISOString(),
        };

        const { error: upsertError } = await supabase.from('agent_behavioral_baseline').upsert(baselinePayload, { onConflict: 'agent_id,baseline_type', ignoreDuplicates: false });

        if (upsertError) {
          const { data: existing } = await supabase.from('agent_behavioral_baseline').select('id').eq('agent_id', agent.id).eq('baseline_type', type).maybeSingle();
          if (existing) { await supabase.from('agent_behavioral_baseline').update(baselinePayload).eq('id', existing.id); }
          else { await supabase.from('agent_behavioral_baseline').insert(baselinePayload); }
        }
      }
      processedCount++;
    } catch (agentError) {
      logger.error(`[${requestId}] Error processing agent ${agent.agent_name}:`, String(agentError));
      errorCount++;
    }
  }

  const duration = Date.now() - startTime;
  logger.info(`[${requestId}] Complete: ${processedCount} agents processed, ${errorCount} errors, ${duration}ms`);
  return { success: true, processed: processedCount, errors: errorCount, duration_ms: duration };
});

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round((sorted[Math.max(0, idx)] || 0) * 100) / 100;
}
