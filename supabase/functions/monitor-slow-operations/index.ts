import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { recordMetric } from '../_shared/apm.ts';

/**
 * Monitor Slow Operations - FASE 4.1
 * Monitora operacoes lentas (> 2s) e envia alertas
 * Executado via cron job a cada 5 minutos
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  logger.info('[MONITOR] Starting slow operations check', { requestId });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      logger.error('[MONITOR] Missing Supabase credentials');
      return new Response(
        JSON.stringify({ error: 'Configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query de metricas lentas (> 2s nos ultimos 5 min)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: slowOps, error: queryError } = await supabase
      .from('performance_metrics')
      .select('*')
      .gt('duration_ms', 2000)
      .gte('created_at', fiveMinutesAgo)
      .order('duration_ms', { ascending: false })
      .limit(50);

    if (queryError) {
      logger.error('[MONITOR] Query error', { error: queryError.message });
      return new Response(
        JSON.stringify({ error: queryError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const slowOpCount = slowOps?.length || 0;

    if (slowOpCount > 0) {
      logger.warn(`[MONITOR] Detected ${slowOpCount} slow operations`, {
        count: slowOpCount,
        slowest: slowOps![0],
        threshold_ms: 2000,
      });

      // Agrupar por funcao para analise
      const byFunction: Record<string, number> = {};
      slowOps!.forEach((op) => {
        byFunction[op.function_name] = (byFunction[op.function_name] || 0) + 1;
      });

      logger.info('[MONITOR] Slow operations by function', byFunction);

      // TODO: Enviar notificacao (email/webhook) para admins
      // Exemplo:
      // await supabase.functions.invoke('send-system-alert', {
      //   body: {
      //     type: 'slow_operations',
      //     count: slowOpCount,
      //     details: byFunction,
      //     slowest: slowOps![0]
      //   }
      // });
    } else {
      logger.info('[MONITOR] No slow operations detected in the last 5 minutes');
    }

    const result = {
      success: true,
      slow_operations_count: slowOpCount,
      monitored_window: '5 minutes',
      threshold_ms: 2000,
      timestamp: new Date().toISOString(),
    };

    // Report cron health
    try {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'monitor-slow-operations',
        p_success: true,
        p_details: result,
      });
    } catch (_) { /* best effort */ }

    // APM metric
    recordMetric({
      function_name: 'monitor-slow-operations',
      operation_type: 'edge_function',
      duration_ms: Date.now() - startedAt,
      status_code: 200,
      metadata: { slow_operations_count: slowOpCount }
    }).catch((e) => console.warn('[monitor-slow-operations] APM metric failed:', e));

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[MONITOR] Unexpected error', { error: errorMessage, requestId });
    
    // Report cron health on failure
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'monitor-slow-operations',
        p_success: false,
        p_details: { error: errorMessage },
      });
    } catch (e) { console.warn('[monitor-slow-operations] Failed to update cron health:', e); }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
