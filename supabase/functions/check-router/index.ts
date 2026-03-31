/**
 * check-router — Consolidated Monitoring & Health Check Router
 * 
 * Routes: check-action-effectiveness, check-installation-health,
 *   check-pending-agents, check-production-health, check-stuck-jobs,
 *   check-task-sla-breach, detect-stuck-installations, health-monitor,
 *   monitor-thresholds, cron-sentinel, watchdog-non-execution, build-watchdog,
 *   sli-collector, get-installation-pipeline-metrics,
 *   analyze-confidence-gap-trend, analyze-job-failure-patterns,
 *   analyze-network-anomalies, calculate-behavioral-baselines,
 *   evaluate-job-slo, compute-compliance-benchmarks
 * 
 * Auth: Internal caller or JWT (admin), forwarded to sub-functions
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const FETCH_TIMEOUT_MS = 30000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const ACTION_TO_FUNCTION: Record<string, string> = {
  'check-action-effectiveness': 'check-action-effectiveness',
  'check-installation-health': 'check-installation-health',
  'check-pending-agents': 'check-pending-agents',
  'check-production-health': 'check-production-health',
  'check-stuck-jobs': 'check-stuck-jobs',
  'check-task-sla-breach': 'check-task-sla-breach',
  'detect-stuck-installations': 'detect-stuck-installations',
  'health-monitor': 'health-monitor',
  'monitor-thresholds': 'monitor-thresholds',
  'cron-sentinel': 'cron-sentinel',
  'watchdog-non-execution': 'watchdog-non-execution',
  'build-watchdog': 'build-watchdog',
  'sli-collector': 'sli-collector',
  'get-installation-pipeline-metrics': 'get-installation-pipeline-metrics',
  'analyze-confidence-gap-trend': 'analyze-confidence-gap-trend',
  'analyze-job-failure-patterns': 'analyze-job-failure-patterns',
  'analyze-network-anomalies': 'analyze-network-anomalies',
  'calculate-behavioral-baselines': 'calculate-behavioral-baselines',
  'evaluate-job-slo': 'evaluate-job-slo',
  'compute-compliance-benchmarks': 'compute-compliance-benchmarks',
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

    logger.info(`[check-router] Routing ${action} → ${targetFn}`, { requestId });

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: forwardHeaders(req, requestId),
      body: JSON.stringify(payload),
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    const responseData = await response.text();
    const elapsed = Date.now() - startedAt;
    logger.info(`[check-router] ${action} completed in ${elapsed}ms (status: ${response.status})`);

    return new Response(responseData, {
      status: response.status,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });

  } catch (err) {
    logger.error('[check-router] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown' }, 500, origin);
  }
});
