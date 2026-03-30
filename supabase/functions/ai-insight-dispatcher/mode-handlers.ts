import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import type { AIInsight } from './types.ts';
import { isLowRiskAction, isActionWhitelisted, checkAutoExecutionRateLimit } from './action-guards.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

const headers = (origin: string | null) => ({ ...buildCorsHeaders(origin), 'Content-Type': 'application/json' });

export async function handleAutoExecute(supabase: SupabaseClient, insight: AIInsight, origin: string | null): Promise<Response> {
  const recommendedActions = insight.recommended_actions || [];
  const firstAction = recommendedActions[0] as { action_type?: string } | undefined;
  const actionType = firstAction?.action_type || 'unknown';

  const isLowRisk = isLowRiskAction(actionType);
  const isWhitelisted = await isActionWhitelisted(supabase, actionType);
  const withinRateLimit = await checkAutoExecutionRateLimit(supabase, insight.tenant_id);

  logger.info('[ai-insight-dispatcher] Auto-execute checks:', { actionType, isLowRisk, isWhitelisted, withinRateLimit });

  if (isLowRisk && isWhitelisted && withinRateLimit) {
    try {
      const { data: execResult, error: execError } = await supabase.functions.invoke('ai-action-executor', {
        body: {
          insight_id: insight.id, tenant_id: insight.tenant_id, action_type: actionType,
          context: { agent_id: insight.agent_id, insight_type: insight.insight_type, evidence: insight.evidence, auto_executed: true },
        },
      });

      if (!execError) {
        await supabase.from('ai_insights').update({ auto_action_executed: true, auto_action_executed_at: new Date().toISOString() }).eq('id', insight.id);
        return new Response(JSON.stringify({ success: true, action: 'auto_executed', result: execResult }), { headers: headers(origin) });
      }
      logger.error('[ai-insight-dispatcher] Auto-execute error:', execError);
    } catch (execErr) {
      logger.error('[ai-insight-dispatcher] Execution exception:', execErr);
    }
  }

  const reason = !isLowRisk ? 'high_risk_action' : !isWhitelisted ? 'not_whitelisted' : 'rate_limited';
  return new Response(JSON.stringify({ success: true, action: 'suggested', reason }), { headers: headers(origin) });
}

export async function handleAutoWithApproval(supabase: SupabaseClient, insight: AIInsight, origin: string | null): Promise<Response> {
  const { data: playbook, error: playbookError } = await supabase
    .from('playbooks').select('id').eq('tenant_id', insight.tenant_id).eq('trigger_type', insight.insight_type).eq('is_enabled', true).maybeSingle();
  if (playbookError) logger.error('[ai-insight-dispatcher] Playbook lookup error:', playbookError);

  if (playbook) {
    const { error: execCreateError } = await supabase.from('playbook_executions').insert({
      tenant_id: insight.tenant_id, playbook_id: playbook.id, agent_id: insight.agent_id, status: 'pending', trigger_source: 'ai_insight',
      trigger_context: { insight_id: insight.id, insight_type: insight.insight_type, severity: insight.severity, evidence: insight.evidence, recommendation: insight.recommendation },
      risk_score: Math.round(insight.confidence_score * 100),
    });
    if (execCreateError) logger.error('[ai-insight-dispatcher] Create execution error:', execCreateError);
    else logger.info('[ai-insight-dispatcher] Pending execution created');
  }

  return new Response(JSON.stringify({ success: true, action: 'pending_approval', playbook_found: !!playbook }), { headers: headers(origin) });
}
