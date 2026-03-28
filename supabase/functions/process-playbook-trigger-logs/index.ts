import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: process-playbook-trigger-logs
 * 
 * Processa logs de ai_action_logs com action_type = 'playbook_trigger_evaluation'
 * e status = 'pending', chamando evaluate-playbook-triggers para cada um.
 * 
 * Deve ser executada via cron a cada 5 minutos.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1130: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const startTime = Date.now();
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
  const BATCH_SIZE = 50;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    logger.info('[process-playbook-trigger-logs] Starting batch processing...');

    // Buscar logs pendentes
    const { data: pendingLogs, error: fetchError } = await supabase
      .from('ai_action_logs')
      .select('id, tenant_id, action_data, created_at')
      .eq('action_type', 'playbook_trigger_evaluation')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      logger.error('[process-playbook-trigger-logs] Error fetching logs:', fetchError);
      throw fetchError;
    }

    if (!pendingLogs || pendingLogs.length === 0) {
      logger.info('[process-playbook-trigger-logs] No pending logs to process');
      return new Response(JSON.stringify({
        success: true,
        processed: 0,
        message: 'No pending logs',
        duration_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info(`[process-playbook-trigger-logs] Found ${pendingLogs.length} pending logs`);

    // Marcar como processando para evitar duplicacao
    const logIds = pendingLogs.map(l => l.id);
    const { error: updateError } = await supabase
      .from('ai_action_logs')
      .update({ status: 'processing' })
      .in('id', logIds);

    if (updateError) {
      logger.error('[process-playbook-trigger-logs] Error marking as processing:', updateError);
      // Continuar mesmo assim
    }

    // Processar cada log
    const results = {
      success: 0,
      failed: 0,
      expired: 0,
      details: [] as Array<{ id: string; status: string; error?: string }>,
    };

    for (const log of pendingLogs) {
      const actionData = log.action_data as Record<string, unknown>;
      
      // Verificar se o log e muito antigo (> 7 dias) - expirar ao inves de processar
      const createdAt = new Date(log.created_at);
      const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceCreation > 7) {
        logger.info(`[process-playbook-trigger-logs] Expiring old log ${log.id} (${daysSinceCreation.toFixed(1)} days old)`);
        
        await supabase
          .from('ai_action_logs')
          .update({
            status: 'expired',
            processed_at: new Date().toISOString(),
            error_message: `Expirado automaticamente: log com ${daysSinceCreation.toFixed(0)} dias de idade.`,
          })
          .eq('id', log.id);
        
        results.expired++;
        results.details.push({ id: log.id, status: 'expired' });
        continue;
      }

      try {
        // Construir payload para evaluate-playbook-triggers
        const triggerPayload = {
          tenant_id: actionData.tenant_id || log.tenant_id,
          trigger_type: actionData.trigger_type || 'job_failed',
          agent_id: actionData.agent_id || null,
          context: actionData,
        };

        // Chamar evaluate-playbook-triggers internamente
        const response = await fetch(`${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'X-Internal-Secret': INTERNAL_SECRET,
          },
          body: JSON.stringify(triggerPayload),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || `HTTP ${response.status}`);
        }

        // Marcar como processado
        await supabase
          .from('ai_action_logs')
          .update({
            status: 'processed',
            processed_at: new Date().toISOString(),
            error_message: JSON.stringify({
              triggered: result.triggered,
              execution_id: result.execution_id,
              reason: result.reason,
            }),
          })
          .eq('id', log.id);

        results.success++;
        results.details.push({
          id: log.id,
          status: 'processed',
        });

        logger.info(`[process-playbook-trigger-logs] Processed log ${log.id}: triggered=${result.triggered}`);

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`[process-playbook-trigger-logs] Error processing log ${log.id}:`, errorMsg);

        // Marcar como falha
        await supabase
          .from('ai_action_logs')
          .update({
            status: 'failed',
            processed_at: new Date().toISOString(),
            error_message: `Erro ao processar: ${errorMsg}`,
          })
          .eq('id', log.id);

        results.failed++;
        results.details.push({
          id: log.id,
          status: 'failed',
          error: errorMsg,
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`[process-playbook-trigger-logs] Completed: ${results.success} success, ${results.failed} failed, ${results.expired} expired (${duration}ms)`);

    return new Response(JSON.stringify({
      success: true,
      processed: results.success,
      failed: results.failed,
      expired: results.expired,
      total: pendingLogs.length,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[process-playbook-trigger-logs] Fatal error:', errorMsg);

    return new Response(JSON.stringify({
      success: false,
      error: errorMsg,
      duration_ms: Date.now() - startTime,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
