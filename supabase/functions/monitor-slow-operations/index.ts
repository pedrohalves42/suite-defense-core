import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

/**
 * Monitor Slow Operations - FASE 4.1
 * Monitora operações lentas (> 2s) e envia alertas
 * Executado via cron job a cada 5 minutos
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
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

    // Query de métricas lentas (> 2s nos últimos 5 min)
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

      // Agrupar por função para análise
      const byFunction: Record<string, number> = {};
      slowOps!.forEach((op) => {
        byFunction[op.function_name] = (byFunction[op.function_name] || 0) + 1;
      });

      logger.info('[MONITOR] Slow operations by function', byFunction);

      // TODO: Enviar notificação (email/webhook) para admins
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

    return new Response(
      JSON.stringify({
        success: true,
        slow_operations_count: slowOpCount,
        monitored_window: '5 minutes',
        threshold_ms: 2000,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[MONITOR] Unexpected error', { error: errorMessage, requestId });
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
