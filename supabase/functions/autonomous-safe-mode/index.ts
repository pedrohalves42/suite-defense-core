/**
 * autonomous-safe-mode — Rules Engine Orchestrator
 * Migrated to serveInternal middleware + modular rule processors
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import type { RuleResult, EngineResult, RuleRecord } from './types.ts';
import {
  processSafeModeRule,
  processThrottleRule,
  processImprodutiveRule,
  processAutoRevertThrottle,
} from './rules/agent-health.ts';
import {
  processIsolateRule,
  processVersionBlockRule,
  processBlockedAccessPatternRule,
  processAgentDivergentRule,
} from './rules/security.ts';
import {
  processSilentFailureDetection,
  processSlowJobsRule,
  processIgnoredInsightsRule,
  processProgressiveDegradationRule,
} from './rules/quality.ts';

/** Rule code → handler map */
const RULE_HANDLERS: Record<string, (sb: SupabaseClient, rule: RuleRecord) => Promise<RuleResult>> = {
  'SAFE_MODE_RULE_001': processSafeModeRule,
  'AGENT_THROTTLE_002': processThrottleRule,
  'AGENT_ISOLATE_003': processIsolateRule,
  'UPDATE_BLOCK_004': processVersionBlockRule,
  'AGENT_IMPRODUTIVE_005': processImprodutiveRule,
  'AUTO_REVERT_THROTTLE_006': processAutoRevertThrottle,
  'SILENT_FAILURE_007': processSilentFailureDetection,
  'JOB_SLOW_008': processSlowJobsRule,
  'INSIGHT_IGNORED_009': processIgnoredInsightsRule,
  'BLOCKED_ACCESS_PATTERN_010': processBlockedAccessPatternRule,
  'AGENT_DIVERGENT_011': processAgentDivergentRule,
  'PROGRESSIVE_DEGRADATION_012': processProgressiveDegradationRule,
};

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();

  // KILL SWITCH CHECK (ADR-FINAL)
  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') {
    logger.info(`[autonomous-safe-mode][${requestId}] SYSTEM_HALTED: Kill switch active`);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'SYSTEM_HALTED',
        message: 'Kill switch is active. Set system_state.mode to normal to resume.'
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.debug(`[rules-engine][${requestId}] Starting multi-rule evaluation...`);

  const { data: rules, error: rulesError } = await supabase
    .from('decision_rules')
    .select('*')
    .eq('is_enabled', true)
    .order('code');

  if (rulesError) {
    logger.error(`[rules-engine][${requestId}] Error fetching rules:`, rulesError);
    throw rulesError;
  }

  logger.debug(`[rules-engine][${requestId}] Found ${rules?.length || 0} enabled rules`);

  const allResults: RuleResult[] = [];
  let totalActions = 0;

  for (const rule of (rules || []) as RuleRecord[]) {
    const handler = RULE_HANDLERS[rule.code];
    if (!handler) {
      logger.debug(`[rules-engine][${requestId}] Unknown rule code: ${rule.code}, skipping`);
      continue;
    }

    try {
      const result = await handler(supabase, rule);
      if (result.processed_count > 0) {
        allResults.push(result);
        totalActions += result.processed_count;
      }
    } catch (ruleError) {
      logger.error(`[rules-engine][${requestId}] Error processing rule ${rule.code}:`, ruleError);
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

  logger.info(`[rules-engine][${requestId}] Completed. Evaluated ${rules?.length || 0} rules, executed ${totalActions} actions in ${durationMs}ms.`);

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
    logger.warn(`[rules-engine][${requestId}] Failed to log job run:`, logErr);
  }

  return response;
});
