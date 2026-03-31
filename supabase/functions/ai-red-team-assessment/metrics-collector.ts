import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

/**
 * Collect raw metrics and latest audit summary for Red Team assessment.
 */
export async function collectMetrics(
  supabase: SupabaseClient,
  tenantId: string,
  isInternalCall: boolean,
  userClient?: SupabaseClient,
) {
  const metricsClient = isInternalCall ? supabase : (userClient || supabase);
  const { data: metrics, error: metricsError } = await metricsClient
    .rpc('get_audit_raw_metrics', { p_tenant_id: tenantId });

  if (metricsError) {
    logger.error('Error fetching metrics:', metricsError);
    throw { stage: 'metrics', code: metricsError.code ?? 'unknown', message: metricsError.message ?? 'unknown error' };
  }

  // Get latest audit summary
  const { data: latestAudit } = await supabase
    .from('system_audits')
    .select('executive_summary, recommendation, overall_score')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const anaSummary = latestAudit
    ? `Score: ${latestAudit.overall_score}/100. Recommendation: ${latestAudit.recommendation}. Summary: ${latestAudit.executive_summary}`
    : 'Nenhuma auditoria anterior disponivel.';

  return { metrics, anaSummary };
}
