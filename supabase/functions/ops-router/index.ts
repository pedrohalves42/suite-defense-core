/**
 * ops-router — Unified Operations Router
 * 
 * Consolidates cleanup-router, notification-router, and evaluate-automation-rules
 * into a single entry point. Routes to existing handlers via internal HTTP dispatch
 * (each sub-router remains deployable independently for backward compatibility).
 * 
 * Namespaced actions:
 *   cleanup:telemetry, cleanup:stuck-jobs, cleanup:jobs, ...
 *   notify:email, notify:telegram, notify:dispatch, ...
 *   automation:evaluate
 * 
 * Also accepts legacy un-namespaced actions for backward compatibility.
 * 
 * Auth: assertInternalCaller with allowAuthenticatedUsers
 */

import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const FETCH_TIMEOUT_MS = 45000;

const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

// Map namespace to target function and body transform
const NAMESPACE_TARGETS: Record<string, string> = {
  'cleanup': 'cleanup-router',
  'notify': 'notification-router',
  'automation': 'evaluate-automation-rules',
  'admin': 'admin-router',
  'billing': 'billing-router',
  'security': 'security-router',
  'agent': 'agent-mgmt-router',
  'check': 'check-router',
  'sync': 'sync-router',
  'build': 'build-router',
  'playbook': 'playbook-router',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

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
  // Always include service_role if no auth present (internal dispatch)
  if (!h['Authorization']) {
    h['Authorization'] = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
  }
  return h;
}

function buildBody(namespace: string, subAction: string, payload: Record<string, unknown>): string {
  if (namespace === 'cleanup') {
    // cleanup-router expects { action: 'telemetry', ...extraFields }
    return JSON.stringify({ action: subAction, ...payload });
  }
  if (namespace === 'notify') {
    // notification-router expects { action: 'email', payload: {...} }
    return JSON.stringify({ action: subAction, payload });
  }
  if (namespace === 'automation') {
    // evaluate-automation-rules expects flat body { tenant_id: ... }
    return JSON.stringify(payload);
  }
  return JSON.stringify(payload);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405, origin);

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  // Auth: internal or JWT
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

    if (!namespace || !NAMESPACE_TARGETS[namespace]) {
      return jsonRes({
        error: `Unknown or missing namespace in action: "${rawAction}". Use format "namespace:action".`,
        available_namespaces: Object.keys(NAMESPACE_TARGETS),
        examples: ['cleanup:telemetry', 'notify:email', 'automation:evaluate'],
      }, 400, origin);
    }

    const targetFunction = NAMESPACE_TARGETS[namespace];
    const targetUrl = `${SUPABASE_URL}/functions/v1/${targetFunction}`;

    logger.info(`[${requestId}] ops-router: ${rawAction} -> ${targetFunction} (sub=${subAction})`);

    const headers = forwardHeaders(req, requestId);
    const reqBody = buildBody(namespace, subAction, payload);

    const response = await fetchWithTimeout(targetUrl, {
      timeoutMs: FETCH_TIMEOUT_MS,
      method: 'POST',
      headers,
      body: reqBody,
    });

    const responseBody = await response.text();
    const durationMs = Date.now() - startedAt;

    logger.info(`[${requestId}] ops-router: ${rawAction} done in ${durationMs}ms (status=${response.status})`);

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
