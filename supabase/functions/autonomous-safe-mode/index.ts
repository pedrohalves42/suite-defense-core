import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

interface RuleResult {
  rule_code: string;
  processed_count: number;
  agents: Array<{
    agent_id: string;
    agent_name: string;
    action: string;
    reason: string;
  }>;
}

interface EngineResult {
  success: boolean;
  rules_evaluated: number;
  total_actions: number;
  results: RuleResult[];
  executed_at: string;
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
        console.log('[rules-engine] Unauthorized: No auth header');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[rules-engine] Starting multi-rule evaluation...');

    // Fetch all enabled rules
    const { data: rules, error: rulesError } = await supabase
      .from('decision_rules')
      .select('*')
      .eq('is_enabled', true)
      .order('code');

    if (rulesError) {
      console.error('[rules-engine] Error fetching rules:', rulesError);
      throw rulesError;
    }

    console.log(`[rules-engine] Found ${rules?.length || 0} enabled rules`);

    const allResults: RuleResult[] = [];
    let totalActions = 0;

    // Process each rule
    for (const rule of rules || []) {
      console.log(`[rules-engine] Evaluating rule: ${rule.code}`);
      
      try {
        switch (rule.code) {
          case 'SAFE_MODE_RULE_001':
            const safeModeResult = await processSafeModeRule(supabase, rule);
            if (safeModeResult.processed_count > 0) {
              allResults.push(safeModeResult);
              totalActions += safeModeResult.processed_count;
            }
            break;
            
          case 'AGENT_THROTTLE_002':
            const throttleResult = await processThrottleRule(supabase, rule);
            if (throttleResult.processed_count > 0) {
              allResults.push(throttleResult);
              totalActions += throttleResult.processed_count;
            }
            break;
            
          case 'AGENT_ISOLATE_003':
            const isolateResult = await processIsolateRule(supabase, rule);
            if (isolateResult.processed_count > 0) {
              allResults.push(isolateResult);
              totalActions += isolateResult.processed_count;
            }
            break;
            
          case 'UPDATE_BLOCK_004':
            const blockResult = await processVersionBlockRule(supabase, rule);
            if (blockResult.processed_count > 0) {
              allResults.push(blockResult);
              totalActions += blockResult.processed_count;
            }
            break;
            
          case 'AGENT_IMPRODUTIVE_005':
            const improdutiveResult = await processImprodutiveRule(supabase, rule);
            if (improdutiveResult.processed_count > 0) {
              allResults.push(improdutiveResult);
              totalActions += improdutiveResult.processed_count;
            }
            break;

          case 'AUTO_REVERT_THROTTLE_006':
            const revertResult = await processAutoRevertThrottle(supabase, rule);
            if (revertResult.processed_count > 0) {
              allResults.push(revertResult);
              totalActions += revertResult.processed_count;
            }
            break;
            
          default:
            console.log(`[rules-engine] Unknown rule code: ${rule.code}, skipping`);
        }
      } catch (ruleError) {
        console.error(`[rules-engine] Error processing rule ${rule.code}:`, ruleError);
      }
    }

    const response: EngineResult = {
      success: true,
      rules_evaluated: rules?.length || 0,
      total_actions: totalActions,
      results: allResults,
      executed_at: new Date().toISOString()
    };

    console.log(`[rules-engine] Completed. Evaluated ${rules?.length || 0} rules, executed ${totalActions} actions.`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[rules-engine] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============= RULE PROCESSORS =============

async function processSafeModeRule(supabase: any, rule: any): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    time_window_minutes: 10,
    min_failures: 3,
    heartbeat_max_age_seconds: 300
  };

  const timeWindowMinutes = conditions.time_window_minutes || 10;
  const minFailures = conditions.min_failures || 3;

  console.log(`[SAFE_MODE_RULE_001] Detecting failure patterns (window: ${timeWindowMinutes}min, threshold: ${minFailures})`);

  // Detect agents with critical failure patterns
  const { data: agentsWithFailures, error: detectError } = await supabase
    .rpc('detect_critical_failure_pattern', { 
      p_window_minutes: timeWindowMinutes, 
      p_min_failures: minFailures 
    });

  if (detectError) {
    console.error('[SAFE_MODE_RULE_001] Error detecting failure patterns:', detectError);
    throw detectError;
  }

