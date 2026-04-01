/**
 * ops-router — Unified Operations Meta-Router (Phase 5)
 *
 * Now routes to 2 gateways instead of 11 individual routers:
 *   - api-gateway: admin, billing, security, build, agent namespaces
 *   - ops-gateway: check, sync, playbook, report, cleanup, notify namespaces
 *
 * Kept routers (different middleware, not consolidated):
 *   - ai-router (serveTenant middleware)
 *   - submit-router (serveAgent middleware)
 *   - collect-router (serveAgent middleware)
 *   - cleanup-router (complex handler modules)
 *   - notification-router (complex handler modules)
 *
 * Auth: assertInternalCaller with allowAuthenticatedUsers
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const FETCH_TIMEOUT_MS = 45000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

// Map namespace → gateway
const NAMESPACE_TO_GATEWAY: Record<string, string> = {
  // api-gateway handles platform/admin actions
  'admin': 'api-gateway',
  'billing': 'api-gateway',
  'security': 'api-gateway',
  'build': 'api-gateway',
  'agent': 'api-gateway',
  // ops-gateway handles operations/monitoring
  'check': 'ops-gateway',
  'sync': 'ops-gateway',
  'playbook': 'ops-gateway',
  'report': 'ops-gateway',
  'cleanup': 'ops-gateway',
  'notify': 'ops-gateway',
  // Direct dispatch (different middleware, not consolidated)
  'automation': 'evaluate-automation-rules',
};

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function forwardHeaders(req: Request, requestId: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
  };
  for (const name of ['Authorization', 'apikey', 'X-Internal-Secret', 'X-Agent-Token', 'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce', 'x-cron-source']) {
    const v = req.headers.get(name);
    if (v) h[name] = v;
  }
  if (!h['Authorization']) {
    h['Authorization'] = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
  }
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405, origin);

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) {
      return jsonRes({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400, origin);
    }

    const { action: rawAction, payload } = parsed.data;

    // Parse namespace: "cleanup:telemetry" → ns=cleanup, subAction=telemetry
    const colonIdx = rawAction.indexOf(':');
    const namespace = colonIdx > 0 ? rawAction.substring(0, colonIdx) : null;
    const subAction = colonIdx > 0 ? rawAction.substring(colonIdx + 1) : rawAction;

    if (!namespace || !NAMESPACE_TO_GATEWAY[namespace]) {
      return jsonRes({
        error: `Unknown or missing namespace in action: "${rawAction}". Use format "namespace:action".`,
        available_namespaces: Object.keys(NAMESPACE_TO_GATEWAY),
        examples: ['cleanup:telemetry', 'notify:email', 'admin:create-user', 'check:check-stuck-jobs'],
      }, 400, origin);
    }

    const targetFunction = NAMESPACE_TO_GATEWAY[namespace];
    const headers = forwardHeaders(req, requestId);

    // For evaluate-automation-rules (direct dispatch, not a gateway)
    if (targetFunction === 'evaluate-automation-rules') {
      const url = `${SUPABASE_URL}/functions/v1/${targetFunction}`;
      logger.info(`[${requestId}] ops-router: ${rawAction} → ${targetFunction} (direct)`);
      const response = await fetchWithTimeout(url, { timeoutMs: FETCH_TIMEOUT_MS, method: 'POST', headers, body: JSON.stringify(payload) });
      const responseBody = await response.text();
      logger.info(`[${requestId}] ops-router: ${rawAction} done in ${Date.now() - startedAt}ms`);
      return new Response(responseBody, { status: response.status, headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });
    }

    // Route to gateway — forward the full namespaced action
    const url = `${SUPABASE_URL}/functions/v1/${targetFunction}`;
    logger.info(`[${requestId}] ops-router: ${rawAction} → ${targetFunction}`);

    const response = await fetchWithTimeout(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      method: 'POST',
      headers,
      body: JSON.stringify({ action: rawAction, payload }),
    });

    const responseBody = await response.text();
    logger.info(`[${requestId}] ops-router: ${rawAction} done in ${Date.now() - startedAt}ms (status=${response.status})`);

    return new Response(responseBody, {
      status: response.status,
      headers: {
        ...buildCorsHeaders(origin),
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });

  } catch (error) {
    logger.error(`[${requestId}] ops-router error:`, error);
    return jsonRes({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    }, 500, origin);
  }
});
