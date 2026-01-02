import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * FASE 7: Edge Function para Rollback de Decisões
 * 
 * Reverte uma decisão passada com base em um decision_event,
 * registrando um novo decision_event de rollback para auditoria.
 * 
 * POST /functions/v1/rollback-by-decision-event
 * Body: { decision_event_id: uuid, reason: string }
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { decision_event_id, reason } = await req.json();

    if (!decision_event_id) {
      return new Response(
        JSON.stringify({ error: 'decision_event_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Buscar decision_event original
    const { data: event, error } = await supabase
      .from('decision_events')
      .select('*')
      .eq('id', decision_event_id)
      .single();

    if (error || !event) {
      logger.warn('Decision event not found', { decision_event_id });
      return new Response(
        JSON.stringify({ error: 'Decision event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Só permite rollback de alert_resolution
    if (event.decision_type !== 'alert_resolution') {
      return new Response(
        JSON.stringify({ 
          error: 'Rollback not supported for this decision type',
          decision_type: event.decision_type,
          supported_types: ['alert_resolution']
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const alertId = event.evidence?.alert_id;
    if (!alertId) {
      return new Response(
        JSON.stringify({ error: 'No alert_id in decision evidence' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Verificar se já houve rollback para esta decisão
    const { count } = await supabase
      .from('decision_events')
      .select('*', { count: 'exact', head: true })
      .eq('decision_type', 'rollback')
      .filter('evidence->>original_decision_event_id', 'eq', decision_event_id);

    if (count && count > 0) {
      return new Response(
        JSON.stringify({ error: 'Rollback already executed for this decision' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Reverter o alerta (reabrir)
    const { error: revertError } = await supabase
      .from('system_alerts')
      .update({
        resolved: false,
        resolved_at: null
      })
      .eq('id', alertId);

    if (revertError) {
      logger.error('Failed to revert alert', revertError);
      throw revertError;
    }

    // 4. O trigger trg_decision_event_alert cria automaticamente um decision_event
    // com decision_type = 'alert_reopen', mas também registramos explicitamente
    // o rollback para vincular ao decision_event original
    const { error: rollbackEventError } = await supabase
      .from('decision_events')
      .insert({
        tenant_id: event.tenant_id,
        rule_code: 'ROLLBACK',
        decision_source: 'human',
        decision_type: 'rollback',
        action: 'rollback_alert_resolution',
        evidence: {
          alert_id: alertId,
          original_decision_event_id: decision_event_id,
          original_action: event.action,
          original_rule_code: event.rule_code,
          reason: reason ?? 'Manual rollback via API'
        },
        actions_executed: [{ type: 'alert_reopened', success: true }],
        created_at: new Date().toISOString()
      });

    if (rollbackEventError) {
      logger.error('Failed to create rollback decision event', rollbackEventError);
      // Não bloqueia - o alerta já foi revertido
    }

    logger.success('Rollback executed successfully', { 
      decision_event_id, 
      alertId,
      reason 
    });

    return new Response(
      JSON.stringify({ 
        status: 'rollback_executed', 
        alert_id: alertId,
        original_decision_event_id: decision_event_id,
        message: 'Alert reopened and rollback decision event created'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    logger.error('Rollback failed', err);
    return new Response(
      JSON.stringify({ error: 'Internal error during rollback' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
