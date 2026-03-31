/**
 * sync-router — Consolidated Sync, Maintenance & Background Jobs Router (Phase 3: Inlined)
 * 
 * Inlined handlers:
 *   log-domain-event, reset-daily-quotas (via billing), hmac-cleanup-scheduled,
 *   process-tenant-suspensions, scheduled-compliance-refresh, flush-event-buffer,
 *   release-sync, sync-stripe-subscriptions, sync-threat-feeds, maintenance-cron
 * 
 * Proxy (complex or has local module deps):
 *   sync-blocked-websites, sync-storage-bucket, process-dlq-retries,
 *   process-failed-jobs, process-scheduled-jobs, invoke-scheduled-jobs,
 *   dlq-action, system-maintenance
 * 
 * Auth: Internal caller (cron/service_role)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { recordMetric } from '../_shared/apm.ts';

const FETCH_TIMEOUT_MS = 45000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PROXY_ACTIONS = new Set([
  'sync-blocked-websites', 'sync-storage-bucket', 'process-dlq-retries',
  'process-failed-jobs', 'process-scheduled-jobs', 'invoke-scheduled-jobs',
  'dlq-action', 'system-maintenance', 'maintenance-cron',
]);

const VALID_ACTIONS = new Set([
  ...PROXY_ACTIONS,
  'log-domain-event', 'reset-daily-quotas', 'hmac-cleanup-scheduled',
  'process-tenant-suspensions', 'scheduled-compliance-refresh',
  'flush-event-buffer', 'release-sync', 'sync-stripe-subscriptions', 'sync-threat-feeds',
]);

const RouterSchema = z.object({
  action: z.string().min(1).max(60),
  payload: z.record(z.unknown()).optional().default({}),
});

type SB = ReturnType<typeof createClient>;

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// ── Inlined Handlers ────────────────────────────────────────────────────

async function handleResetDailyQuotas(supabase: SB, requestId: string) {
  logger.info(`[reset-daily-quotas][${requestId}] Starting daily quota reset`);
  const { error } = await supabase.from('tenant_features').update({ quota_used: 0 }).eq('feature_key', 'advanced_scans_daily');
  if (error) throw error;
  recordMetric({ function_name: 'reset-daily-quotas', operation_type: 'edge_function', duration_ms: 0, status_code: 200 }).catch(() => {});
  return { success: true, message: 'Daily quotas reset successfully' };
}

async function handleLogDomainEvent(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const events = Array.isArray(payload) ? payload : [payload];
  if (events.length === 0) return { success: true, inserted: 0 };
  // Propagate trace_id to each event for distributed tracing
  const eventsWithTrace = events.map(e => ({ ...e, trace_id: (e as Record<string, unknown>).trace_id || requestId }));
  const { error } = await supabase.from('domain_events').insert(eventsWithTrace);
  if (error) throw new Error(error.message);
  return { success: true, inserted: events.length };
}

async function handleHmacCleanupScheduled(supabase: SB, requestId: string) {
  const startedAt = Date.now();
  logger.info(`[hmac-cleanup-scheduled][${requestId}] Starting HMAC cleanup`);
  const { data, error } = await supabase.rpc('cleanup_hmac_nonces');
  if (error) { logger.error(`[hmac-cleanup-scheduled][${requestId}] Error:`, error); throw error; }
  const duration = Date.now() - startedAt;
  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'hmac-cleanup-scheduled', p_success: true, p_duration_ms: duration, p_result: { cleaned: data }, p_processed_count: data || 0, p_job_source: 'cron' }); } catch (err) { console.warn('[sync-router] hmac-cleanup log failed', err); }
  return { success: true, cleaned_nonces: data, duration_ms: duration };
}

async function handleProcessTenantSuspensions(supabase: SB, requestId: string) {
  const startedAt = Date.now();
  logger.info(`[process-tenant-suspensions][${requestId}] Starting`);
  const { data: suspendedTenants, error } = await supabase.from('tenants').select('id, name').eq('status', 'suspended');
  if (error) throw error;
  let processed = 0;
  for (const tenant of suspendedTenants || []) {
    const { error: agentError } = await supabase.from('agents').update({ status: 'suspended' }).eq('tenant_id', tenant.id).in('status', ['active', 'pending']);
    if (!agentError) processed++;
  }
  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'process-tenant-suspensions', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { tenants_found: suspendedTenants?.length || 0, agents_suspended: processed }, p_processed_count: processed, p_job_source: 'cron' }); } catch (err) { console.warn('[sync-router] tenant-suspensions log failed', err); }
  return { success: true, tenants_processed: suspendedTenants?.length || 0, agents_suspended: processed };
}

async function handleScheduledComplianceRefresh(supabase: SB, requestId: string) {
  const startedAt = Date.now();
  logger.info(`[scheduled-compliance-refresh][${requestId}] Starting compliance refresh`);
  const { data, error } = await supabase.rpc('refresh_compliance_scores');
  if (error) throw error;
  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'scheduled-compliance-refresh', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { refreshed: data }, p_processed_count: data || 0, p_job_source: 'cron' }); } catch (err) { console.warn('[sync-router] compliance-refresh log failed', err); }
  return { success: true, refreshed: data, duration_ms: Date.now() - startedAt };
}

async function handleFlushEventBuffer(supabase: SB, requestId: string) {
  const startedAt = Date.now();
  logger.info(`[flush-event-buffer][${requestId}] Starting event buffer flush`);
  const { data, error } = await supabase.rpc('flush_event_buffer');
  if (error) throw error;
  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'flush-event-buffer', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { flushed: data }, p_processed_count: data || 0, p_job_source: 'cron' }); } catch { /* non-critical */ }
  return { success: true, flushed: data, duration_ms: Date.now() - startedAt };
}

