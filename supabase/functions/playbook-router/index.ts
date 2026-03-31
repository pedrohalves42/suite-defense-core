/**
 * playbook-router — Consolidated Playbook, Automation & SOAR Router
 * 
 * Routes: execute-playbook, execute-playbook-action, evaluate-playbook-triggers,
 *   process-playbook-trigger-logs, evaluate-automation-rules,
 *   auto-execute-ai-actions, auto-remediate, auto-triage-insights,
 *   autonomous-safe-mode, rollback-by-decision-event, rollback-remediation,
 *   resolve-action-policy, soar-engine, oncall-integration, create-itsm-ticket,
 *   run-attack-simulation, calculate-risk-score, evaluate-software-risk
 * 
 * Auth: JWT (admin) or internal caller, forwarded to sub-functions
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const FETCH_TIMEOUT_MS = 45000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const ACTION_TO_FUNCTION: Record<string, string> = {
  'execute-playbook': 'execute-playbook',
  'execute-playbook-action': 'execute-playbook-action',
  'evaluate-playbook-triggers': 'evaluate-playbook-triggers',
  'process-playbook-trigger-logs': 'process-playbook-trigger-logs',
  'evaluate-automation-rules': 'evaluate-automation-rules',
  'auto-execute-ai-actions': 'auto-execute-ai-actions',
  'auto-remediate': 'auto-remediate',
  'auto-triage-insights': 'auto-triage-insights',
  'autonomous-safe-mode': 'autonomous-safe-mode',
  'rollback-by-decision-event': 'rollback-by-decision-event',
  'rollback-remediation': 'rollback-remediation',
  'resolve-action-policy': 'resolve-action-policy',
  'soar-engine': 'soar-engine',
  'oncall-integration': 'oncall-integration',
  'create-itsm-ticket': 'create-itsm-ticket',
  'run-attack-simulation': 'run-attack-simulation',
  'calculate-risk-score': 'calculate-risk-score',
  'evaluate-software-risk': 'evaluate-software-risk',
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
  for (const name of ['Authorization', 'apikey', 'X-Internal-Secret', 'x-cron-source']) {
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

    logger.info(`[playbook-router] Routing ${action} → ${targetFn}`, { requestId });

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: forwardHeaders(req, requestId),
      body: JSON.stringify(payload),
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    const responseData = await response.text();
    const elapsed = Date.now() - startedAt;
    logger.info(`[playbook-router] ${action} completed in ${elapsed}ms (status: ${response.status})`);

    return new Response(responseData, {
      status: response.status,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });

  } catch (err) {
    logger.error('[playbook-router] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown' }, 500, origin);
  }
});