  console.log(`[SAFE_MODE_RULE_001] Found ${agentsWithFailures?.length || 0} candidates`);

  const agents: RuleResult['agents'] = [];

  for (const agent of agentsWithFailures || []) {
    if (!agent.heartbeat_active) continue;

    const actionsExecuted: ActionExecuted[] = [];

    // Enter SAFE_MODE
    const { data: entryResult, error: entryError } = await supabase
      .rpc('enter_autonomous_safe_mode', {
        p_agent_id: agent.agent_id,
        p_reason: `Detecção automática: ${agent.failure_count} falhas do tipo "${agent.failure_type}" em ${timeWindowMinutes} minutos`,
        p_failure_type: agent.failure_type,
        p_failure_count: agent.failure_count
      });

    if (entryError) {
      console.error(`[SAFE_MODE_RULE_001] Error for ${agent.agent_name}:`, entryError);
      continue;
    }

    actionsExecuted.push({ type: 'ENTER_SAFE_MODE', success: true, id: entryResult?.safe_mode_event_id });
    actionsExecuted.push({ type: 'CREATE_AI_INSIGHT', success: true, id: entryResult?.insight_id });
    actionsExecuted.push({ type: 'CREATE_SYSTEM_ALERT', success: true, id: entryResult?.alert_id });

    // Create forensic snapshot job
    const { data: snapshotJob, error: snapshotError } = await supabase
      .from('jobs')
      .insert({
        tenant_id: agent.tenant_id,
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        type: 'forensic_snapshot',
        status: 'queued',
        approved: true,
        payload: {
          triggered_by: 'autonomous_safe_mode',
          rule_code: rule.code,
          failure_pattern: { error_signature: agent.failure_type, failure_count: agent.failure_count }
        }
      })
      .select('id')
      .single();

    actionsExecuted.push({ 
      type: 'FORENSIC_SNAPSHOT', 
      success: !snapshotError, 
      id: snapshotJob?.id,
      error: snapshotError?.message 
    });

    // Send notification
    try {
      await supabase.functions.invoke('dispatch-notification', {
        body: {
          tenant_id: agent.tenant_id,
          notification_type: 'safe_mode_auto',
          title: `SAFE_MODE Automático: ${agent.agent_name}`,
          message: `O agente ${agent.agent_name} entrou automaticamente em SAFE_MODE após ${agent.failure_count} falhas.`,
          severity: 'critical',
          data: { agent_id: agent.agent_id, agent_name: agent.agent_name, rule_code: rule.code }
        }
      });
      actionsExecuted.push({ type: 'SEND_NOTIFICATION', success: true });
    } catch (e) {
      actionsExecuted.push({ type: 'SEND_NOTIFICATION', success: false, error: String(e) });
    }

    // Record decision event
    await supabase.from('decision_events').insert({
      tenant_id: agent.tenant_id,
      rule_code: rule.code,
      agent_id: agent.agent_id,
      agent_name: agent.agent_name,
      action: 'ENTER_SAFE_MODE',
      evidence: {
        error_signature: agent.failure_type,
        failure_count: agent.failure_count,
        time_window_minutes: timeWindowMinutes,
        agent_version: agent.agent_version,
        detected_at: new Date().toISOString()
      },
      actions_executed: actionsExecuted
    });

    agents.push({
      agent_id: agent.agent_id,
      agent_name: agent.agent_name,
      action: 'ENTER_SAFE_MODE',
      reason: `${agent.failure_count} falhas do tipo "${agent.failure_type}"`
    });
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

async function processThrottleRule(supabase: any, rule: any): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    requests_per_minute: 60,
    error_rate_percent: 50,
    time_window_minutes: 5
  };
  const params = rule.definition?.parameters || { poll_interval_seconds: 300 };

  console.log(`[AGENT_THROTTLE_002] Detecting throttle candidates`);

  const { data: candidates, error } = await supabase
    .rpc('detect_throttle_candidates', {
      p_requests_per_minute: conditions.requests_per_minute,
      p_time_window_minutes: conditions.time_window_minutes
    });

  if (error) {
    console.error('[AGENT_THROTTLE_002] Detection error:', error);
    throw error;
  }

  console.log(`[AGENT_THROTTLE_002] Found ${candidates?.length || 0} candidates`);

