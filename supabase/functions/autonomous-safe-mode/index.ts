import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

interface SafeModeResult {
  success: boolean;
  processed_count: number;
  agents: Array<{
    agent_id: string;
    agent_name: string;
    reason: string;
    failure_count: number;
    error_signature: string;
  }>;
  executed_at: string;
  rule_code: string;
}

interface ActionExecuted {
  type: string;
  success: boolean;
  id?: string;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate internal secret for scheduled calls
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_SECRET');
    
    // Allow if internal secret matches OR if called via cron (no auth needed for scheduled)
    const isScheduledCall = req.headers.get('x-cron-trigger') === 'true';
    const isInternalCall = internalSecret && internalSecret === expectedSecret;
    
    // For non-scheduled calls, require JWT auth
    if (!isScheduledCall && !isInternalCall) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        console.log('[autonomous-safe-mode] Unauthorized: No auth header');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[autonomous-safe-mode] Starting Rules Engine evaluation...');

    // 1. Fetch the SAFE_MODE rule from decision_rules table
    const { data: rule, error: ruleError } = await supabase
      .from('decision_rules')
      .select('*')
      .eq('code', 'SAFE_MODE_RULE_001')
      .eq('is_enabled', true)
      .single();

    // Extract conditions from rule or use defaults
    const conditions = rule?.definition?.conditions || {
      time_window_minutes: 10,
      min_failures: 3,
      heartbeat_max_age_seconds: 300
    };

    const timeWindowMinutes = conditions.time_window_minutes || 10;
    const minFailures = conditions.min_failures || 3;
    const ruleCode = rule?.code || 'SAFE_MODE_RULE_001';

    console.log(`[autonomous-safe-mode] Using rule: ${ruleCode}, conditions:`, conditions);

    // 2. Detectar agentes com padrão de falhas
    const { data: agentsWithFailures, error: detectError } = await supabase
      .rpc('detect_critical_failure_pattern', { 
        p_window_minutes: timeWindowMinutes, 
        p_min_failures: minFailures 
      });

    if (detectError) {
      console.error('[autonomous-safe-mode] Error detecting failure patterns:', detectError);
      throw detectError;
    }

    console.log(`[autonomous-safe-mode] Found ${agentsWithFailures?.length || 0} agents with critical failure patterns`);

    // 3. Processar cada agente
    const results: Array<{ 
      agent_id: string; 
      agent_name: string; 
      success: boolean; 
      reason?: string;
      failure_count: number;
      error_signature: string;
    }> = [];
    let processedCount = 0;