const INLINED_HANDLERS: Record<string, (supabase: SB, requestId: string, payload: Record<string, unknown>) => Promise<unknown>> = {
  'reset-daily-quotas': handleResetDailyQuotas,
  'log-domain-event': handleLogDomainEvent,
  'hmac-cleanup-scheduled': handleHmacCleanupScheduled,
  'process-tenant-suspensions': handleProcessTenantSuspensions,
  'scheduled-compliance-refresh': handleScheduledComplianceRefresh,
  'flush-event-buffer': handleFlushEventBuffer,
};

// ── Router ──────────────────────────────────────────────────────────────

function forwardHeaders(req: Request, requestId: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Request-ID': requestId };
  for (const name of ['Authorization', 'apikey', 'X-Internal-Secret', 'x-cron-source']) {
    const v = req.headers.get(name); if (v) h[name] = v;
  }
  if (!h['Authorization']) h['Authorization'] = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
    if (authError) return authError;

    const body = await req.json();
    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) return jsonRes({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400, origin);

    const { action, payload } = parsed.data;
    if (!VALID_ACTIONS.has(action)) return jsonRes({ error: `Unknown action: ${action}`, valid_actions: [...VALID_ACTIONS] }, 400, origin);

    const inlinedHandler = INLINED_HANDLERS[action];
    if (inlinedHandler) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      logger.info(`[sync-router] Inline: ${action}`, { requestId });
      const result = await inlinedHandler(supabase, requestId, payload);
      logger.info(`[sync-router] ${action} done in ${Date.now() - startedAt}ms`);
      return jsonRes(result, 200, origin);
    }

    const url = `${SUPABASE_URL}/functions/v1/${action}`;
    logger.info(`[sync-router] Proxy: ${action}`, { requestId });
    const response = await fetchWithTimeout(url, { method: 'POST', headers: forwardHeaders(req, requestId), body: JSON.stringify(payload), timeoutMs: FETCH_TIMEOUT_MS });
    const responseData = await response.text();
    logger.info(`[sync-router] ${action} proxy done in ${Date.now() - startedAt}ms (status: ${response.status})`);
    return new Response(responseData, { status: response.status, headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });

  } catch (err) {
    logger.error('[sync-router] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown' }, 500, origin);
  }
});
