/**
 * Sync inlined handlers (migrated from sync-router)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { recordMetric } from '../../_shared/apm.ts';

type SB = ReturnType<typeof createClient>;

export async function handleResetDailyQuotas(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  logger.info(`[reset-daily-quotas][${requestId}] Starting daily quota reset`);
  const { error } = await supabase.from('tenant_features').update({ quota_used: 0 }).eq('feature_key', 'advanced_scans_daily');
  if (error) throw error;
  recordMetric({ function_name: 'reset-daily-quotas', operation_type: 'edge_function', duration_ms: 0, status_code: 200 }).catch(() => {});
  return { success: true, message: 'Daily quotas reset successfully' };
}

export async function handleLogDomainEvent(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const events = Array.isArray(payload) ? payload : [payload];
  if (events.length === 0) return { success: true, inserted: 0 };
  const eventsWithTrace = events.map(e => ({ ...e, trace_id: (e as Record<string, unknown>).trace_id || requestId }));
  const { error } = await supabase.from('domain_events').insert(eventsWithTrace);
  if (error) throw new Error(error.message);
  return { success: true, inserted: events.length };
}

export async function handleHmacCleanupScheduled(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  logger.info(`[hmac-cleanup-scheduled][${requestId}] Starting HMAC cleanup`);
  const { data, error } = await supabase.rpc('cleanup_hmac_nonces');
  if (error) { logger.error(`[hmac-cleanup-scheduled][${requestId}] Error:`, error); throw error; }
  const duration = Date.now() - startedAt;
  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'hmac-cleanup-scheduled', p_success: true, p_duration_ms: duration, p_result: { cleaned: data }, p_processed_count: data || 0, p_job_source: 'cron' }); } catch (err) { logger.warn('[ops-gateway] hmac-cleanup log failed', err); }
  return { success: true, cleaned_nonces: data, duration_ms: duration };
}

export async function handleProcessTenantSuspensions(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  logger.info(`[process-tenant-suspensions][${requestId}] Starting`);
  const { data: suspendedTenants, error } = await supabase.from('tenants').select('id, name').eq('status', 'suspended');
  if (error) throw error;
  let processed = 0;
  for (const tenant of suspendedTenants || []) {
    const { error: agentError } = await supabase.from('agents').update({ status: 'suspended' }).eq('tenant_id', tenant.id).in('status', ['active', 'pending']);
    if (!agentError) processed++;
  }
  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'process-tenant-suspensions', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { tenants_found: suspendedTenants?.length || 0, agents_suspended: processed }, p_processed_count: processed, p_job_source: 'cron' }); } catch (err) { logger.warn('[ops-gateway] tenant-suspensions log failed', err); }
  return { success: true, tenants_processed: suspendedTenants?.length || 0, agents_suspended: processed };
}

export async function handleScheduledComplianceRefresh(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  logger.info(`[scheduled-compliance-refresh][${requestId}] Starting compliance refresh`);
  const { data, error } = await supabase.rpc('refresh_compliance_scores');
  if (error) throw error;
  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'scheduled-compliance-refresh', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { refreshed: data }, p_processed_count: data || 0, p_job_source: 'cron' }); } catch (err) { logger.warn('[ops-gateway] compliance-refresh log failed', err); }
  return { success: true, refreshed: data, duration_ms: Date.now() - startedAt };
}

export async function handleFlushEventBuffer(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();
  logger.info(`[flush-event-buffer][${requestId}] Starting event buffer flush`);
  const { data, error } = await supabase.rpc('flush_event_buffer');
  if (error) throw error;
  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'flush-event-buffer', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { flushed: data }, p_processed_count: data || 0, p_job_source: 'cron' }); } catch (err) { logger.warn('[ops-gateway] flush-event-buffer log failed', err); }
  return { success: true, flushed: data, duration_ms: Date.now() - startedAt };
}
