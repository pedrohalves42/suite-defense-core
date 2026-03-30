/**
 * Pure helper functions for ai-full-audit (score governance, binary criteria)
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

export function calculateDeterministicScore(metrics: Record<string, unknown>): number {
  let score = 70;
  const agents = (metrics?.agents || {}) as Record<string, number>;
  const aiActions = (metrics?.ai_actions || {}) as Record<string, number>;
  const dlq = (metrics?.dlq || {}) as Record<string, number>;
  const criticalAlerts = (metrics?.critical_alerts || {}) as Record<string, number>;
  const users = (metrics?.users || {}) as Record<string, number>;
  const alerts = (metrics?.alerts || {}) as Record<string, number>;

  if (agents.offline > 0) score -= Math.min(agents.offline * 5, 15);
  if (aiActions.total > 0 && (aiActions.approval_rate || 0) === 0) score -= 15;
  if (aiActions.total > 10 && (aiActions.human_reviewed || 0) === 0) score -= 10;
  if ((users.count || 0) <= 1) score -= 2;
  if (dlq.current > 0) score -= Math.min(dlq.current * 5, 10);
  if (criticalAlerts.open > 0) score -= Math.min(criticalAlerts.open * 3, 9);

  if (alerts.decision_coverage_percent === 100) score += 5;
  if ((metrics?.evidence_chain as Record<string, unknown>)?.healthy === true) score += 5;
  if ((aiActions.shadow_validation_rate || 0) > 50) score += 3;
  if (dlq.resolution_rate === 100) score += 3;
  if (aiActions.total > 0 && aiActions.approval_rate === 100) score += 5;
  if (aiActions.total > 0 && aiActions.human_reviewed === aiActions.total) score += 3;

  return Math.max(20, Math.min(100, score));
}

export function calculateRiskFactor(redScore: number): number {
  return Math.max(0.7, 1 - (redScore / 333));
}

export function calculateBinaryCriteria(metrics: Record<string, unknown>): Record<string, boolean> {
  const agents = (metrics?.agents || {}) as Record<string, number>;
  const aiActions = (metrics?.ai_actions || {}) as Record<string, number>;
  const rollbacks = (metrics?.rollbacks || {}) as Record<string, number>;
  const users = (metrics?.users || {}) as Record<string, number>;
  const dlq = (metrics?.dlq || {}) as Record<string, number>;
  const criticalAlerts = (metrics?.critical_alerts || {}) as Record<string, number>;

  return {
    offline_agents_exist: (agents.offline || 0) > 0,
    human_approval_rate_zero: (aiActions.approval_rate || 0) === 0 || (aiActions.approved || 0) === 0,
    human_reviewed_zero: (aiActions.human_reviewed || 0) === 0,
    rollback_never_tested: (rollbacks.total || 0) === 0,
    single_user_system: (users.count || 0) <= 1,
    dlq_has_items: (dlq.current || 0) > 0,
    critical_alerts_open: (criticalAlerts.open || 0) > 0,
  };
}

export function getDeterministicThreatLevel(criteriaCountTrue: number): string {
  if (criteriaCountTrue >= 4) return 'critical';
  if (criteriaCountTrue === 3) return 'high';
  if (criteriaCountTrue === 2) return 'medium';
  return 'low';
}

export function isCreditsExhausted(error?: string): boolean {
  if (!error) return false;
  return error.includes('402') || error.toLowerCase().includes('credits') || error.includes('All AI providers failed');
}

export function isRateLimited(error?: string): boolean {
  if (!error) return false;
  return error.includes('429') || error.toLowerCase().includes('rate limit');
}

export async function logGovernanceEvent(
  supabase: SupabaseClient,
  tenantId: string,
  auditId: string | null,
  eventType: string,
  previousValue: number | null,
  newValue: number,
  ruleApplied: string,
  justification: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.from('score_governance_log').insert({
      tenant_id: tenantId, audit_id: auditId, event_type: eventType,
      previous_value: previousValue, new_value: newValue,
      delta: previousValue !== null ? newValue - previousValue : null,
      rule_applied: ruleApplied, justification, metadata,
    });
  } catch (err) {
    logger.warn('[ai-full-audit] Failed to log governance event:', err);
  }
}
