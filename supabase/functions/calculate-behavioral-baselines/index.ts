import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1134: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const startTime = Date.now();
  logger.info('[calculate-behavioral-baselines] Starting baseline calculation...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all active agents with their tenant_id
    const { data: agents, error: agentsError } = await supabase
      .from('agents_safe')
      .select('id, tenant_id, agent_name')
      .is('archived_at', null)
      .eq('status', 'active');

    if (agentsError) throw new Error(`Failed to fetch agents: ${agentsError.message}`);
    if (!agents || agents.length === 0) {
      logger.info('[calculate-behavioral-baselines] No active agents found');
      return new Response(JSON.stringify({ message: 'No active agents', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info(`[calculate-behavioral-baselines] Processing ${agents.length} agents`);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let processedCount = 0;
    let errorCount = 0;

    for (const agent of agents) {
      try {
        // Fetch process snapshots for CPU baseline (last 7 days)
        const { data: processData } = await supabase
          .from('agent_processes')
          .select('processes, collected_at')
          .eq('agent_id', agent.id)
          .gte('collected_at', sevenDaysAgo.toISOString())
          .order('collected_at', { ascending: true });

        if (!processData || processData.length < 3) {
          logger.info(`[calculate-behavioral-baselines] Agent ${agent.agent_name}: insufficient data (${processData?.length || 0} snapshots)`);
          continue;
        }

        // Calculate CPU baseline from process data
        const cpuValues: number[] = [];
        const processCountValues: number[] = [];

        for (const snapshot of processData) {
          const processes = snapshot.processes as Array<Record<string, unknown>>;
          if (Array.isArray(processes)) {
            const totalCpu = processes.reduce((sum: number, p: any) => sum + (Number(p.cpu_percent || p.cpu || 0)), 0);
            cpuValues.push(Math.min(totalCpu, 100));
            processCountValues.push(processes.length);
          }
        }

        // Calculate baselines for each metric type
        const baselineTypes = [
          { type: 'cpu_usage', values: cpuValues },
          { type: 'process_count', values: processCountValues },
        ];

        for (const { type, values } of baselineTypes) {
          if (values.length < 3) continue;

          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance);

          // Upsert baseline
          const { error: upsertError } = await supabase
            .from('agent_behavioral_baseline')
            .upsert({
              agent_id: agent.id,
              tenant_id: agent.tenant_id,
              baseline_type: type,
              mean_value: Math.round(mean * 100) / 100,
              std_deviation: Math.round(stdDev * 100) / 100,
              threshold_multiplier: 2.5, // 2.5 sigma for anomaly detection
              baseline_data: {
                sample_count: values.length,
                min: Math.min(...values),
                max: Math.max(...values),
                p50: percentile(values, 50),
                p90: percentile(values, 90),
                p99: percentile(values, 99),
              },
              baseline_period_start: sevenDaysAgo.toISOString(),
              baseline_period_end: now.toISOString(),
              is_active: true,
              last_updated: now.toISOString(),
            }, {
              onConflict: 'agent_id,baseline_type',
              ignoreDuplicates: false,
            });

          if (upsertError) {
            // If upsert with onConflict fails, try update then insert
            const { data: existing } = await supabase
              .from('agent_behavioral_baseline')
              .select('id')
              .eq('agent_id', agent.id)
              .eq('baseline_type', type)
              .maybeSingle();

            if (existing) {
              await supabase
                .from('agent_behavioral_baseline')
                .update({
                  mean_value: Math.round(mean * 100) / 100,
                  std_deviation: Math.round(stdDev * 100) / 100,
                  threshold_multiplier: 2.5,
                  baseline_data: {
                    sample_count: values.length,
                    min: Math.min(...values),
                    max: Math.max(...values),
                    p50: percentile(values, 50),
                    p90: percentile(values, 90),
                    p99: percentile(values, 99),
                  },
                  baseline_period_start: sevenDaysAgo.toISOString(),
                  baseline_period_end: now.toISOString(),
                  is_active: true,
                  last_updated: now.toISOString(),
                })
                .eq('id', existing.id);
            } else {
              await supabase
                .from('agent_behavioral_baseline')
                .insert({
                  agent_id: agent.id,
                  tenant_id: agent.tenant_id,
                  baseline_type: type,
                  mean_value: Math.round(mean * 100) / 100,
                  std_deviation: Math.round(stdDev * 100) / 100,
                  threshold_multiplier: 2.5,
                  baseline_data: {
                    sample_count: values.length,
                    min: Math.min(...values),
                    max: Math.max(...values),
                    p50: percentile(values, 50),
                    p90: percentile(values, 90),
                    p99: percentile(values, 99),
                  },
                  baseline_period_start: sevenDaysAgo.toISOString(),
                  baseline_period_end: now.toISOString(),
                  is_active: true,
                  last_updated: now.toISOString(),
                });
            }
          }
        }

        processedCount++;
      } catch (agentError) {
        logger.error(`[calculate-behavioral-baselines] Error processing agent ${agent.agent_name}:`, String(agentError));
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`[calculate-behavioral-baselines] Complete: ${processedCount} agents processed, ${errorCount} errors, ${duration}ms`);

    return new Response(JSON.stringify({
      success: true,
      processed: processedCount,
      errors: errorCount,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('[calculate-behavioral-baselines] Fatal error:', String(error));
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round((sorted[Math.max(0, idx)] || 0) * 100) / 100;
}
