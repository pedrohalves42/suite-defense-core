/**
 * auto-triage-insights - Auto-triages old informational insights
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();

  logger.info(`[auto-triage-insights][${requestId}] Starting auto-triage of old informational insights...`);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: updated, error: updateError } = await supabase
    .from('ai_insights')
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      metadata: {
        auto_triaged: true,
        auto_triage_reason: 'informational insight older than 7 days',
        auto_triaged_at: new Date().toISOString()
      }
    })
    .eq('acknowledged', false)
    .in('severity', ['info', 'warning'])
    .lt('created_at', sevenDaysAgo.toISOString())
    .select('id');

  if (updateError) {
    logger.error(`[auto-triage-insights][${requestId}] Error updating insights:`, updateError);
    throw updateError;
  }

  const triagedCount = updated?.length || 0;
  logger.info(`[auto-triage-insights][${requestId}] Auto-triaged ${triagedCount} insights`);

  if (triagedCount > 0) {
    try {
      await supabase.from('audit_logs').insert({
        action: 'auto_triage_insights',
        resource_type: 'ai_insight',
        resource_id: 'system_cron',
        details: {
          triaged_count: triagedCount,
          insight_ids: updated?.map(i => i.id) || [],
          description: `Auto-triaged ${triagedCount} informational insights older than 7 days`
        },
        success: true
      });
    } catch (auditError) {
      logger.warn(`[auto-triage-insights][${requestId}] Audit log failed (non-blocking):`, auditError);
    }
  }

  const durationMs = Date.now() - startedAt;

  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'auto-triage-insights',
      p_success: true,
      p_duration_ms: durationMs,
      p_result: { triaged: triagedCount, insight_ids: updated?.map(i => i.id) || [] },
      p_processed_count: triagedCount,
      p_job_source: 'cron'
    });
  } catch (logErr) {
    logger.warn(`[auto-triage-insights][${requestId}] Failed to log job run:`, logErr);
  }

  return { success: true, triaged: triagedCount, message: `Auto-triaged ${triagedCount} informational insights`, duration_ms: durationMs };
});
