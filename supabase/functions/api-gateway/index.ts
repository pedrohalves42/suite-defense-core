/**
 * api-gateway — Unified Platform API Gateway (Phase 5)
 *
 * Consolidates: admin, billing, security, build, agent namespaces
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
  handleCreateTrialSubscription, handleCreateCustomTrial,
  handleUnitEconomics, handleRevenueProjections,
  handleSalesPipeline, handleSubscriptionAnalytics,
  handleSendTrialReminder,
} from './handlers/billing.ts';
import {
  handleListInvoices, handleCustomerPortal,
  handleCheckSubscription, handleCreateCheckout,
  handleManageSubscription, handleCreateStripeProducts,
  handleCreateStripeProductsExtended, handleStripeHealthCheck,
} from './handlers/billing-stripe.ts';
import {
  handleGetAdminReleases, handleUpdateUserStatus,
  handleUpdateMemberRole, handleRemoveMember,
  handleListUsers, handleListAllUsersAdmin,
  handleSetActiveTenant, handleUpdateUserRole,
  handleAdminCreateUser, handleGetRateLimitStats,
  type HandlerContext,
} from './handlers/admin.ts';
import {
  handleAutoBlockThreats,
} from './handlers/security-threats.ts';
import {
  handleCheckCredentialLeaks, handleClassifyShadowIt, handleClearFailedLogins,
} from './handlers/security-scanning.ts';
import {
  handleThreatIntelligenceLookup, handleBuildSecurityGraph,
} from './handlers/security-intel.ts';
import {
  handleActivateAgentHoneypot, handleRevertAgentHoneypot,
} from './handlers/honeypot.ts';
import {
  handleAgentSnapshot, handleCheckAgentNameAvailability,
  handleDiagnoseAgent, handleGetAgentTimeline,
} from './handlers/agent-mgmt.ts';
import { handleBuildCallback } from './handlers/build-ops.ts';
import {
  handleAcceptInvite, handleDeleteInvite, handleSendInvite,
} from './handlers/admin-auth.ts';
import {
  handleGenerateEnrollmentKey, handleRevokeEnrollmentKey,
} from './handlers/enrollment.ts';
import {
  handleGetSoftwareInventory, handleGetWebActivity, handleGetAgentDashboardData,
} from './handlers/agent-data.ts';
import {
  handleTokenRotate, handleRecoverAgentCredentials, handleAgentVersionManagement,
} from './handlers/agent-ops.ts';
import { handleAnalyzeUrl } from './handlers/security-url.ts';
import { handleCreateJob } from './handlers/job-mgmt.ts';
import { handleSiemExport } from './handlers/security-export.ts';
import { handleSecurityAdvisor } from './handlers/security-advisor.ts';
import { handleChangePassword } from './handlers/user-auth.ts';

const FETCH_TIMEOUT_MS = 30000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── Proxy map: actions still dispatched via HTTP ────────────────────────
// Only serveTenant functions that accept JWT auth forwarded from the gateway.
// serveAgent/HMAC, servePublic, and raw Deno.serve functions must be called
// directly — their auth is incompatible with assertInternalCaller proxy.
const ACTION_TO_FUNCTION: Record<string, string> = {
  // security proxy targets — serveTenant (JWT-compatible)
  'security:scan-vulnerabilities': 'scan-vulnerabilities',
  // build proxy targets — serveTenant (JWT-compatible)
  'build:build-agent-exe': 'build-agent-exe',
  'build:generate-deploy-package': 'generate-deploy-package',
  'build:generate-portable-installer': 'generate-portable-installer',
  'build:auto-generate-enrollment': 'auto-generate-enrollment',
  'build:register-agent-release': 'register-agent-release',
  'build:sign-release': 'sign-release',
  'build:upload-release-content': 'upload-release-content',
  'build:validate-build-pipeline': 'validate-build-pipeline',
  // agent proxy targets — serveTenant (JWT-compatible)
  'agent:get-agent-script-content': 'get-agent-script-content',
  'agent:promote-agent-v5': 'promote-agent-v5',
  'agent:setup-agent-script': 'setup-agent-script',
  'agent:force-reinstall-fleet': 'force-reinstall-fleet',
  'agent:create-reinstall-jobs': 'create-reinstall-jobs',
};

// ── Inlined handlers (no HTTP hop) ──────────────────────────────────────
type InlinedHandler = (supabase: ReturnType<typeof createClient>, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) => Promise<unknown>;

const INLINED_HANDLERS: Record<string, InlinedHandler> = {
  // billing inlined (Phase 1)
  'billing:cohort-analysis': handleCohortAnalysis,
  'billing:reset-daily-quotas': handleResetDailyQuotas,
  'billing:check-tenant-quotas': handleCheckTenantQuotas,
  'billing:check-trial-expiration': handleCheckTrialExpiration,
  // billing inlined - Phase 2B (DB-only)
  'billing:create-trial-subscription': handleCreateTrialSubscription,
  'billing:create-custom-trial': handleCreateCustomTrial,
  'billing:unit-economics': handleUnitEconomics,
  'billing:revenue-projections': handleRevenueProjections,
  'billing:sales-pipeline': handleSalesPipeline,
  'billing:subscription-analytics': handleSubscriptionAnalytics,
  'billing:send-trial-reminder': handleSendTrialReminder,
  // billing inlined - Phase 2B (Stripe, dynamic import)
  'billing:list-invoices': handleListInvoices,
  'billing:customer-portal': handleCustomerPortal,
  'billing:check-subscription': handleCheckSubscription,
  'billing:create-checkout': handleCreateCheckout,
  'billing:manage-subscription': handleManageSubscription,
  'billing:create-stripe-products': handleCreateStripeProducts,
  'billing:create-stripe-products-extended': handleCreateStripeProductsExtended,
  'billing:stripe-health-check': handleStripeHealthCheck,
  // security inlined
  'security:security-cleanup': handleSecurityCleanup,
  // security inlined — Phase 1A (JWT-compatible)
  'security:auto-block-threats': handleAutoBlockThreats,
  'security:check-credential-leaks': handleCheckCredentialLeaks,
  'security:clear-failed-logins': handleClearFailedLogins,
  'security:classify-shadow-it': handleClassifyShadowIt,
  'security:threat-intelligence-lookup': handleThreatIntelligenceLookup,
  'security:build-security-graph': handleBuildSecurityGraph,
  // honeypot inlined (Phase 1B)
  'security:activate-agent-honeypot': handleActivateAgentHoneypot,
  'security:revert-agent-honeypot': handleRevertAgentHoneypot,
  // admin inlined (Phase 2A)
  'admin:get-admin-releases': handleGetAdminReleases,
  'admin:update-user-status': handleUpdateUserStatus,
  'admin:update-member-role': handleUpdateMemberRole,
  'admin:remove-member': handleRemoveMember,
  'admin:list-users': handleListUsers,
  'admin:list-all-users': handleListAllUsersAdmin,
  'admin:set-active-tenant': handleSetActiveTenant,
  'admin:update-user-role': handleUpdateUserRole,
  'admin:create-user': handleAdminCreateUser,
  'admin:rate-limit-stats': handleGetRateLimitStats,
  // agent-mgmt inlined (Phase 2E)
  'agent:agent-snapshot': handleAgentSnapshot,
  'agent:check-agent-name-availability': handleCheckAgentNameAvailability,
  'agent:diagnose-agent': handleDiagnoseAgent,
  'agent:get-agent-timeline': handleGetAgentTimeline,
  // build inlined (Phase 2E)
  'build:build-callback': handleBuildCallback,
  // ── Phase 2F: admin-auth inlined ──
  'admin:accept-invite': handleAcceptInvite,
  'admin:delete-invite': handleDeleteInvite,
  'admin:send-invite': handleSendInvite,
  // ── Phase 2F: enrollment inlined ──
  'build:generate-enrollment-key': handleGenerateEnrollmentKey,
  'build:revoke-enrollment-key': handleRevokeEnrollmentKey,
  // ── Phase 2F: agent-data inlined ──
  'agent:get-software-inventory': handleGetSoftwareInventory,
  'agent:get-web-activity': handleGetWebActivity,
  'agent:get-agent-dashboard-data': handleGetAgentDashboardData,
  // ── Phase 2J: agent-ops inlined ──
  'agent:token-rotate': handleTokenRotate,
  'agent:recover-agent-credentials': handleRecoverAgentCredentials,
  'agent:agent-version-management': handleAgentVersionManagement,
};

// API-key authenticated endpoints (still proxy — they have own auth flow)
const API_KEY_PROXY: Record<string, string> = {
  'admin:tenant-features': 'api-tenant-features',
  'admin:tenant-info': 'api-tenant-info',
  'admin:tenant-stats': 'api-tenant-stats',
};

const ALL_VALID_ACTIONS = new Set([
  ...Object.keys(ACTION_TO_FUNCTION),
  ...Object.keys(INLINED_HANDLERS),
  ...Object.keys(API_KEY_PROXY),
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
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Request-ID': requestId, 'X-Trace-ID': requestId };
  for (const name of FORWARDED_HEADERS) {
    const v = req.headers.get(name);
    if (v) h[name] = v;
  }
  return h;
}

/** Decode JWT payload to extract userId and tenantId (best-effort, no verification — auth already validated) */
function decodeJwtContext(req: Request): { userId?: string; tenantId?: string } {
  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return {};
    const token = auth.slice(7);
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return {};
    const decoded = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
    return {
      userId: decoded.sub,
      tenantId: decoded.app_metadata?.active_tenant_id,
    };
  } catch {
    return {};
  }
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
      const jwtCtx = decodeJwtContext(req);
      const handlerCtx: HandlerContext = { req, userId: jwtCtx.userId, tenantId: jwtCtx.tenantId };
      
      logger.info(`[api-gateway] Inline: ${action}`, { requestId });
      const result = await inlinedHandler(supabase, requestId, payload, handlerCtx);
      const elapsed = Date.now() - startedAt;
      logger.info(`[api-gateway] ${action} done in ${elapsed}ms`);

      // Support __status for custom HTTP status codes from handlers
      const resultObj = result as Record<string, unknown>;
      const status = typeof resultObj?.__status === 'number' ? resultObj.__status : 200;
      if (resultObj?.__status) {
        const { __status, ...rest } = resultObj;
        return jsonRes(rest, status, origin);
      }
      return jsonRes(result, 200, origin);
    }

    // API-key proxy
    const apiKeyTarget = API_KEY_PROXY[action];
    if (apiKeyTarget) {
      const url = `${SUPABASE_URL}/functions/v1/${apiKeyTarget}`;
      logger.info(`[api-gateway] API-key proxy: ${action} → ${apiKeyTarget}`, { requestId });
      const response = await fetchWithTimeout(url, { method: 'POST', headers: forwardHeaders(req, requestId), body: JSON.stringify(payload), timeoutMs: FETCH_TIMEOUT_MS });
      const responseData = await response.text();
      logger.info(`[api-gateway] ${action} done in ${Date.now() - startedAt}ms (status: ${response.status})`);
      return new Response(responseData, { status: response.status, headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });
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
