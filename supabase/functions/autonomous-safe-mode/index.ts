import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

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

  const startedAt = Date.now();

  try {
    // Parse body to check source
    let body: { source?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine for cron calls
    }

    // Validate origin - accept if:
    // 1. source === 'cron' (scheduled pg_cron call)
    // 2. Has valid internal secret header
    // 3. Has valid JWT auth header
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const isCronCall = body.source === 'cron';
    const isInternalCall = internalSecret && internalSecret === expectedSecret;
    const authHeader = req.headers.get('Authorization');
    
    if (!isCronCall && !isInternalCall && !authHeader) {
      logger.warn('[autonomous-safe-mode] Unauthorized: No valid origin');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.debug(`[autonomous-safe-mode] Authorized call from: ${isCronCall ? 'cron' : isInternalCall ? 'internal' : 'jwt'}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // KILL SWITCH CHECK (ADR-FINAL) - Halt all automation if system is in halt_jobs mode
    const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
    if (systemMode === 'halt_jobs') {
      logger.info('[autonomous-safe-mode] SYSTEM_HALTED: Kill switch active, skipping rules evaluation');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SYSTEM_HALTED', 
          message: 'Kill switch is active. Set system_state.mode to normal to resume.' 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.debug('[rules-engine] Starting multi-rule evaluation...');

    // Fetch all enabled rules
    const { data: rules, error: rulesError } = await supabase
      .from('decision_rules')
      .select('*')
      .eq('is_enabled', true)
      .order('code');

    if (rulesError) {
      logger.error('[rules-engine] Error fetching rules:', rulesError);
      throw rulesError;
    }

    logger.debug(`[rules-engine] Found ${rules?.length || 0} enabled rules`);

    const allResults: RuleResult[] = [];
    let totalActions = 0;

    // Process each rule
    for (const rule of rules || []) {
      logger.debug(`[rules-engine] Evaluating rule: ${rule.code}`);
      
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

          case 'SILENT_FAILURE_007':
            const silentResult = await processSilentFailureDetection(supabase, rule);
            if (silentResult.processed_count > 0) {
              allResults.push(silentResult);
              totalActions += silentResult.processed_count;
            }
            break;

          case 'JOB_SLOW_008':
            const slowJobResult = await processSlowJobsRule(supabase, rule);
            if (slowJobResult.processed_count > 0) {
              allResults.push(slowJobResult);
              totalActions += slowJobResult.processed_count;
            }
            break;

          case 'INSIGHT_IGNORED_009':
            const ignoredResult = await processIgnoredInsightsRule(supabase, rule);
            if (ignoredResult.processed_count > 0) {
              allResults.push(ignoredResult);
              totalActions += ignoredResult.processed_count;
            }
            break;

          case 'BLOCKED_ACCESS_PATTERN_010':
            const blockedAccessResult = await processBlockedAccessPatternRule(supabase, rule);
            if (blockedAccessResult.processed_count > 0) {
              allResults.push(blockedAccessResult);
              totalActions += blockedAccessResult.processed_count;
            }
            break;

          case 'AGENT_DIVERGENT_011':
            const divergentResult = await processAgentDivergentRule(supabase, rule);
            if (divergentResult.processed_count > 0) {
              allResults.push(divergentResult);
              totalActions += divergentResult.processed_count;
            }
            break;

          case 'PROGRESSIVE_DEGRADATION_012':
            const degradationResult = await processProgressiveDegradationRule(supabase, rule);
            if (degradationResult.processed_count > 0) {
              allResults.push(degradationResult);
              totalActions += degradationResult.processed_count;
            }
            break;
            
          default:
            logger.debug(`[rules-engine] Unknown rule code: ${rule.code}, skipping`);
        }
      } catch (ruleError) {
        logger.error(`[rules-engine] Error processing rule ${rule.code}:`, ruleError);
      }
    }

    const durationMs = Date.now() - startedAt;
    const response: EngineResult = {
      success: true,
      rules_evaluated: rules?.length || 0,
      total_actions: totalActions,
      results: allResults,
      executed_at: new Date().toISOString()
    };

    logger.info(`[rules-engine] Completed. Evaluated ${rules?.length || 0} rules, executed ${totalActions} actions in ${durationMs}ms.`);

    // Log successful job execution
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'autonomous-safe-mode',
        p_success: true,
        p_duration_ms: durationMs,
        p_result: {
          rules_evaluated: rules?.length || 0,
          total_actions: totalActions,
          rules_triggered: allResults.map(r => r.rule_code),
        },
        p_processed_count: totalActions,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      logger.warn('[rules-engine] Failed to log job run:', logErr);
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.error('[rules-engine] Fatal error:', error);

    // Log failed job execution
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'autonomous-safe-mode',
        p_success: false,
        p_duration_ms: durationMs,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      logger.warn('[rules-engine] Failed to log error:', logErr);
    }

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

  logger.debug(`[SAFE_MODE_RULE_001] Detecting failure patterns (window: ${timeWindowMinutes}min, threshold: ${minFailures})`);

  // Detect agents with critical failure patterns
  const { data: agentsWithFailures, error: detectError } = await supabase
    .rpc('detect_critical_failure_pattern', { 
      p_window_minutes: timeWindowMinutes, 
      p_min_failures: minFailures 
    });

  if (detectError) {
    logger.error('[SAFE_MODE_RULE_001] Error detecting failure patterns:', detectError);
    throw detectError;
  }

  logger.debug(`[SAFE_MODE_RULE_001] Found ${agentsWithFailures?.length || 0} candidates`);

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
      logger.error(`[SAFE_MODE_RULE_001] Error for ${agent.agent_name}:`, entryError);
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
      decision_source: 'system',
      decision_type: 'autonomous',
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

  logger.debug(`[AGENT_THROTTLE_002] Detecting throttle candidates`);

  const { data: candidates, error } = await supabase
    .rpc('detect_throttle_candidates', {
      p_requests_per_minute: conditions.requests_per_minute,
      p_time_window_minutes: conditions.time_window_minutes
    });

  if (error) {
    logger.error('[AGENT_THROTTLE_002] Detection error:', error);
    throw error;
  }

  logger.debug(`[AGENT_THROTTLE_002] Found ${candidates?.length || 0} candidates`);

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
      logger.error(`[AGENT_THROTTLE_002] Error throttling ${candidate.agent_name}:`, throttleError);
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
      decision_source: 'system',
      decision_type: 'autonomous',
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

    logger.debug(`[AGENT_THROTTLE_002] Throttled agent ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

async function processIsolateRule(supabase: any, rule: any): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    suspicious_events_count: 5,
    time_window_minutes: 10
  };

  logger.debug(`[AGENT_ISOLATE_003] Detecting isolation candidates`);

  const { data: candidates, error } = await supabase
    .rpc('detect_isolation_candidates', {
      p_suspicious_events_count: conditions.suspicious_events_count,
      p_time_window_minutes: conditions.time_window_minutes
    });

  if (error) {
    logger.error('[AGENT_ISOLATE_003] Detection error:', error);
    throw error;
  }

  logger.debug(`[AGENT_ISOLATE_003] Found ${candidates?.length || 0} candidates`);

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
      logger.error(`[AGENT_ISOLATE_003] Error isolating ${candidate.agent_name}:`, isolateError);
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
      decision_source: 'system',
      decision_type: 'autonomous',
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

    logger.debug(`[AGENT_ISOLATE_003] Isolated agent ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

async function processVersionBlockRule(supabase: any, rule: any): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    failure_rate_percent: 30,
    affected_agents_count: 3,
    time_window_hours: 24
  };

  logger.debug(`[UPDATE_BLOCK_004] Detecting problematic versions`);

  const { data: candidates, error } = await supabase
    .rpc('detect_version_block_candidates', {
      p_failure_rate_percent: conditions.failure_rate_percent,
      p_affected_agents_count: conditions.affected_agents_count,
      p_time_window_hours: conditions.time_window_hours
    });

  if (error) {
    logger.error('[UPDATE_BLOCK_004] Detection error:', error);
    throw error;
  }

  logger.debug(`[UPDATE_BLOCK_004] Found ${candidates?.length || 0} problematic versions`);

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
      logger.error(`[UPDATE_BLOCK_004] Error blocking version ${candidate.version}:`, blockError);
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

    logger.debug(`[UPDATE_BLOCK_004] Blocked version ${candidate.version} for ${candidate.platform}`);
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

  logger.debug(`[AGENT_IMPRODUTIVE_005] Detecting improdutive agents`);

  // Usar RPC que detecta agentes improdutivos
  const { data: candidates, error } = await supabase
    .rpc('detect_improdutive_agents');

  if (error) {
    logger.error('[AGENT_IMPRODUTIVE_005] Detection error:', error);
    throw error;
  }

  logger.debug(`[AGENT_IMPRODUTIVE_005] Found ${candidates?.length || 0} improdutive agents`);

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
      logger.error(`[AGENT_IMPRODUTIVE_005] Error throttling ${candidate.agent_name}:`, throttleError);
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
      decision_source: 'system',
      decision_type: 'autonomous',
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

    logger.debug(`[AGENT_IMPRODUTIVE_005] Throttled improdutive agent ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

// =============================================================
// AUTO_REVERT_THROTTLE_006: Remove throttle após estabilização
// =============================================================
async function processAutoRevertThrottle(supabase: any, rule: any): Promise<RuleResult> {
  logger.debug('[AUTO_REVERT_THROTTLE_006] Checking revert candidates');

  const { data: candidates, error } = await supabase
    .rpc('detect_throttle_revert_candidates');

  if (error) {
    logger.error('[AUTO_REVERT_THROTTLE_006] Detection error:', error);
    throw error;
  }

  logger.debug(`[AUTO_REVERT_THROTTLE_006] Found ${candidates?.length || 0} revert candidates`);

  const agents: RuleResult['agents'] = [];

  for (const candidate of candidates || []) {
    const actionsExecuted: ActionExecuted[] = [];

    // Remove throttle
    const { error: revertError } = await supabase
      .rpc('remove_agent_throttle', {
        p_agent_id: candidate.agent_id
      });

    if (revertError) {
      logger.error(`[AUTO_REVERT_THROTTLE_006] Error reverting ${candidate.agent_name}:`, revertError);
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
      decision_source: 'system',
      decision_type: 'autonomous',
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

    logger.debug(`[AUTO_REVERT_THROTTLE_006] Reverted throttle for ${candidate.agent_name}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

// =============================================================
// SILENT_FAILURE_007: Detecta jobs completed sem dados esperados
// Framework: DETECÇÃO + BLOQUEIO + PROVA AUTOMÁTICA
// =============================================================
async function processSilentFailureDetection(supabase: any, rule: any): Promise<RuleResult> {
  logger.debug('[SILENT_FAILURE_007] Detecting silent job failures');

  const { data: failures, error } = await supabase
    .rpc('detect_silent_job_failures');

  if (error) {
    logger.error('[SILENT_FAILURE_007] Detection error:', error);
    throw error;
  }

  logger.debug(`[SILENT_FAILURE_007] Found ${failures?.length || 0} silent failures`);

  const agents: RuleResult['agents'] = [];
  const processedTenants = new Map<string, typeof failures>();

  // Agrupar por tenant para evitar alertas duplicados
  for (const failure of failures || []) {
    const existing = processedTenants.get(failure.tenant_id) || [];
    existing.push(failure);
    processedTenants.set(failure.tenant_id, existing);
  }

  for (const [tenantId, tenantFailures] of processedTenants) {
    const actionsExecuted: ActionExecuted[] = [];

    // Criar alerta P0
    const { error: alertError } = await supabase.from('system_alerts').insert({
      tenant_id: tenantId,
      alert_type: 'job_integrity_violation',
      severity: 'critical',
      message: `${tenantFailures.length} jobs marcados como completed SEM efeito colateral real detectados`,
      data: {
        violations: tenantFailures.map((f: any) => ({
          job_id: f.job_id,
          job_type: f.job_type,
          agent_id: f.agent_id,
          agent_name: f.agent_name,
          completed_at: f.completed_at,
          violation_type: f.violation_type
        })),
        detected_at: new Date().toISOString(),
        rule_code: rule.code
      },
      resolved: false
    });

    actionsExecuted.push({ 
      type: 'CREATE_SYSTEM_ALERT', 
      success: !alertError,
      error: alertError?.message 
    });

    // Criar AI Insight
    const firstFailure = tenantFailures[0];
    const { error: insightError } = await supabase.from('ai_insights').insert({
      tenant_id: tenantId,
      title: `Falhas silenciosas detectadas: ${tenantFailures.length} jobs`,
      description: `Jobs do tipo ${tenantFailures.map((f: any) => f.job_type).join(', ')} foram marcados como completed mas não produziram dados esperados. Isso indica uma possível falha no pipeline ou dados corrompidos.`,
      severity: 'high',
      insight_type: 'integrity_violation',
      evidence: {
        job_count: tenantFailures.length,
        job_types: [...new Set(tenantFailures.map((f: any) => f.job_type))],
        sample_job_id: firstFailure.job_id,
        detected_at: new Date().toISOString()
      },
      recommendation: 'Investigar logs do submit-job-result. Verificar se os agentes estão enviando dados corretamente. Considerar re-executar os jobs afetados.',
      acknowledged: false
    });

    actionsExecuted.push({ 
      type: 'CREATE_AI_INSIGHT', 
      success: !insightError,
      error: insightError?.message 
    });

    // Record decision event para cada failure
    for (const failure of tenantFailures) {
      await supabase.from('decision_events').insert({
        tenant_id: tenantId,
        rule_code: rule.code,
        agent_id: failure.agent_id,
        agent_name: failure.agent_name || 'Unknown',
        action: 'DETECT_SILENT_FAILURE',
        decision_source: 'system',
        decision_type: 'autonomous',
        evidence: {
          job_id: failure.job_id,
          job_type: failure.job_type,
          completed_at: failure.completed_at,
          violation_type: failure.violation_type,
          detected_at: new Date().toISOString()
        },
        actions_executed: actionsExecuted
      });

      agents.push({
        agent_id: failure.agent_id,
        agent_name: failure.agent_name || 'Unknown',
        action: 'DETECT_SILENT_FAILURE',
        reason: `Job ${failure.job_type} (${failure.job_id}) completed sem dados`
      });
    }

    logger.debug(`[SILENT_FAILURE_007] Created alerts for tenant ${tenantId} with ${tenantFailures.length} violations`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

// =============================================================
// JOB_SLOW_008: Detecta jobs sistematicamente lentos
// =============================================================
async function processSlowJobsRule(supabase: any, rule: any): Promise<RuleResult> {
  logger.debug('[JOB_SLOW_008] Detecting systematically slow jobs');

  // Buscar jobs que consistentemente excedem o p95 de execução
  const { data: slowJobs, error } = await supabase.rpc('detect_slow_jobs', {
    p_time_window_hours: 24,
    p_min_occurrences: 3
  });

  if (error) {
    // RPC might not exist yet, use fallback query
    logger.debug('[JOB_SLOW_008] RPC not available, using fallback query');
    
    const { data: fallbackData } = await supabase
      .from('jobs')
      .select('id, agent_id, agent_name, tenant_id, type, created_at, completed_at, delivered_at')
      .eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .not('completed_at', 'is', null)
      .not('delivered_at', 'is', null)
      .limit(500);

    // Calculate execution times and find slow patterns
    const jobsByType = new Map<string, number[]>();
    for (const job of fallbackData || []) {
      const execTime = new Date(job.completed_at).getTime() - new Date(job.delivered_at).getTime();
      if (!jobsByType.has(job.type)) {
        jobsByType.set(job.type, []);
      }
      jobsByType.get(job.type)!.push(execTime);
    }

    // Find job types with consistently slow execution
    const slowTypes: RuleResult['agents'] = [];
    for (const [jobType, times] of jobsByType) {
      if (times.length >= 3) {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
        
        // If average is > 5 minutes, consider it slow
        if (avg > 5 * 60 * 1000) {
          slowTypes.push({
            agent_id: 'system',
            agent_name: jobType,
            action: 'CREATE_AI_INSIGHT',
            reason: `Job type ${jobType} avg execution: ${Math.round(avg / 1000 / 60)}min`
          });
        }
      }
    }

    if (slowTypes.length > 0) {
      // Create insight for slow jobs
      const firstTenant = fallbackData?.[0]?.tenant_id;
      if (firstTenant) {
        await supabase.from('ai_insights').insert({
          tenant_id: firstTenant,
          title: `Jobs sistematicamente lentos detectados`,
          description: `${slowTypes.length} tipos de jobs estão consistentemente lentos: ${slowTypes.map(s => s.agent_name).join(', ')}`,
          severity: 'medium',
          insight_type: 'job_performance',
          evidence: { slow_job_types: slowTypes },
          recommendation: 'Considere otimizar os scripts dos jobs ou dividir em subtarefas menores.',
          acknowledged: false
        });
      }
    }

    return { rule_code: rule.code, processed_count: slowTypes.length, agents: slowTypes };
  }

  logger.debug(`[JOB_SLOW_008] Found ${slowJobs?.length || 0} slow job patterns`);
  return { rule_code: rule.code, processed_count: slowJobs?.length || 0, agents: [] };
}

// =============================================================
// INSIGHT_IGNORED_009: Escala insights críticos ignorados
// =============================================================
async function processIgnoredInsightsRule(supabase: any, rule: any): Promise<RuleResult> {
  logger.debug('[INSIGHT_IGNORED_009] Checking ignored critical insights');

  // Buscar insights críticos não reconhecidos há mais de 72h
  const cutoffDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  
  const { data: ignoredInsights, error } = await supabase
    .from('ai_insights')
    .select('id, tenant_id, title, severity, created_at')
    .in('severity', ['critical', 'high'])
    .eq('acknowledged', false)
    .lt('created_at', cutoffDate)
    .not('title', 'ilike', '%[ESCALADO]%')
    .limit(50);

  if (error) {
    logger.error('[INSIGHT_IGNORED_009] Query error:', error);
    throw error;
  }

  logger.debug(`[INSIGHT_IGNORED_009] Found ${ignoredInsights?.length || 0} ignored insights`);

  const agents: RuleResult['agents'] = [];

  for (const insight of ignoredInsights || []) {
    // Escalar o insight
    const { error: updateError } = await supabase
      .from('ai_insights')
      .update({
        severity: 'critical',
        title: `[ESCALADO] ${insight.title}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', insight.id);

    if (updateError) {
      logger.error(`[INSIGHT_IGNORED_009] Error escalating insight ${insight.id}:`, updateError);
      continue;
    }

    // Record decision event
    await supabase.from('decision_events').insert({
      tenant_id: insight.tenant_id,
      rule_code: rule.code,
      action: 'ESCALATE_INSIGHT',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        insight_id: insight.id,
        original_severity: insight.severity,
        original_created_at: insight.created_at,
        escalated_at: new Date().toISOString(),
        hours_ignored: Math.round((Date.now() - new Date(insight.created_at).getTime()) / (60 * 60 * 1000))
      },
      actions_executed: [{ type: 'ESCALATE_INSIGHT', success: true }]
    });

    agents.push({
      agent_id: insight.id,
      agent_name: insight.title.substring(0, 50),
      action: 'ESCALATE_INSIGHT',
      reason: `Ignorado por ${Math.round((Date.now() - new Date(insight.created_at).getTime()) / (60 * 60 * 1000))}h`
    });

    logger.debug(`[INSIGHT_IGNORED_009] Escalated insight: ${insight.title}`);
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

// =============================================================
// BLOCKED_ACCESS_PATTERN_010: Detecta padrões suspeitos de acesso bloqueado
// =============================================================
async function processBlockedAccessPatternRule(supabase: any, rule: any): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    min_blocked_attempts: 10,
    time_window_minutes: 30
  };

  logger.debug(`[BLOCKED_ACCESS_PATTERN_010] Detecting blocked access patterns`);

  // Buscar agentes com muitas tentativas bloqueadas
  const cutoffTime = new Date(Date.now() - conditions.time_window_minutes * 60 * 1000).toISOString();
  
  const { data: patterns, error } = await supabase
    .from('blocked_access_attempts')
    .select('agent_id, domain, blocked_by, tenant_id')
    .gte('attempted_at', cutoffTime)
    .limit(1000);

  if (error) {
    logger.error('[BLOCKED_ACCESS_PATTERN_010] Query error:', error);
    // Table might not exist, return empty
    return { rule_code: rule.code, processed_count: 0, agents: [] };
  }

  // Agrupar por agente
  const agentAttempts = new Map<string, { count: number; domains: Set<string>; tenant_id: string }>();
  for (const attempt of patterns || []) {
    if (!agentAttempts.has(attempt.agent_id)) {
      agentAttempts.set(attempt.agent_id, { count: 0, domains: new Set(), tenant_id: attempt.tenant_id });
    }
    const agentData = agentAttempts.get(attempt.agent_id)!;
    agentData.count++;
    agentData.domains.add(attempt.domain);
  }

  // Filtrar agentes que excedem o threshold
  const suspiciousAgents = Array.from(agentAttempts.entries())
    .filter(([_, data]) => data.count >= conditions.min_blocked_attempts);

  logger.debug(`[BLOCKED_ACCESS_PATTERN_010] Found ${suspiciousAgents.length} suspicious agents`);

  const agents: RuleResult['agents'] = [];

  for (const [agentId, data] of suspiciousAgents) {
    // Buscar info do agente
    const { data: agentInfo } = await supabase
      .from('agents')
      .select('agent_name')
      .eq('id', agentId)
      .single();

    const agentName = agentInfo?.agent_name || agentId.substring(0, 8);

    // Criar alerta crítico
    await supabase.from('system_alerts').insert({
      tenant_id: data.tenant_id,
      agent_id: agentId,
      alert_type: 'blocked_access_pattern',
      severity: 'critical',
      message: `Padrão suspeito: ${data.count} tentativas de acesso bloqueado em ${conditions.time_window_minutes}min`,
      data: {
        blocked_count: data.count,
        unique_domains: data.domains.size,
        sample_domains: Array.from(data.domains).slice(0, 5),
        time_window_minutes: conditions.time_window_minutes
      },
      resolved: false
    });

    // Criar insight
    await supabase.from('ai_insights').insert({
      tenant_id: data.tenant_id,
      title: `Padrão suspeito de navegação: ${agentName}`,
      description: `O agente ${agentName} tentou acessar ${data.count} URLs bloqueadas em ${conditions.time_window_minutes} minutos, incluindo ${data.domains.size} domínios únicos.`,
      severity: 'critical',
      insight_type: 'security_threat',
      evidence: {
        blocked_attempts: data.count,
        unique_domains: data.domains.size,
        sample_domains: Array.from(data.domains).slice(0, 10)
      },
      recommendation: 'Investigar o comportamento do usuário. Considerar isolamento temporário do agente.',
      acknowledged: false
    });

    // Record decision event
    await supabase.from('decision_events').insert({
      tenant_id: data.tenant_id,
      rule_code: rule.code,
      agent_id: agentId,
      agent_name: agentName,
      action: 'DETECT_BLOCKED_ACCESS_PATTERN',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        blocked_count: data.count,
        unique_domains: data.domains.size,
        time_window_minutes: conditions.time_window_minutes,
        detected_at: new Date().toISOString()
      },
      actions_executed: [
        { type: 'CREATE_SYSTEM_ALERT', success: true },
        { type: 'CREATE_AI_INSIGHT', success: true }
      ]
    });

    agents.push({
      agent_id: agentId,
      agent_name: agentName,
      action: 'DETECT_BLOCKED_ACCESS_PATTERN',
      reason: `${data.count} tentativas bloqueadas em ${conditions.time_window_minutes}min`
    });
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

// =============================================================
// AGENT_DIVERGENT_011: Detecta agentes com métricas divergentes
// =============================================================
async function processAgentDivergentRule(supabase: any, rule: any): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    deviation_threshold_stddev: 2,
    comparison_window_hours: 24
  };

  logger.debug('[AGENT_DIVERGENT_011] Detecting divergent agents');

  // Buscar métricas recentes de todos os agentes
  const cutoffTime = new Date(Date.now() - conditions.comparison_window_hours * 60 * 60 * 1000).toISOString();
  
  const { data: metrics, error } = await supabase
    .from('agent_system_metrics')
    .select('agent_id, tenant_id, cpu_usage_percent, memory_usage_percent')
    .gte('collected_at', cutoffTime)
    .limit(5000);

  if (error) {
    logger.error('[AGENT_DIVERGENT_011] Query error:', error);
    return { rule_code: rule.code, processed_count: 0, agents: [] };
  }

  // Calcular estatísticas por tenant
  const tenantStats = new Map<string, { cpuValues: number[]; memValues: number[] }>();
  const agentStats = new Map<string, { tenant_id: string; cpuValues: number[]; memValues: number[] }>();

  for (const m of metrics || []) {
    // Tenant stats
    if (!tenantStats.has(m.tenant_id)) {
      tenantStats.set(m.tenant_id, { cpuValues: [], memValues: [] });
    }
    const ts = tenantStats.get(m.tenant_id)!;
    if (m.cpu_usage_percent != null) ts.cpuValues.push(m.cpu_usage_percent);
    if (m.memory_usage_percent != null) ts.memValues.push(m.memory_usage_percent);

    // Agent stats
    if (!agentStats.has(m.agent_id)) {
      agentStats.set(m.agent_id, { tenant_id: m.tenant_id, cpuValues: [], memValues: [] });
    }
    const as = agentStats.get(m.agent_id)!;
    if (m.cpu_usage_percent != null) as.cpuValues.push(m.cpu_usage_percent);
    if (m.memory_usage_percent != null) as.memValues.push(m.memory_usage_percent);
  }

  // Calcular média e desvio padrão por tenant
  const calcStats = (values: number[]) => {
    if (values.length === 0) return { mean: 0, stddev: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return { mean, stddev: Math.sqrt(variance) };
  };

  const tenantCalcStats = new Map<string, { cpu: { mean: number; stddev: number }; mem: { mean: number; stddev: number } }>();
  for (const [tenantId, stats] of tenantStats) {
    tenantCalcStats.set(tenantId, {
      cpu: calcStats(stats.cpuValues),
      mem: calcStats(stats.memValues)
    });
  }

  // Detectar agentes divergentes
  const divergentAgents: { agent_id: string; tenant_id: string; cpuDeviation: number; memDeviation: number }[] = [];

  for (const [agentId, stats] of agentStats) {
    const tenantCalc = tenantCalcStats.get(stats.tenant_id);
    if (!tenantCalc || tenantCalc.cpu.stddev === 0) continue;

    const agentCpuMean = stats.cpuValues.length > 0 ? stats.cpuValues.reduce((a, b) => a + b, 0) / stats.cpuValues.length : 0;
    const agentMemMean = stats.memValues.length > 0 ? stats.memValues.reduce((a, b) => a + b, 0) / stats.memValues.length : 0;

    const cpuDeviation = Math.abs(agentCpuMean - tenantCalc.cpu.mean) / (tenantCalc.cpu.stddev || 1);
    const memDeviation = Math.abs(agentMemMean - tenantCalc.mem.mean) / (tenantCalc.mem.stddev || 1);

    if (cpuDeviation > conditions.deviation_threshold_stddev || memDeviation > conditions.deviation_threshold_stddev) {
      divergentAgents.push({ agent_id: agentId, tenant_id: stats.tenant_id, cpuDeviation, memDeviation });
    }
  }

  logger.debug(`[AGENT_DIVERGENT_011] Found ${divergentAgents.length} divergent agents`);

  const agents: RuleResult['agents'] = [];

  for (const divergent of divergentAgents.slice(0, 10)) {
    // Buscar nome do agente
    const { data: agentInfo } = await supabase
      .from('agents')
      .select('agent_name')
      .eq('id', divergent.agent_id)
      .single();

    const agentName = agentInfo?.agent_name || divergent.agent_id.substring(0, 8);

    // Criar insight
    await supabase.from('ai_insights').insert({
      tenant_id: divergent.tenant_id,
      title: `Agente divergente: ${agentName}`,
      description: `O agente ${agentName} apresenta métricas significativamente diferentes do grupo (CPU: ${divergent.cpuDeviation.toFixed(1)}σ, Memória: ${divergent.memDeviation.toFixed(1)}σ).`,
      severity: 'medium',
      insight_type: 'anomaly_detection',
      evidence: {
        cpu_deviation_stddev: divergent.cpuDeviation,
        memory_deviation_stddev: divergent.memDeviation,
        threshold_stddev: conditions.deviation_threshold_stddev
      },
      recommendation: 'Investigar processos em execução no agente. Pode indicar malware ou uso indevido.',
      acknowledged: false
    });

    // Record decision event
    await supabase.from('decision_events').insert({
      tenant_id: divergent.tenant_id,
      rule_code: rule.code,
      agent_id: divergent.agent_id,
      agent_name: agentName,
      action: 'DETECT_DIVERGENT_AGENT',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        cpu_deviation_stddev: divergent.cpuDeviation,
        memory_deviation_stddev: divergent.memDeviation,
        detected_at: new Date().toISOString()
      },
      actions_executed: [{ type: 'CREATE_AI_INSIGHT', success: true }]
    });

    agents.push({
      agent_id: divergent.agent_id,
      agent_name: agentName,
      action: 'DETECT_DIVERGENT_AGENT',
      reason: `CPU: ${divergent.cpuDeviation.toFixed(1)}σ, Mem: ${divergent.memDeviation.toFixed(1)}σ do grupo`
    });
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}

// =============================================================
// PROGRESSIVE_DEGRADATION_012: Detecta tendência de degradação
// =============================================================
async function processProgressiveDegradationRule(supabase: any, rule: any): Promise<RuleResult> {
  const conditions = rule.definition?.conditions || {
    min_trend_duration_hours: 12,
    degradation_threshold_percent: 20
  };

  logger.debug('[PROGRESSIVE_DEGRADATION_012] Detecting progressive degradation');

  // Comparar métricas de 12h atrás com métricas recentes
  const now = Date.now();
  const oldCutoff = new Date(now - conditions.min_trend_duration_hours * 60 * 60 * 1000);
  const midpoint = new Date(now - (conditions.min_trend_duration_hours / 2) * 60 * 60 * 1000);

  // Buscar jobs e calcular success rate por período
  const { data: oldJobs } = await supabase
    .from('jobs')
    .select('agent_id, tenant_id, status')
    .gte('created_at', oldCutoff.toISOString())
    .lt('created_at', midpoint.toISOString())
    .limit(2000);

  const { data: recentJobs } = await supabase
    .from('jobs')
    .select('agent_id, tenant_id, status')
    .gte('created_at', midpoint.toISOString())
    .limit(2000);

  // Calcular success rate por agente
  const calcSuccessRate = (jobs: any[]) => {
    const agentRates = new Map<string, { success: number; total: number; tenant_id: string }>();
    for (const job of jobs || []) {
      if (!agentRates.has(job.agent_id)) {
        agentRates.set(job.agent_id, { success: 0, total: 0, tenant_id: job.tenant_id });
      }
      const ar = agentRates.get(job.agent_id)!;
      ar.total++;
      if (job.status === 'completed') ar.success++;
    }
    return agentRates;
  };

  const oldRates = calcSuccessRate(oldJobs);
  const recentRates = calcSuccessRate(recentJobs);

  // Detectar agentes com degradação
  const degradingAgents: { agent_id: string; tenant_id: string; oldRate: number; newRate: number; degradation: number }[] = [];

  for (const [agentId, recent] of recentRates) {
    const old = oldRates.get(agentId);
    if (!old || old.total < 3 || recent.total < 3) continue;

    const oldRate = (old.success / old.total) * 100;
    const newRate = (recent.success / recent.total) * 100;
    const degradation = oldRate - newRate;

    if (degradation >= conditions.degradation_threshold_percent) {
      degradingAgents.push({ agent_id: agentId, tenant_id: recent.tenant_id, oldRate, newRate, degradation });
    }
  }

  logger.debug(`[PROGRESSIVE_DEGRADATION_012] Found ${degradingAgents.length} degrading agents`);

  const agents: RuleResult['agents'] = [];

  for (const degrading of degradingAgents.slice(0, 10)) {
    // Buscar nome do agente
    const { data: agentInfo } = await supabase
      .from('agents')
      .select('agent_name')
      .eq('id', degrading.agent_id)
      .single();

    const agentName = agentInfo?.agent_name || degrading.agent_id.substring(0, 8);

    // Criar insight
    await supabase.from('ai_insights').insert({
      tenant_id: degrading.tenant_id,
      title: `Degradação progressiva: ${agentName}`,
      description: `O agente ${agentName} apresenta queda de ${degrading.degradation.toFixed(1)}% na taxa de sucesso (de ${degrading.oldRate.toFixed(1)}% para ${degrading.newRate.toFixed(1)}%).`,
      severity: 'high',
      insight_type: 'prediction',
      evidence: {
        old_success_rate: degrading.oldRate,
        new_success_rate: degrading.newRate,
        degradation_percent: degrading.degradation,
        trend_duration_hours: conditions.min_trend_duration_hours
      },
      recommendation: 'Investigar causa da degradação antes que se torne crítica. Verificar logs de erro e conectividade.',
      acknowledged: false
    });

    // Record decision event
    await supabase.from('decision_events').insert({
      tenant_id: degrading.tenant_id,
      rule_code: rule.code,
      agent_id: degrading.agent_id,
      agent_name: agentName,
      action: 'DETECT_DEGRADATION',
      decision_source: 'system',
      decision_type: 'autonomous',
      evidence: {
        old_success_rate: degrading.oldRate,
        new_success_rate: degrading.newRate,
        degradation_percent: degrading.degradation,
        detected_at: new Date().toISOString()
      },
      actions_executed: [{ type: 'CREATE_AI_INSIGHT', success: true }]
    });

    agents.push({
      agent_id: degrading.agent_id,
      agent_name: agentName,
      action: 'DETECT_DEGRADATION',
      reason: `Taxa de sucesso caiu ${degrading.degradation.toFixed(1)}%`
    });
  }

  return { rule_code: rule.code, processed_count: agents.length, agents };
}