  const agents: RuleResult['agents'] = [];

  for (const candidate of candidates || []) {
    const actionsExecuted: ActionExecuted[] = [];

    // Apply throttle
    const { error: throttleError } = await supabase
      .rpc('apply_agent_throttle', {
        p_agent_id: candidate.agent_id,
        p_poll_interval_seconds: params.poll_interval_seconds,
        p_reason: `Alta taxa de requisições: ${candidate.request_count} requests, ${candidate.error_rate}% erros`
      });

    if (throttleError) {
      console.error(`[AGENT_THROTTLE_002] Error throttling ${candidate.agent_name}:`, throttleError);
      continue;
    }

    actionsExecuted.push({ type: 'APPLY_THROTTLE', success: true });

    // Record decision event
    await supabase.from('decision_events').insert({
      tenant_id: candidate.tenant_id,
      rule_code: rule.code,
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'THROTTLE',
      evidence: {
        request_count: candidate.request_count,
        error_count: candidate.error_count,
        error_rate: candidate.error_rate,
        new_poll_interval: params.poll_interval_seconds,
        detected_at: new Date().toISOString()
      },
      actions_executed: actionsExecuted
    });

    agents.push({
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'THROTTLE',
      reason: `${candidate.request_count} requests, ${candidate.error_rate}% taxa de erro`
    });

    console.log(`[AGENT_THROTTLE_002] Throttled agent ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

async function processIsolateRule(supabase: any, rule: any): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    suspicious_events_count: 5,
    time_window_minutes: 10
  };

  console.log(`[AGENT_ISOLATE_003] Detecting isolation candidates`);

  const { data: candidates, error } = await supabase
    .rpc('detect_isolation_candidates', {
      p_suspicious_events_count: conditions.suspicious_events_count,
      p_time_window_minutes: conditions.time_window_minutes
    });

  if (error) {
    console.error('[AGENT_ISOLATE_003] Detection error:', error);
    throw error;
  }

  console.log(`[AGENT_ISOLATE_003] Found ${candidates?.length || 0} candidates`);

  const agents: RuleResult['agents'] = [];

  for (const candidate of candidates || []) {
    const actionsExecuted: ActionExecuted[] = [];

    // Apply isolation
    const { error: isolateError } = await supabase
      .rpc('apply_agent_isolation', {
        p_agent_id: candidate.agent_id,
        p_reason: `Ameaça de segurança: ${candidate.event_count} eventos suspeitos detectados`
      });

    if (isolateError) {
      console.error(`[AGENT_ISOLATE_003] Error isolating ${candidate.agent_name}:`, isolateError);
      continue;
    }

    actionsExecuted.push({ type: 'APPLY_ISOLATION', success: true });
    actionsExecuted.push({ type: 'CANCEL_PENDING_JOBS', success: true });

    // Create security event
    await supabase.from('security_events').insert({
      tenant_id: candidate.tenant_id,
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      event_type: 'agent_isolated',
      severity: 'critical',
      title: `Agente Isolado: ${candidate.agent_name}`,
      description: `Agente isolado automaticamente devido a ${candidate.event_count} eventos de segurança suspeitos.`,
      status: 'open',
      data: {
        rule_code: rule.code,
        event_types: candidate.event_types,
        event_count: candidate.event_count
      }
    });

    actionsExecuted.push({ type: 'CREATE_SECURITY_EVENT', success: true });

    // Record decision event
    await supabase.from('decision_events').insert({
      tenant_id: candidate.tenant_id,
      rule_code: rule.code,
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'ISOLATE',
      evidence: {
        event_count: candidate.event_count,
        event_types: candidate.event_types,
        detected_at: new Date().toISOString()
      },
      actions_executed: actionsExecuted
    });

    agents.push({
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'ISOLATE',
      reason: `${candidate.event_count} eventos de segurança suspeitos`
    });

    console.log(`[AGENT_ISOLATE_003] Isolated agent ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

async function processVersionBlockRule(supabase: any, rule: any): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    failure_rate_percent: 30,
    affected_agents_count: 3,
    time_window_hours: 24
  };

  console.log(`[UPDATE_BLOCK_004] Detecting problematic versions`);

  const { data: candidates, error } = await supabase
    .rpc('detect_version_block_candidates', {
      p_failure_rate_percent: conditions.failure_rate_percent,
      p_affected_agents_count: conditions.affected_agents_count,
      p_time_window_hours: conditions.time_window_hours
    });

  if (error) {
    console.error('[UPDATE_BLOCK_004] Detection error:', error);
    throw error;
  }

  console.log(`[UPDATE_BLOCK_004] Found ${candidates?.length || 0} problematic versions`);

  const agents: RuleResult['agents'] = [];

  for (const candidate of candidates || []) {
    const actionsExecuted: ActionExecuted[] = [];

    // Block the version
    const { error: blockError } = await supabase
      .rpc('apply_version_block', {
        p_version: candidate.version,
        p_platform: candidate.platform,
        p_reason: `Alta taxa de falhas: ${candidate.failure_rate}% em ${candidate.total_agents} agentes`,
        p_blocked_by: 'rules_engine'
      });

    if (blockError) {
      console.error(`[UPDATE_BLOCK_004] Error blocking version ${candidate.version}:`, blockError);
      continue;
    }

    actionsExecuted.push({ type: 'BLOCK_VERSION', success: true });

    // Note: decision_events requires tenant_id, so we skip recording for global version blocks
    // These are logged via agent_versions.blocked_* columns instead

    agents.push({
      agent_id: candidate.version_id || 'N/A',
      agent_name: `${candidate.version} (${candidate.platform})`,
      action: 'BLOCK_VERSION',
      reason: `${candidate.failure_rate}% taxa de falha em ${candidate.total_agents} agentes`
    });

    console.log(`[UPDATE_BLOCK_004] Blocked version ${candidate.version} for ${candidate.platform}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

// =============================================================
// AGENT_IMPRODUTIVE_005: Throttle de agentes improdutivos
// =============================================================
async function processImprodutiveRule(supabase: any, rule: any): Promise<RuleResult> {
  const params = rule.definition?.parameters || { 
    poll_interval_seconds: 300,
    auto_revert_after_hours: 2
  };

  console.log(`[AGENT_IMPRODUTIVE_005] Detecting improdutive agents`);

  // Usar RPC que detecta agentes improdutivos
  const { data: candidates, error } = await supabase
    .rpc('detect_improdutive_agents');

  if (error) {
    console.error('[AGENT_IMPRODUTIVE_005] Detection error:', error);
    throw error;
  }

  console.log(`[AGENT_IMPRODUTIVE_005] Found ${candidates?.length || 0} improdutive agents`);

  const agents: RuleResult['agents'] = [];

  for (const candidate of candidates || []) {
    const actionsExecuted: ActionExecuted[] = [];

    // Apply throttle (ação reversível)
    const { error: throttleError } = await supabase
      .rpc('apply_agent_throttle', {
        p_agent_id: candidate.agent_id,
        p_poll_interval_seconds: params.poll_interval_seconds,
        p_reason: `Improdutivo: ${candidate.stale_queued_jobs || 0} jobs parados, ${Math.round(candidate.minutes_since_execution || 0)}min sem execução`
      });

    if (throttleError) {
      console.error(`[AGENT_IMPRODUTIVE_005] Error throttling ${candidate.agent_name}:`, throttleError);
      actionsExecuted.push({ type: 'APPLY_THROTTLE', success: false, error: throttleError.message });
      continue;
    }

    actionsExecuted.push({ type: 'APPLY_THROTTLE', success: true });

    // Create AI Insight para visibilidade
    const { error: insightError } = await supabase.from('ai_insights').insert({
      tenant_id: candidate.tenant_id,
      title: `Agente improdutivo: ${candidate.agent_name}`,
      description: `O agente está online mas não processa jobs há ${Math.round(candidate.minutes_since_execution || 0)} minutos. Foi aplicado throttle automático (poll interval: ${params.poll_interval_seconds}s) que será revertido automaticamente em ${params.auto_revert_after_hours}h.`,
      severity: 'medium',
      insight_type: 'agent_improdutive',
      evidence: {
        health_status: candidate.health_status,
        stale_queued_jobs: candidate.stale_queued_jobs,
        pending_jobs: candidate.pending_jobs,
        minutes_since_execution: candidate.minutes_since_execution
      },
      recommendation: 'Verifique se o agente está com problemas de conectividade ou se há bloqueios no sistema.',
      acknowledged: false
    });

    actionsExecuted.push({ 
      type: 'CREATE_AI_INSIGHT', 
      success: !insightError,
      error: insightError?.message 
    });

    // Record decision event (auditoria completa)
    await supabase.from('decision_events').insert({
      tenant_id: candidate.tenant_id,
      rule_code: rule.code,
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'THROTTLE',
      evidence: {
        health_status: candidate.health_status,
        minutes_since_heartbeat: candidate.minutes_since_heartbeat,
        minutes_since_execution: candidate.minutes_since_execution,
        stale_queued_jobs: candidate.stale_queued_jobs,
        pending_jobs: candidate.pending_jobs,
        new_poll_interval: params.poll_interval_seconds,
        auto_revert_scheduled: true,
        auto_revert_after_hours: params.auto_revert_after_hours,
        detected_at: new Date().toISOString()
      },
      actions_executed: actionsExecuted
    });

    agents.push({
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'THROTTLE',
      reason: `Improdutivo: ${candidate.stale_queued_jobs || 0} jobs parados, ${Math.round(candidate.minutes_since_execution || 0)}min sem execução`
    });

    console.log(`[AGENT_IMPRODUTIVE_005] Throttled improdutive agent ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

// =============================================================
// AUTO_REVERT_THROTTLE_006: Remove throttle após estabilização
// =============================================================
async function processAutoRevertThrottle(supabase: any, rule: any): Promise<RuleResult> {
  console.log('[AUTO_REVERT_THROTTLE_006] Checking revert candidates');

  const { data: candidates, error } = await supabase
    .rpc('detect_throttle_revert_candidates');

  if (error) {
    console.error('[AUTO_REVERT_THROTTLE_006] Detection error:', error);
    throw error;
  }

  console.log(`[AUTO_REVERT_THROTTLE_006] Found ${candidates?.length || 0} revert candidates`);

  const agents: RuleResult['agents'] = [];

  for (const candidate of candidates || []) {
    const actionsExecuted: ActionExecuted[] = [];

    // Remove throttle
    const { error: revertError } = await supabase
      .rpc('remove_agent_throttle', {
        p_agent_id: candidate.agent_id
      });

    if (revertError) {
      console.error(`[AUTO_REVERT_THROTTLE_006] Error reverting ${candidate.agent_name}:`, revertError);
      actionsExecuted.push({ type: 'REMOVE_THROTTLE', success: false, error: revertError.message });
      continue;
    }

    actionsExecuted.push({ type: 'REMOVE_THROTTLE', success: true });

    // Create AI Insight
    const { error: insightError } = await supabase.from('ai_insights').insert({
      tenant_id: candidate.tenant_id,
      title: `Throttle removido: ${candidate.agent_name}`,
      description: `O agente voltou a executar jobs normalmente (última execução: ${Math.round(candidate.minutes_since_execution || 0)}min, pending: ${candidate.pending_jobs}) e teve o throttle removido automaticamente após cooldown de 2h.`,
      severity: 'low',
      insight_type: 'agent_recovered',
      evidence: {
        throttled_at: candidate.throttled_at,
        minutes_since_execution: candidate.minutes_since_execution,
        pending_jobs: candidate.pending_jobs,
        reverted_at: new Date().toISOString()
      },
      recommendation: 'Nenhuma ação necessária. O agente está operando normalmente.',
      acknowledged: false
    });

    actionsExecuted.push({ 
      type: 'CREATE_AI_INSIGHT', 
      success: !insightError,
      error: insightError?.message 
    });

    // Record decision event
    await supabase.from('decision_events').insert({
      tenant_id: candidate.tenant_id,
      rule_code: rule.code,
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'REMOVE_THROTTLE',
      evidence: {
        throttled_at: candidate.throttled_at,
        minutes_since_execution: candidate.minutes_since_execution,
        pending_jobs: candidate.pending_jobs,
        cooldown_hours: 2,
        reverted_at: new Date().toISOString()
      },
      actions_executed: actionsExecuted
    });

    agents.push({
      agent_id: candidate.agent_id,
      agent_name: candidate.agent_name,
      action: 'REMOVE_THROTTLE',
      reason: 'Estabilização confirmada após cooldown de 2h'
    });

    console.log(`[AUTO_REVERT_THROTTLE_006] Reverted throttle for ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}