    for (const agent of agentsWithFailures || []) {
      // Verificar se heartbeat está ativo (redundante, mas segurança extra)
      if (!agent.heartbeat_active) {
        console.log(`[autonomous-safe-mode] Skipping ${agent.agent_name}: heartbeat not active`);
        continue;
      }

      console.log(`[autonomous-safe-mode] Processing agent ${agent.agent_name}: ${agent.failure_count} failures of type "${agent.failure_type}"`);

      const actionsExecuted: ActionExecuted[] = [];

      // 3a. Chamar função de entrada em SAFE_MODE
      const { data: entryResult, error: entryError } = await supabase
        .rpc('enter_autonomous_safe_mode', {
          p_agent_id: agent.agent_id,
          p_reason: `Detecção automática: ${agent.failure_count} falhas do tipo "${agent.failure_type}" em ${timeWindowMinutes} minutos`,
          p_failure_type: agent.failure_type,
          p_failure_count: agent.failure_count
        });

      if (entryError) {
        console.error(`[autonomous-safe-mode] Error entering SAFE_MODE for ${agent.agent_name}:`, entryError);
        actionsExecuted.push({ type: 'ENTER_SAFE_MODE', success: false, error: entryError.message });
        results.push({
          agent_id: agent.agent_id,
          agent_name: agent.agent_name,
          success: false,
          reason: entryError.message,
          failure_count: agent.failure_count,
          error_signature: agent.failure_type
        });
        continue;
      }

      console.log(`[autonomous-safe-mode] Agent ${agent.agent_name} entered SAFE_MODE successfully`);
      actionsExecuted.push({ 
        type: 'ENTER_SAFE_MODE', 
        success: true, 
        id: entryResult?.safe_mode_event_id 
      });

      // AI Insight is created by enter_autonomous_safe_mode
      actionsExecuted.push({ 
        type: 'CREATE_AI_INSIGHT', 
        success: true, 
        id: entryResult?.insight_id 
      });

      // System Alert is created by enter_autonomous_safe_mode
      actionsExecuted.push({ 
        type: 'CREATE_SYSTEM_ALERT', 
        success: true, 
        id: entryResult?.alert_id 
      });

      // 3b. Trigger forensic snapshot job
      const { data: snapshotJob, error: snapshotError } = await supabase
        .from('jobs')
        .insert({
          tenant_id: agent.tenant_id,
          agent_id: agent.agent_id,
          job_type: 'forensic_snapshot',
          priority: 'high',
          status: 'pending',
          payload: {
            triggered_by: 'autonomous_safe_mode',
            rule_code: ruleCode,
            failure_pattern: {
              error_signature: agent.failure_type,
              failure_count: agent.failure_count
            }
          }
        })
        .select('id')
        .single();

      if (snapshotError) {
        console.warn(`[autonomous-safe-mode] Failed to create forensic snapshot job:`, snapshotError);
        actionsExecuted.push({ type: 'FORENSIC_SNAPSHOT', success: false, error: snapshotError.message });
      } else {
        console.log(`[autonomous-safe-mode] Forensic snapshot job created: ${snapshotJob?.id}`);
        actionsExecuted.push({ type: 'FORENSIC_SNAPSHOT', success: true, id: snapshotJob?.id });
      }

      // 3c. Enviar notificação
      try {
        const notifyResult = await supabase.functions.invoke('dispatch-notification', {
          body: {
            tenant_id: agent.tenant_id,
            notification_type: 'safe_mode_auto',
            title: `SAFE_MODE Automático: ${agent.agent_name}`,
            message: `O agente ${agent.agent_name} entrou automaticamente em SAFE_MODE após ${agent.failure_count} falhas do tipo "${agent.failure_type}".`,
            severity: 'critical',
            data: {
              agent_id: agent.agent_id,
              agent_name: agent.agent_name,
              failure_type: agent.failure_type,
              failure_count: agent.failure_count,
              rule_code: ruleCode
            }
          }
        });
        actionsExecuted.push({ 
          type: 'SEND_NOTIFICATION', 
          success: !notifyResult.error,
          error: notifyResult.error?.message
        });
      } catch (notifyError) {
        console.warn(`[autonomous-safe-mode] Failed to send notification for ${agent.agent_name}:`, notifyError);
        actionsExecuted.push({ type: 'SEND_NOTIFICATION', success: false, error: String(notifyError) });
      }

      // 4. Record decision event in decision_events table
      const evidence = {
        error_signature: agent.failure_type,
        failure_count: agent.failure_count,
        time_window_minutes: timeWindowMinutes,
        heartbeat_age_seconds: agent.heartbeat_age_seconds || 0,
        agent_version: agent.agent_version,
        detected_at: new Date().toISOString()
      };

      const { error: eventError } = await supabase
        .from('decision_events')
        .insert({
          tenant_id: agent.tenant_id,
          rule_code: ruleCode,
          agent_id: agent.agent_id,
          agent_name: agent.agent_name,
          action: 'ENTER_SAFE_MODE',
          evidence: evidence,
          actions_executed: actionsExecuted
        });

      if (eventError) {
        console.error(`[autonomous-safe-mode] Failed to record decision event:`, eventError);
      } else {
        console.log(`[autonomous-safe-mode] Decision event recorded for agent ${agent.agent_name}`);
      }

      results.push({
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        success: true,
        reason: entryResult?.reason,
        failure_count: agent.failure_count,
        error_signature: agent.failure_type
      });
      processedCount++;
    }

    const response: SafeModeResult = {
      success: true,
      processed_count: processedCount,
      agents: results.filter(r => r.success).map(r => ({
        agent_id: r.agent_id,
        agent_name: r.agent_name,
        reason: r.reason || '',
        failure_count: r.failure_count,
        error_signature: r.error_signature
      })),
      executed_at: new Date().toISOString(),
      rule_code: ruleCode
    };

    console.log(`[autonomous-safe-mode] Completed. Processed ${processedCount} agents.`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[autonomous-safe-mode] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
