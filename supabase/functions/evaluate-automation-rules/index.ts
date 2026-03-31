/**
 * evaluate-automation-rules — Migrated to serveInternal middleware
 * Enterprise Engine v2
 *
 * NOTE: Uses serveInternal because it's primarily invoked by cron (service_role).
 * For admin-triggered evaluations, the caller should use X-Internal-Secret.
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { evaluateForTenant } from './tenant-evaluator.ts';

serveInternal(async (req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const { tenant_id } = body as { tenant_id?: string };

  // Auto-discover tenants if none specified (cron mode)
  if (!tenant_id) {
    const { data: tenants } = await supabase.from('tenants').select('id').limit(50);

    if (!tenants || tenants.length === 0) {
      return { message: 'No tenants found' };
    }

    let totalEvaluated = 0, totalTriggered = 0, totalBlocked = 0, totalDecisions = 0;
    const riskScores: Record<string, number> = {};

    for (const t of tenants) {
      const result = await evaluateForTenant(supabase, t.id);
      totalEvaluated += result.evaluated;
      totalTriggered += result.triggered;
      totalBlocked += result.blocked;
      totalDecisions += result.decisions;
      if (result.risk_score != null) riskScores[t.id] = result.risk_score;
    }

    try {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'evaluate-automation-rules-5min', p_success: true,
        p_details: { tenants: tenants.length, evaluated: totalEvaluated, triggered: totalTriggered, blocked: totalBlocked, decisions: totalDecisions },
      });
    } catch (e) { logger.warn('[evaluate-automation-rules] Failed to update cron health:', e); }

    logger.info(`[Enterprise Engine v2] ${tenants.length} tenants | ${totalEvaluated} rules | ${totalTriggered} triggered | ${totalBlocked} blocked | ${totalDecisions} decisions`);

    return {
      tenants_processed: tenants.length, evaluated: totalEvaluated,
      triggered: totalTriggered, blocked: totalBlocked, decisions: totalDecisions, risk_scores: riskScores,
    };
  }

  const result = await evaluateForTenant(supabase, tenant_id);

  try {
    await supabase.rpc('update_cron_health', { p_cron_name: 'evaluate-automation-rules-5min', p_success: true, p_details: result });
  } catch (e) { logger.warn('[evaluate-automation-rules] cron health update failed:', e); }

  logger.info(`[Enterprise Engine v2] tenant=${tenant_id} | ${result.evaluated} rules | ${result.triggered} triggered | ${result.blocked} blocked | ${result.decisions} decisions | risk=${result.risk_score ?? 'n/a'}`);

  return result;
});
