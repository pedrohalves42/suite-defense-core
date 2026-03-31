/**
 * compute-compliance-benchmarks → Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  logger.info(`[${requestId}] Computing benchmarks for period ${periodMonth}`);

  const { data: tenants } = await supabase.from('tenant_subscriptions').select('tenant_id').in('status', ['active', 'trialing']);
  if (!tenants?.length) return { message: 'No active tenants' };

  const tenantIds = [...new Set(tenants.map(t => t.tenant_id))];
  const scores: number[] = [];
  const categoryScores: Record<string, number[]> = {};

  for (const tenantId of tenantIds) {
    const score = await calculateTenantComplianceScore(supabase, tenantId);
    if (score !== null) {
      scores.push(score.overall);
      for (const [cat, val] of Object.entries(score.categories)) {
        if (!categoryScores[cat]) categoryScores[cat] = [];
        categoryScores[cat].push(val as number);
      }
    }
  }

  if (scores.length === 0) return { message: 'No scores computed' };

  scores.sort((a, b) => a - b);
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const median = scores.length % 2 === 0 ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2 : scores[Math.floor(scores.length / 2)];

  const catAvg: Record<string, number> = {};
  for (const [cat, vals] of Object.entries(categoryScores)) {
    catAvg[cat] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }

  await supabase.from('compliance_benchmarks').upsert({
    industry_segment: 'all', period_month: periodMonth,
    avg_score: Math.round(avg * 10) / 10, median_score: Math.round(median * 10) / 10,
    min_score: Math.round(scores[0] * 10) / 10, max_score: Math.round(scores[scores.length - 1] * 10) / 10,
    tenant_count: scores.length, category_averages: catAvg,
  }, { onConflict: 'industry_segment,period_month' });

  const result = { period: periodMonth, tenant_count: scores.length, avg_score: Math.round(avg * 10) / 10, median_score: Math.round(median * 10) / 10, min_score: Math.round(scores[0] * 10) / 10, max_score: Math.round(scores[scores.length - 1] * 10) / 10, categories: catAvg };
  logger.info(`[${requestId}] Success:`, result);
  return result;
});

async function calculateTenantComplianceScore(supabase: SupabaseClient, tenantId: string): Promise<{ overall: number; categories: Record<string, number> } | null> {
  try {
    const categories: Record<string, number> = {};
    const { data: agents } = await supabase.from('agents').select('id, status').eq('tenant_id', tenantId);
    const totalAgents = agents?.length || 0;
    const activeAgents = agents?.filter((a: Record<string, unknown>) => a.status === 'active').length || 0;
    categories['agent_coverage'] = totalAgents > 0 ? Math.round((activeAgents / totalAgents) * 100) : 0;

    const { data: alerts } = await supabase.from('system_alerts').select('id, acknowledged').eq('tenant_id', tenantId).limit(100);
    const totalAlerts = alerts?.length || 0;
    categories['alert_response'] = totalAlerts > 0 ? Math.round((alerts?.filter((a: Record<string, unknown>) => a.acknowledged).length || 0) / totalAlerts * 100) : 100;

    const { data: jobs } = await supabase.from('jobs').select('id, status').eq('tenant_id', tenantId).limit(500);
    const totalJobs = jobs?.length || 0;
    categories['job_reliability'] = totalJobs > 0 ? Math.round((jobs?.filter((j: Record<string, unknown>) => j.status === 'completed').length || 0) / totalJobs * 100) : 0;

    const { count: evidenceCount } = await supabase.from('agent_evidence_logs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    categories['evidence_coverage'] = Math.min(100, Math.round(((evidenceCount || 0) / 50) * 100));

    const { count: threatCount } = await supabase.from('threat_indicators').select('id', { count: 'exact', head: true }).eq('is_active', true);
    categories['threat_intelligence'] = (threatCount || 0) > 0 ? 100 : 0;

    const weights: Record<string, number> = { agent_coverage: 0.25, alert_response: 0.20, job_reliability: 0.20, evidence_coverage: 0.20, threat_intelligence: 0.15 };
    let overall = 0;
    for (const [cat, weight] of Object.entries(weights)) overall += (categories[cat] || 0) * weight;
    return { overall: Math.round(overall), categories };
  } catch (error) { logger.error(`[compute-compliance-benchmarks] Error for tenant ${tenantId}:`, error); return null; }
}
