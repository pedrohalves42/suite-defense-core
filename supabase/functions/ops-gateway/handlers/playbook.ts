/**
 * Playbook inlined handler (migrated from playbook-router)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

type SB = ReturnType<typeof createClient>;

export async function handleAutoTriageInsights(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  logger.info(`[auto-triage-insights][${requestId}] Starting auto-triage...`);
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: updated, error } = await supabase.from('ai_insights').update({
    acknowledged: true, acknowledged_at: new Date().toISOString(),
    metadata: { auto_triaged: true, auto_triage_reason: 'informational insight older than 7 days', auto_triaged_at: new Date().toISOString() },
  }).eq('acknowledged', false).in('severity', ['info', 'warning']).lt('created_at', sevenDaysAgo.toISOString()).select('id');

  if (error) throw error;
  const triagedCount = updated?.length || 0;

  if (triagedCount > 0) {
    try { await supabase.from('audit_logs').insert({ action: 'auto_triage_insights', resource_type: 'ai_insight', resource_id: 'system_cron', details: { triaged_count: triagedCount, insight_ids: updated?.map(i => i.id) || [] }, success: true, trace_id: requestId }); } catch (err) { logger.warn('[ops-gateway] audit log failed', err); }
  }

  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'auto-triage-insights', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { triaged: triagedCount }, p_processed_count: triagedCount, p_job_source: 'cron' }); } catch (err) { logger.warn('[ops-gateway] log_scheduled_job_run failed', err); }
  return { success: true, triaged: triagedCount, message: `Auto-triaged ${triagedCount} informational insights`, duration_ms: Date.now() - startedAt };
}
