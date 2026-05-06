import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { httpJson } from '../_shared/http.ts';
import { servePublic } from '../_shared/serve-public.ts';
import { handleExceptionWithContext, createErrorResponse, ErrorCode } from '../_shared/error-handler.ts';

const FETCH_TIMEOUT_MS = 45000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── Flat proxy map: "namespace:action" → target function ────────────────
const ACTION_TO_FUNCTION: Record<string, string> = {
  // Reports
  'report:compliance': 'ops-reports',
  'report:executive': 'ops-reports',
  'report:explainable': 'ops-reports',
  'report:security': 'ops-reports',
  'report:weekly': 'ops-reports',
  'report:auto': 'ops-reports',
  'report:scheduled': 'ops-reports',
  'report:list': 'list-reports',

  // Checks (All routed to ops-checks)
  'check:check-task-sla-breach': 'ops-checks',
  'check:evaluate-job-slo': 'ops-checks',
  'check:check-installation-health': 'ops-checks',
  'check:check-production-health': 'ops-checks',
  'check:detect-stuck-installations': 'ops-checks',
  'check:get-installation-pipeline-metrics': 'ops-checks',
  'check:cron-sentinel': 'ops-checks',
  'check:check-stuck-jobs': 'ops-checks',
  'check:build-watchdog': 'ops-checks',
  'check:calculate-behavioral-baselines': 'ops-checks',
  'check:compute-compliance-benchmarks': 'ops-checks',
  'check:check-pending-agents': 'ops-checks',
  'check:monitor-thresholds': 'ops-checks',
  'check:health-monitor': 'ops-checks',
  'check:watchdog-non-execution': 'ops-checks',
  'check:check-action-effectiveness': 'ops-checks',
  'check:analyze-job-failure-patterns': 'ops-checks',
  'check:sli-collector': 'ops-checks',
  'check:analyze-confidence-gap-trend': 'ops-checks',
  'check:analyze-network-anomalies': 'ops-checks',
  'check:secret-rotation-compliance': 'ops-checks',
  'check:record-secret-rotation': 'ops-checks',
  'check:honeypot-alerts': 'ops-checks',
  'check:honeypot-dispatch-ai': 'ops-checks',
  'check:ai-behavioral-anomaly-detector': 'ops-checks',
  'check:check-agent-integrity': 'ops-checks',
  'check:drift-detect': 'ops-checks',
  'check:run-rls-tests': 'ops-checks',
  'check:rate-limit-check': 'ops-checks',
  'check:access-review': 'ops-checks',
  'check:ai-predict-agent-failure': 'ai-predict-agent-failure',
  'check:ai-system-analyzer': 'ai-system-analyzer',

  // Sync / Jobs / EDR
  'sync:process-failed-jobs': 'ops-sync',
  'sync:process-scheduled-jobs': 'ops-sync',
  'sync:invoke-scheduled-jobs': 'ops-sync',
  'sync:dlq-action': 'ops-sync',
  'sync:process-dlq-retries': 'ops-sync',
  'security:fetch-nvd-cves': 'ops-sync',
  'security:correlate-edr-events': 'ops-sync',
  'security:evaluate-edr-detections': 'ops-sync',
  'sync:ai-insight-dispatcher': 'ai-insight-dispatcher',

  // Playbooks
  'playbook:execute-playbook': 'ops-playbook',
  'playbook:process-playbook-trigger-logs': 'ops-playbook',
  'playbook:rollback-by-decision-event': 'ops-playbook',
  'playbook:rollback-remediation': 'ops-playbook',
  'playbook:resolve-action-policy': 'ops-playbook',
  'playbook:soar-engine': 'ops-playbook',
  'playbook:auto-execute-ai-actions': 'ops-playbook',
  'playbook:oncall-integration': 'ops-playbook',
  'playbook:create-itsm-ticket': 'ops-playbook',
  'playbook:execute-playbook-action': 'execute-playbook-action',
  'playbook:evaluate-playbook-triggers': 'evaluate-playbook-triggers',
  'playbook:evaluate-automation-rules': 'evaluate-automation-rules',
  'playbook:auto-remediate': 'auto-remediate',
  'playbook:autonomous-safe-mode': 'autonomous-safe-mode',
  'playbook:evaluate-software-risk': 'evaluate-software-risk',
};

const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

function forwardHeaders(req: Request, requestId: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
    'X-Trace-ID': requestId,
    'Authorization': req.headers.get('Authorization') || `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': req.headers.get('apikey') || SUPABASE_SERVICE_ROLE_KEY,
  };
  // Copy relevant headers
  ['X-Internal-Secret', 'X-Agent-Token', 'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce', 'x-cron-source'].forEach(name => {
    const v = req.headers.get(name);
    if (v) h[name] = v;
  });
  return h;
}

servePublic(async (req, ctx) => {
  const { requestId, body } = ctx;
  const origin = req.headers.get('origin');
  const startedAt = Date.now();

  try {
    const authError = await assertInternalCaller(req, { requireSuperAdmin: true });
    if (authError) return authError;

    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid request', 400, requestId);
    }

    const { action } = parsed.data;
    const targetFn = ACTION_TO_FUNCTION[action];

    if (!targetFn) {
      return createErrorResponse(ErrorCode.NOT_FOUND, `Unknown action: ${action}`, 404, requestId);
    }

    const url = `${SUPABASE_URL}/functions/v1/${targetFn}`;
    logger.info(`[ops-gateway] Routing: ${action} → ${targetFn}`, { requestId });

    // Use httpJson for robust internal routing with retries
    const json = await httpJson(url, {
      method: 'POST',
      headers: forwardHeaders(req, requestId),
      body: JSON.stringify(body),
      timeoutMs: FETCH_TIMEOUT_MS,
      retries: 2, // Standard internal retry
    });

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return handleExceptionWithContext(err, requestId, 'ops-gateway', startedAt, {
      operation: 'routing',
      traceId: requestId
    });
  }
});
