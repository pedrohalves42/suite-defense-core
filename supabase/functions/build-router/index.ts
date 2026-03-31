/**
 * build-router — Consolidated Build, Release & Enrollment Router (Phase 3)
 * Auth: Mixed, forwarded to sub-functions
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const FETCH_TIMEOUT_MS = 60000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const ACTION_TO_FUNCTION: Record<string, string> = {
  'build-agent-exe': 'build-agent-exe', 'build-callback': 'build-callback',
  'generate-deploy-package': 'generate-deploy-package', 'generate-portable-installer': 'generate-portable-installer',
  'generate-enrollment-key': 'generate-enrollment-key', 'auto-generate-enrollment': 'auto-generate-enrollment',
  'auto-renew-enrollment-keys': 'auto-renew-enrollment-keys', 'revoke-enrollment-key': 'revoke-enrollment-key',
  'register-agent-release': 'register-agent-release', 'sign-release': 'sign-release',
  'upload-release-content': 'upload-release-content', 'validate-build-pipeline': 'validate-build-pipeline',
  'confirm-force-update': 'confirm-force-update', 'get-diagnostic-script': 'get-diagnostic-script',
  'serve-installer': 'serve-installer',
};
const VALID_ACTIONS = new Set(Object.keys(ACTION_TO_FUNCTION));
const RouterSchema = z.object({ action: z.string().min(1).max(60), payload: z.record(z.unknown()).optional().default({}) });

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), { status, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
}
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
    const targetFn = ACTION_TO_FUNCTION[action];
    const url = `${SUPABASE_URL}/functions/v1/${targetFn}`;
    logger.info(`[build-router] Routing ${action} → ${targetFn}`, { requestId });
    const response = await fetchWithTimeout(url, { method: 'POST', headers: forwardHeaders(req, requestId), body: JSON.stringify(payload), timeoutMs: FETCH_TIMEOUT_MS });
    const responseData = await response.text();
    logger.info(`[build-router] ${action} done in ${Date.now() - startedAt}ms (status: ${response.status})`);
    return new Response(responseData, { status: response.status, headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });
  } catch (err) {
    logger.error('[build-router] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown' }, 500, origin);
  }
});
