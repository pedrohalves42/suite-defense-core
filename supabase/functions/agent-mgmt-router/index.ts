/**
 * agent-mgmt-router — Consolidated Agent Management Router
 * 
 * Routes: agent-snapshot, agent-version-management, check-agent-integrity,
 *   check-agent-name-availability, check-agent-updates, diagnose-agent,
 *   diagnostics-agent-logs, enroll-agent, get-agent-config, get-agent-dashboard-data,
 *   get-agent-policy, get-agent-script-content, get-agent-timeline,
 *   get-latest-agent-script, promote-agent-v5, recover-agent-credentials,
 *   register-agent-key, serve-agent-update, setup-agent-script, token-rotate,
 *   validate-hmac-signature, force-reinstall-fleet, create-reinstall-jobs,
 *   get-reinstall-by-name, get-reinstall-preserve-script, get-reinstall-script
 * 
 * Auth: Forwarded to sub-functions (JWT or HMAC depending on action)
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const FETCH_TIMEOUT_MS = 25000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const ACTION_TO_FUNCTION: Record<string, string> = {
  'agent-snapshot': 'agent-snapshot',
  'agent-version-management': 'agent-version-management',
  'check-agent-integrity': 'check-agent-integrity',
  'check-agent-name-availability': 'check-agent-name-availability',
  'check-agent-updates': 'check-agent-updates',
  'diagnose-agent': 'diagnose-agent',
  'diagnostics-agent-logs': 'diagnostics-agent-logs',
  'enroll-agent': 'enroll-agent',
  'get-agent-config': 'get-agent-config',
  'get-agent-dashboard-data': 'get-agent-dashboard-data',
  'get-agent-policy': 'get-agent-policy',
  'get-agent-script-content': 'get-agent-script-content',
  'get-agent-timeline': 'get-agent-timeline',
  'get-latest-agent-script': 'get-latest-agent-script',
  'promote-agent-v5': 'promote-agent-v5',
  'recover-agent-credentials': 'recover-agent-credentials',
  'register-agent-key': 'register-agent-key',
  'serve-agent-update': 'serve-agent-update',
  'setup-agent-script': 'setup-agent-script',
  'token-rotate': 'token-rotate',
  'validate-hmac-signature': 'validate-hmac-signature',
  'force-reinstall-fleet': 'force-reinstall-fleet',
  'create-reinstall-jobs': 'create-reinstall-jobs',
  'get-reinstall-by-name': 'get-reinstall-by-name',
  'get-reinstall-preserve-script': 'get-reinstall-preserve-script',
  'get-reinstall-script': 'get-reinstall-script',
};

const VALID_ACTIONS = new Set(Object.keys(ACTION_TO_FUNCTION));

const RouterSchema = z.object({
  action: z.string().min(1).max(60),
  payload: z.record(z.unknown()).optional().default({}),
});

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
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const body = await req.json();
    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) {
      return jsonRes({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400, origin);
    }

    const { action, payload } = parsed.data;

    if (!VALID_ACTIONS.has(action)) {
      return jsonRes({ error: `Unknown action: ${action}`, valid_actions: [...VALID_ACTIONS] }, 400, origin);
    }

    const targetFn = ACTION_TO_FUNCTION[action];
    const url = `${SUPABASE_URL}/functions/v1/${targetFn}`;

    logger.info(`[agent-mgmt-router] Routing ${action} → ${targetFn}`, { requestId });

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: forwardHeaders(req, requestId),
      body: JSON.stringify(payload),
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    const responseData = await response.text();
    const elapsed = Date.now() - startedAt;
    logger.info(`[agent-mgmt-router] ${action} completed in ${elapsed}ms (status: ${response.status})`);

    return new Response(responseData, {
      status: response.status,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });

  } catch (err) {
    logger.error('[agent-mgmt-router] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown' }, 500, origin);
  }
});
