/**
 * ops-gateway — Unified Operations Gateway (Phase 5)
 *
 * Consolidates: check-router, sync-router, playbook-router, report-router, cleanup-router, notification-router
 *
 * Action format: "namespace:action" e.g. "check:check-stuck-jobs", "sync:process-failed-jobs"
 *
 * For cleanup and notification namespaces, proxies to cleanup-router and notification-router
 * respectively (they have complex internal handler logic with module dependencies).
 *
 * Auth: assertInternalCaller with allowAuthenticatedUsers
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

// Inlined handlers
import {
  handleCheckTaskSlaBreach, handleEvaluateJobSlo,
  handleCheckInstallationHealth, handleCheckProductionHealth,
  handleDetectBlockedAttempts,
} from './handlers/check.ts';
import {
  handleResetDailyQuotas, handleLogDomainEvent,
  handleHmacCleanupScheduled, handleProcessTenantSuspensions,
  handleScheduledComplianceRefresh, handleFlushEventBuffer,
} from './handlers/sync.ts';
import { handleAutoTriageInsights } from './handlers/playbook.ts';

const FETCH_TIMEOUT_MS = 45000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── Flat proxy map: "namespace:action" → target function ────────────────
const ACTION_TO_FUNCTION: Record<string, string> = {
  // check proxy targets
  'check:check-action-effectiveness': 'check-action-effectiveness',
  'check:check-stuck-jobs': 'check-stuck-jobs',
  'check:sli-collector': 'sli-collector',
  'check:get-installation-pipeline-metrics': 'get-installation-pipeline-metrics',
  'check:analyze-confidence-gap-trend': 'analyze-confidence-gap-trend',
  'check:analyze-job-failure-patterns': 'analyze-job-failure-patterns',
  'check:analyze-network-anomalies': 'analyze-network-anomalies',
  'check:health-monitor': 'health-monitor',
  'check:monitor-thresholds': 'monitor-thresholds',
  'check:build-watchdog': 'build-watchdog',
  'check:calculate-behavioral-baselines': 'calculate-behavioral-baselines',
  'check:compute-compliance-benchmarks': 'compute-compliance-benchmarks',
  'check:cron-sentinel': 'cron-sentinel',
  'check:check-pending-agents': 'check-pending-agents',
  'check:watchdog-non-execution': 'watchdog-non-execution',
  // sync proxy targets
  'sync:sync-blocked-websites': 'sync-blocked-websites',
  'sync:sync-storage-bucket': 'sync-storage-bucket',
  'sync:process-dlq-retries': 'process-dlq-retries',
  'sync:process-failed-jobs': 'process-failed-jobs',
  'sync:process-scheduled-jobs': 'process-scheduled-jobs',
  'sync:invoke-scheduled-jobs': 'invoke-scheduled-jobs',
  'sync:dlq-action': 'dlq-action',
  'sync:system-maintenance': 'system-maintenance',
  'sync:maintenance-cron': 'maintenance-cron',
  'sync:release-sync': 'release-sync',
  'sync:sync-stripe-subscriptions': 'sync-stripe-subscriptions',
  'sync:sync-threat-feeds': 'sync-threat-feeds',
  // playbook proxy targets
  'playbook:execute-playbook': 'execute-playbook',
  'playbook:execute-playbook-action': 'execute-playbook-action',
  'playbook:evaluate-playbook-triggers': 'evaluate-playbook-triggers',
  'playbook:process-playbook-trigger-logs': 'process-playbook-trigger-logs',
  'playbook:evaluate-automation-rules': 'evaluate-automation-rules',
  'playbook:auto-execute-ai-actions': 'auto-execute-ai-actions',
  'playbook:auto-remediate': 'auto-remediate',
  'playbook:autonomous-safe-mode': 'autonomous-safe-mode',
  'playbook:rollback-by-decision-event': 'rollback-by-decision-event',
  'playbook:rollback-remediation': 'rollback-remediation',
  'playbook:resolve-action-policy': 'resolve-action-policy',
  'playbook:soar-engine': 'soar-engine',
  'playbook:oncall-integration': 'oncall-integration',
  'playbook:create-itsm-ticket': 'create-itsm-ticket',
  'playbook:run-attack-simulation': 'run-attack-simulation',
  'playbook:calculate-risk-score': 'calculate-risk-score',
  'playbook:evaluate-software-risk': 'evaluate-software-risk',
  // report proxy targets (all proxy)
  'report:compliance': 'generate-compliance-report',
  'report:executive': 'generate-executive-report',
  'report:explainable': 'generate-explainable-report',
  'report:security': 'generate-security-report',
  'report:weekly': 'generate-weekly-report',
  'report:auto': 'auto-generate-report',
  'report:scheduled': 'scheduled-report-generator',
  'report:list': 'list-reports',
};

// For cleanup and notification namespaces, we proxy to existing routers
// (they have complex handler logic with sibling module imports)
const NAMESPACE_ROUTER_PROXY: Record<string, string> = {
  'cleanup': 'cleanup-router',
  'notify': 'notification-router',
};

type InlinedHandler = (supabase: ReturnType<typeof createClient>, requestId: string, payload: Record<string, unknown>) => Promise<unknown>;

const INLINED_HANDLERS: Record<string, InlinedHandler> = {
  // check inlined
  'check:check-task-sla-breach': handleCheckTaskSlaBreach,
  'check:evaluate-job-slo': handleEvaluateJobSlo,
  'check:check-installation-health': handleCheckInstallationHealth,
  'check:check-production-health': handleCheckProductionHealth,
  'check:detect-stuck-installations': handleDetectBlockedAttempts,
  // sync inlined
  'sync:reset-daily-quotas': handleResetDailyQuotas,
  'sync:log-domain-event': handleLogDomainEvent,
  'sync:hmac-cleanup-scheduled': handleHmacCleanupScheduled,
  'sync:process-tenant-suspensions': handleProcessTenantSuspensions,
  'sync:scheduled-compliance-refresh': handleScheduledComplianceRefresh,
  'sync:flush-event-buffer': handleFlushEventBuffer,
  // playbook inlined
  'playbook:auto-triage-insights': handleAutoTriageInsights,
};

const ALL_VALID_ACTIONS = new Set([
  ...Object.keys(ACTION_TO_FUNCTION),
  ...Object.keys(INLINED_HANDLERS),
]);

// Namespaces that proxy to existing routers
const ROUTER_PROXY_NAMESPACES = new Set(Object.keys(NAMESPACE_ROUTER_PROXY));

const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

const FORWARDED_HEADERS = [
  'Authorization', 'apikey', 'X-Internal-Secret', 'X-Agent-Token',
  'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce', 'x-cron-source',
];

function forwardHeaders(req: Request, requestId: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Request-ID': requestId, 'X-Trace-ID': requestId };
  for (const name of FORWARDED_HEADERS) {
    const v = req.headers.get(name);
    if (v) h[name] = v;
  }
  if (!h['Authorization']) {
    h['Authorization'] = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  }
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405, origin);

  const requestId = req.headers.get('X-Trace-ID') || req.headers.get('X-Request-ID') || crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
    if (authError) return authError;

    const body = await req.json();
    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) return jsonRes({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400, origin);

    const { action, payload } = parsed.data;

    // Parse namespace
    const colonIdx = action.indexOf(':');
    const namespace = colonIdx > 0 ? action.substring(0, colonIdx) : null;
    const subAction = colonIdx > 0 ? action.substring(colonIdx + 1) : action;

    if (!namespace) {
      return jsonRes({
        error: `Missing namespace in action: "${action}". Use format "namespace:action".`,
        available_namespaces: ['check', 'sync', 'playbook', 'report', 'cleanup', 'notify'],
      }, 400, origin);
    }

    // Route cleanup/notify to existing routers (they have complex handler modules)
    if (ROUTER_PROXY_NAMESPACES.has(namespace)) {
      const targetRouter = NAMESPACE_ROUTER_PROXY[namespace];
      const url = `${SUPABASE_URL}/functions/v1/${targetRouter}`;
      const routerBody = namespace === 'cleanup'
        ? JSON.stringify({ action: subAction, ...payload })
        : JSON.stringify({ action: subAction, payload });

      logger.info(`[ops-gateway] Router proxy: ${action} → ${targetRouter}`, { requestId });
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: forwardHeaders(req, requestId),
        body: routerBody,
        timeoutMs: FETCH_TIMEOUT_MS,
      });
      const responseData = await response.text();
      logger.info(`[ops-gateway] ${action} done in ${Date.now() - startedAt}ms (status: ${response.status})`);
      return new Response(responseData, {
        status: response.status,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
      });
    }

    // Try inlined handler
    const inlinedHandler = INLINED_HANDLERS[action];
    if (inlinedHandler) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      logger.info(`[ops-gateway] Inline: ${action}`, { requestId });
      const result = await inlinedHandler(supabase, requestId, payload);
      logger.info(`[ops-gateway] ${action} done in ${Date.now() - startedAt}ms`);
      return jsonRes(result, 200, origin);
    }

    // Proxy to target function
    if (!ALL_VALID_ACTIONS.has(action)) {
      return jsonRes({
        error: `Unknown action: ${action}`,
        available_namespaces: ['check', 'sync', 'playbook', 'report', 'cleanup', 'notify'],
        hint: 'Use format "namespace:action", e.g. "check:check-stuck-jobs"',
      }, 400, origin);
    }

    const targetFn = ACTION_TO_FUNCTION[action];
    const url = `${SUPABASE_URL}/functions/v1/${targetFn}`;
    logger.info(`[ops-gateway] Proxy: ${action} → ${targetFn}`, { requestId });

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: forwardHeaders(req, requestId),
      body: JSON.stringify(payload),
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    const responseData = await response.text();
    logger.info(`[ops-gateway] ${action} done in ${Date.now() - startedAt}ms (status: ${response.status})`);

    return new Response(responseData, {
      status: response.status,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });
  } catch (err) {
    logger.error('[ops-gateway] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown', requestId }, 500, origin);
  }
});
