import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * FASE 7: Edge Function para Rollback de Decisões
 * 
 * Reverte uma decisão passada com base em um decision_event,
 * registrando um novo decision_event de rollback para auditoria.
 * 
 * V-8001 FIX: Added JWT auth + tenant isolation
 * V-8002 FIX: Added tenant_id filter to alert update
 * 
 * POST /functions/v1/rollback-by-decision-event
 * Body: { decision_event_id: uuid, reason: string }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // V-8001 FIX: Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Validate JWT and get user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get user's tenant
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!userRole?.tenant_id) {
      return new Response(
        JSON.stringify({ error: 'No tenant access' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only admins can rollback decisions
    if (!['admin', 'super_admin'].includes(userRole.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only admins can rollback decisions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { decision_event_id, reason } = await req.json();

    if (!decision_event_id) {
      return new Response(
        JSON.stringify({ error: 'decision_event_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Fetch decision_event — V-8002 FIX: filter by caller's tenant_id
    const { data: event, error } = await supabase
      .from('decision_events')
      .select('*')
      .eq('id', decision_event_id)
      .eq('tenant_id', userRole.tenant_id)
      .single();

    if (error || !event) {
      logger.warn('Decision event not found or access denied', { decision_event_id, tenant_id: userRole.tenant_id });
      return new Response(
        JSON.stringify({ error: 'Decision event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only allow rollback of alert_resolution
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

    // 2. Check if rollback already executed
    const { count } = await supabase
      .from('decision_events')
      .select('*', { count: 'exact', head: true })
      .eq('decision_type', 'rollback')
      .eq('tenant_id', userRole.tenant_id)
      .filter('evidence->>original_decision_event_id', 'eq', decision_event_id);

    if (count && count > 0) {
      return new Response(
        JSON.stringify({ error: 'Rollback already executed for this decision' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Revert alert — V-8002 FIX: filter by tenant_id
    const { error: revertError } = await supabase
      .from('system_alerts')
      .update({
        resolved: false,
        resolved_at: null
      })
      .eq('id', alertId)
      .eq('tenant_id', userRole.tenant_id);

    if (revertError) {
      logger.error('Failed to revert alert', revertError);
      throw revertError;
    }

    // 4. Record rollback decision event
    const { error: rollbackEventError } = await supabase
      .from('decision_events')
      .insert({
        tenant_id: userRole.tenant_id,
        rule_code: 'ROLLBACK',
        decision_source: 'human',
        decision_type: 'rollback',
        action: 'rollback_alert_resolution',
        evidence: {
          alert_id: alertId,
          original_decision_event_id: decision_event_id,
          original_action: event.action,
          original_rule_code: event.rule_code,
          reason: reason ?? 'Manual rollback via API',
          user_id: user.id,
        },
        actions_executed: [{ type: 'alert_reopened', success: true }],
        created_at: new Date().toISOString()
      });

    if (rollbackEventError) {
      logger.error('Failed to create rollback decision event', rollbackEventError);
    }

    logger.success('Rollback executed successfully', { 
      decision_event_id, 
      alertId,
      reason,
      user_id: user.id,
      tenant_id: userRole.tenant_id,
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
