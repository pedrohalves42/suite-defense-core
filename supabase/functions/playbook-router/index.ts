/**
 * playbook-router — Consolidated Playbook, Automation & SOAR Router (Phase 3: Inlined)
 * 
 * Inlined handlers:
 *   auto-triage-insights
 * 
 * Proxy (complex, has local module deps, or >100 lines):
 *   execute-playbook, execute-playbook-action, evaluate-playbook-triggers,
 *   process-playbook-trigger-logs, evaluate-automation-rules,
 *   auto-execute-ai-actions, auto-remediate, autonomous-safe-mode,
 *   rollback-by-decision-event, rollback-remediation, resolve-action-policy,
 *   soar-engine, oncall-integration, create-itsm-ticket,
 *   run-attack-simulation, calculate-risk-score, evaluate-software-risk
 * 
 * Auth: Mixed (internal for cron, JWT for admin actions)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const FETCH_TIMEOUT_MS = 45000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PROXY_ACTIONS = new Set([
  'execute-playbook', 'execute-playbook-action', 'evaluate-playbook-triggers',
  'process-playbook-trigger-logs', 'evaluate-automation-rules',
  'auto-execute-ai-actions', 'auto-remediate', 'autonomous-safe-mode',
  'rollback-by-decision-event', 'rollback-remediation', 'resolve-action-policy',
  'soar-engine', 'oncall-integration', 'create-itsm-ticket',
  'run-attack-simulation', 'calculate-risk-score', 'evaluate-software-risk',
]);

const VALID_ACTIONS = new Set([...PROXY_ACTIONS, 'auto-triage-insights']);

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

async function handleAutoTriageInsights(supabase: SB, requestId: string) {
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
    try { await supabase.from('audit_logs').insert({ action: 'auto_triage_insights', resource_type: 'ai_insight', resource_id: 'system_cron', details: { triaged_count: triagedCount, insight_ids: updated?.map(i => i.id) || [] }, success: true, trace_id: requestId }); } catch (err) { console.warn('[playbook-router] audit log failed', err); }
  }

  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'auto-triage-insights', p_success: true, p_duration_ms: Date.now() - startedAt, p_result: { triaged: triagedCount }, p_processed_count: triagedCount, p_job_source: 'cron' }); } catch (err) { console.warn('[playbook-router] log_scheduled_job_run failed', err); }
  return { success: true, triaged: triagedCount, message: `Auto-triaged ${triagedCount} informational insights`, duration_ms: Date.now() - startedAt };
}

const INLINED_HANDLERS: Record<string, (supabase: SB, requestId: string, payload: Record<string, unknown>) => Promise<unknown>> = {
  'auto-triage-insights': handleAutoTriageInsights,
};

function forwardHeaders(req: Request, requestId: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Request-ID': requestId };
  for (const name of ['Authorization', 'apikey', 'X-Internal-Secret', 'x-cron-source']) { const v = req.headers.get(name); if (v) h[name] = v; }
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
      logger.info(`[playbook-router] Inline: ${action}`, { requestId });
      const result = await inlinedHandler(supabase, requestId, payload);
      logger.info(`[playbook-router] ${action} done in ${Date.now() - startedAt}ms`);
      return jsonRes(result, 200, origin);
    }

    const url = `${SUPABASE_URL}/functions/v1/${action}`;
    logger.info(`[playbook-router] Proxy: ${action}`, { requestId });
    const response = await fetchWithTimeout(url, { method: 'POST', headers: forwardHeaders(req, requestId), body: JSON.stringify(payload), timeoutMs: FETCH_TIMEOUT_MS });
    const responseData = await response.text();
    logger.info(`[playbook-router] ${action} proxy done in ${Date.now() - startedAt}ms`);
    return new Response(responseData, { status: response.status, headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });

  } catch (err) {
    logger.error('[playbook-router] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown' }, 500, origin);
  }
});
