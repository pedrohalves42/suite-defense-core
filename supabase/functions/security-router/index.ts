/**
 * security-router — Consolidated Security Operations Router (Phase 3)
 * Auth: Mixed (internal for cron, JWT for admin), forwarded to sub-functions
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const FETCH_TIMEOUT_MS = 30000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ACTION_TO_FUNCTION: Record<string, string> = {
  'auto-block-threats': 'auto-block-threats', 'auto-quarantine': 'auto-quarantine',
  'quarantine-agent': 'quarantine-agent', 'apply-security-patch': 'apply-security-patch',
  'check-credential-leaks': 'check-credential-leaks', 'check-failed-logins': 'check-failed-logins',
  'clear-failed-logins': 'clear-failed-logins', 'record-failed-login': 'record-failed-login',
  'detect-blocked-attempts': 'detect-blocked-attempts', 'security-monitor': 'security-monitor',
  'security-alert-dispatcher': 'security-alert-dispatcher', 'build-security-graph': 'build-security-graph',
  'populate-security-graph': 'populate-security-graph', 'integrity-sentinel': 'integrity-sentinel',
  'verify-log-integrity': 'verify-log-integrity', 'classify-shadow-it': 'classify-shadow-it',
  'scan-virus': 'scan-virus', 'scan-vulnerabilities': 'scan-vulnerabilities',
  'fetch-nvd-cves': 'fetch-nvd-cves', 'translate-cve': 'translate-cve',
  'sync-cve-database': 'sync-cve-database', 'publish-threat-ioc': 'publish-threat-ioc',
  'threat-intelligence-lookup': 'threat-intelligence-lookup', 'correlate-edr-events': 'correlate-edr-events',
  'evaluate-edr-detections': 'evaluate-edr-detections', 'mitre-sync': 'mitre-sync',
  'siem-export': 'siem-export', 'run-rls-tests': 'run-rls-tests',
  'security-advisor': 'security-advisor',
  'security-cleanup': 'cleanup-router',
};

const VALID_ACTIONS = new Set(Object.keys(ACTION_TO_FUNCTION));
const RouterSchema = z.object({ action: z.string().min(1).max(60), payload: z.record(z.unknown()).optional().default({}) });

type SB = ReturnType<typeof createClient>;

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), { status, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
}

// Inlined: security-cleanup-cron (was just a proxy to cleanup-router)
async function handleSecurityCleanup(supabase: SB, requestId: string) {
  logger.info(`[security-router][${requestId}] Inline security-cleanup → cleanup-router`);
  const url = `${SUPABASE_URL}/functions/v1/cleanup-router`;
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ action: 'security' }),
  });
  return await resp.json();
}

const INLINED_HANDLERS: Record<string, (supabase: SB, requestId: string) => Promise<unknown>> = {
  'security-cleanup': handleSecurityCleanup,
};

function forwardHeaders(req: Request, requestId: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Request-ID': requestId };
  for (const name of ['Authorization', 'apikey', 'X-Internal-Secret', 'X-Agent-Token', 'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce', 'x-cron-source']) { const v = req.headers.get(name); if (v) h[name] = v; }
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
      const result = await inlinedHandler(supabase, requestId);
      logger.info(`[security-router] ${action} inline done in ${Date.now() - startedAt}ms`);
      return jsonRes(result, 200, origin);
    }

    const targetFn = ACTION_TO_FUNCTION[action];
    const url = `${SUPABASE_URL}/functions/v1/${targetFn}`;
    logger.info(`[security-router] Proxy ${action} → ${targetFn}`, { requestId });
    const response = await fetchWithTimeout(url, { method: 'POST', headers: forwardHeaders(req, requestId), body: JSON.stringify(payload), timeoutMs: FETCH_TIMEOUT_MS });
    const responseData = await response.text();
    logger.info(`[security-router] ${action} done in ${Date.now() - startedAt}ms (status: ${response.status})`);
    return new Response(responseData, { status: response.status, headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });
  } catch (err) {
    logger.error('[security-router] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown' }, 500, origin);
  }
});
