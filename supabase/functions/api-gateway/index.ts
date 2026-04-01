/**
 * api-gateway — Unified Platform API Gateway (Phase 5)
 *
 * Consolidates: admin-router, billing-router, security-router, build-router, agent-mgmt-router
 *
 * Action format: "namespace:action" e.g. "admin:create-user", "billing:create-checkout"
 *
 * Auth: assertInternalCaller with allowAuthenticatedUsers
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import {
  handleCohortAnalysis, handleResetDailyQuotas,
  handleCheckTenantQuotas, handleCheckTrialExpiration,
  handleSecurityCleanup,
} from './handlers/billing.ts';

const FETCH_TIMEOUT_MS = 30000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── Flat action map: "namespace:action" → target function name ──────────
const ACTION_TO_FUNCTION: Record<string, string> = {
  // admin (from admin-router)
  'admin:create-user': 'admin-create-user',
  'admin:list-all-users': 'list-all-users-admin',
  'admin:list-users': 'list-users',
  'admin:update-user-role': 'update-user-role',
  'admin:update-user-status': 'update-user-status',
  'admin:update-member-role': 'update-member-role',
  'admin:remove-member': 'remove-member',
  'admin:set-active-tenant': 'set-active-tenant',
  'admin:get-admin-releases': 'get-admin-releases',
  'admin:tenant-features': 'api-tenant-features',
  'admin:tenant-info': 'api-tenant-info',
  'admin:tenant-stats': 'api-tenant-stats',
  'admin:rate-limit-stats': 'get-rate-limit-stats',
  // billing proxy targets (from billing-router)
  'billing:create-checkout': 'create-checkout',
  'billing:create-stripe-products': 'create-stripe-products',
  'billing:create-stripe-products-extended': 'create-stripe-products-extended',
  'billing:create-trial-subscription': 'create-trial-subscription',
  'billing:create-custom-trial': 'create-custom-trial',
  'billing:manage-subscription': 'manage-subscription',
  'billing:check-subscription': 'check-subscription',
  'billing:customer-portal': 'customer-portal',
  'billing:list-invoices': 'list-invoices',
  'billing:stripe-health-check': 'stripe-health-check',
  'billing:subscription-analytics': 'subscription-analytics',
  'billing:unit-economics': 'unit-economics',
  'billing:revenue-projections': 'revenue-projections',
  'billing:sales-pipeline': 'sales-pipeline',
  'billing:send-trial-reminder': 'send-trial-reminder',
  // security proxy targets (from security-router)
  'security:auto-block-threats': 'auto-block-threats',
  'security:auto-quarantine': 'auto-quarantine',
  'security:quarantine-agent': 'quarantine-agent',
  'security:apply-security-patch': 'apply-security-patch',
  'security:check-credential-leaks': 'check-credential-leaks',
  'security:check-failed-logins': 'check-failed-logins',
  'security:clear-failed-logins': 'clear-failed-logins',
  'security:record-failed-login': 'record-failed-login',
  'security:detect-blocked-attempts': 'detect-blocked-attempts',
  'security:security-monitor': 'security-monitor',
  'security:security-alert-dispatcher': 'security-alert-dispatcher',
  'security:build-security-graph': 'build-security-graph',
  'security:populate-security-graph': 'populate-security-graph',
  'security:integrity-sentinel': 'integrity-sentinel',
  'security:verify-log-integrity': 'verify-log-integrity',
  'security:classify-shadow-it': 'classify-shadow-it',
  'security:scan-virus': 'scan-virus',
  'security:scan-vulnerabilities': 'scan-vulnerabilities',
  'security:fetch-nvd-cves': 'fetch-nvd-cves',
  'security:translate-cve': 'translate-cve',
  'security:sync-cve-database': 'sync-cve-database',
  'security:publish-threat-ioc': 'publish-threat-ioc',
  'security:threat-intelligence-lookup': 'threat-intelligence-lookup',
  'security:correlate-edr-events': 'correlate-edr-events',
  'security:evaluate-edr-detections': 'evaluate-edr-detections',
  'security:mitre-sync': 'mitre-sync',
  'security:siem-export': 'siem-export',
  'security:run-rls-tests': 'run-rls-tests',
  'security:security-advisor': 'security-advisor',
  // build proxy targets (from build-router)
  'build:build-agent-exe': 'build-agent-exe',
  'build:build-callback': 'build-callback',
  'build:generate-deploy-package': 'generate-deploy-package',
  'build:generate-portable-installer': 'generate-portable-installer',
  'build:generate-enrollment-key': 'generate-enrollment-key',
  'build:auto-generate-enrollment': 'auto-generate-enrollment',
  'build:auto-renew-enrollment-keys': 'auto-renew-enrollment-keys',
  'build:revoke-enrollment-key': 'revoke-enrollment-key',
  'build:register-agent-release': 'register-agent-release',
  'build:sign-release': 'sign-release',
  'build:upload-release-content': 'upload-release-content',
  'build:validate-build-pipeline': 'validate-build-pipeline',
  'build:confirm-force-update': 'confirm-force-update',
  'build:get-diagnostic-script': 'get-diagnostic-script',
  'build:serve-installer': 'serve-installer',
  // agent-mgmt proxy targets (from agent-mgmt-router)
  'agent:agent-snapshot': 'agent-snapshot',
  'agent:agent-version-management': 'agent-version-management',
  'agent:check-agent-integrity': 'check-agent-integrity',
  'agent:check-agent-name-availability': 'check-agent-name-availability',
  'agent:check-agent-updates': 'check-agent-updates',
  'agent:diagnose-agent': 'diagnose-agent',
  'agent:diagnostics-agent-logs': 'diagnostics-agent-logs',
  'agent:enroll-agent': 'enroll-agent',
  'agent:get-agent-config': 'get-agent-config',
  'agent:get-agent-dashboard-data': 'get-agent-dashboard-data',
  'agent:get-agent-policy': 'get-agent-policy',
  'agent:get-agent-script-content': 'get-agent-script-content',
  'agent:get-agent-timeline': 'get-agent-timeline',
  'agent:get-latest-agent-script': 'get-latest-agent-script',
  'agent:promote-agent-v5': 'promote-agent-v5',
  'agent:recover-agent-credentials': 'recover-agent-credentials',
  'agent:register-agent-key': 'register-agent-key',
  'agent:serve-agent-update': 'serve-agent-update',
  'agent:setup-agent-script': 'setup-agent-script',
  'agent:token-rotate': 'token-rotate',
  'agent:validate-hmac-signature': 'validate-hmac-signature',
  'agent:force-reinstall-fleet': 'force-reinstall-fleet',
  'agent:create-reinstall-jobs': 'create-reinstall-jobs',
  'agent:get-reinstall-by-name': 'get-reinstall-by-name',
  'agent:get-reinstall-preserve-script': 'get-reinstall-preserve-script',
  'agent:get-reinstall-script': 'get-reinstall-script',
};

// Inlined handlers (no HTTP hop needed)
type InlinedHandler = (supabase: ReturnType<typeof createClient>, requestId: string, payload: Record<string, unknown>) => Promise<unknown>;

const INLINED_HANDLERS: Record<string, InlinedHandler> = {
  // billing inlined
  'billing:cohort-analysis': handleCohortAnalysis,
  'billing:reset-daily-quotas': handleResetDailyQuotas,
  'billing:check-tenant-quotas': handleCheckTenantQuotas,
  'billing:check-trial-expiration': handleCheckTrialExpiration,
  // security inlined
  'security:security-cleanup': handleSecurityCleanup,
};

const ALL_VALID_ACTIONS = new Set([
  ...Object.keys(ACTION_TO_FUNCTION),
  ...Object.keys(INLINED_HANDLERS),
]);

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
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Request-ID': requestId };
  for (const name of FORWARDED_HEADERS) {
    const v = req.headers.get(name);
    if (v) h[name] = v;
  }
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405, origin);

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
    if (authError) return authError;

    const body = await req.json();
    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) return jsonRes({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400, origin);

    const { action, payload } = parsed.data;

    if (!ALL_VALID_ACTIONS.has(action)) {
      return jsonRes({
        error: `Unknown action: ${action}`,
        available_namespaces: ['admin', 'billing', 'security', 'build', 'agent'],
        hint: 'Use format "namespace:action", e.g. "admin:create-user"',
      }, 400, origin);
    }

    // Try inlined handler first (no HTTP hop)
    const inlinedHandler = INLINED_HANDLERS[action];
    if (inlinedHandler) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      logger.info(`[api-gateway] Inline: ${action}`, { requestId });
      const result = await inlinedHandler(supabase, requestId, payload);
      logger.info(`[api-gateway] ${action} done in ${Date.now() - startedAt}ms`);
      return jsonRes(result, 200, origin);
    }

    // Proxy to target function
    const targetFn = ACTION_TO_FUNCTION[action];
    const url = `${SUPABASE_URL}/functions/v1/${targetFn}`;
    logger.info(`[api-gateway] Proxy: ${action} → ${targetFn}`, { requestId });

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: forwardHeaders(req, requestId),
      body: JSON.stringify(payload),
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    const responseData = await response.text();
    logger.info(`[api-gateway] ${action} done in ${Date.now() - startedAt}ms (status: ${response.status})`);

    return new Response(responseData, {
      status: response.status,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });
  } catch (err) {
    logger.error('[api-gateway] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown', requestId }, 500, origin);
  }
});
