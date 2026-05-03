// @ts-nocheck
/**
 * api-gateway — Unified Platform API Gateway (Phase 5)
 *
 * Consolidates: admin, billing, security, build, agent namespaces
 *
 * Action format: "namespace:action" e.g. "admin:create-user", "billing:create-checkout"
 *
 * Auth: assertInternalCaller with allowAuthenticatedUsers
 */
import { createTypedClient } from '../_shared/supabase-client.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { requireEnv } from '../_shared/env.ts';
import {
  handleCohortAnalysisV2,
  handleUnitEconomicsV2,
} from './handlers/billing-v2.ts';
import {
  handleListInvoicesV2, handleCustomerPortalV2,
  handleCheckSubscriptionV2, handleCreateCheckoutV2,
  handleChargeSubscription,
} from './handlers/billing-v2.ts';
import {
  handleSecurityCleanup,
} from './handlers/billing.ts'; // Just keep security cleanup for now if it's there

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
import { handleSyncCveDatabase } from './handlers/sync-cve.ts';
import { handleMitreSync } from './handlers/sync-mitre.ts';
// Phase 6C inlined handlers
import { handleTranslateCve } from './handlers/translate-cve.ts';
import { handleCalculateCompliance } from './handlers/compliance.ts';
import { handleExportEvidenceBundle } from './handlers/evidence-bundle.ts';
import { handleTenantFeatures, handleTenantInfo, handleTenantStats } from './handlers/tenant-api.ts';

const FETCH_TIMEOUT_MS = 20000; // Lower than middleware timeout (25s) to allow gateway to return a clean 504/error
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── Proxy map: actions still dispatched via HTTP ────────────────────────
// Only serveTenant functions that accept JWT auth forwarded from the gateway.
// serveAgent/HMAC, servePublic, and raw Deno.serve functions must be called
// directly — their auth is incompatible with assertInternalCaller proxy.
const ACTION_TO_FUNCTION: Record<string, string> = {
  // security proxy targets — serveTenant (JWT-compatible)
  'security:scan-vulnerabilities': 'scan-vulnerabilities',
  'security:fido2-register': 'fido2-register',
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
  'agent:action-center-feed': 'action-center-feed',
  // AI proxy targets — serveTenant (JWT-compatible)
  'agent:ai-action-executor': 'ai-action-executor',
  'agent:ai-agent-assist': 'ai-agent-assist',
  'agent:ai-analyze-agent': 'ai-analyze-agent',
  'agent:ai-full-audit': 'ai-full-audit',
  'agent:ai-quality-check': 'ai-quality-check',
  'agent:ai-red-team-assessment': 'ai-red-team-assessment',
  'agent:ai-router': 'ai-router',
  'agent:ai-system-audit': 'ai-system-audit',
};

// ── Inlined handlers (no HTTP hop) ──────────────────────────────────────
type InlinedHandler = (supabase: any, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext) => Promise<unknown>;

const INLINED_HANDLERS: Record<string, InlinedHandler> = {
  // billing inlined (V2 Hexagonal)
  'billing:cohort-analysis': handleCohortAnalysisV2,
  'billing:unit-economics': handleUnitEconomicsV2,
  'billing:list-invoices': handleListInvoicesV2,
  'billing:customer-portal': handleCustomerPortalV2,
  'billing:check-subscription': handleCheckSubscriptionV2,
  'billing:create-checkout': handleCreateCheckoutV2,
  'billing:charge-subscription': handleChargeSubscription,
  // legacy or other billing logic not yet in use case
  'billing:security-cleanup': handleSecurityCleanup,

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
  // ── Phase 3A: serveTenant inlined ──
  'security:analyze-url': handleAnalyzeUrl,
  'security:siem-export': handleSiemExport,
  'security:security-advisor': handleSecurityAdvisor,
  'admin:change-password': handleChangePassword,
  'admin:create-job': handleCreateJob,
  'security:sync-cve-database': handleSyncCveDatabase as InlinedHandler,
  'security:mitre-sync': handleMitreSync as InlinedHandler,
  // ── Phase 6C: serveTenant inlined (consolidation) ──
  'security:translate-cve': handleTranslateCve,
  'security:calculate-compliance': handleCalculateCompliance,
  'security:export-evidence-bundle': handleExportEvidenceBundle,
  // ── Phase 6C: API-key endpoints inlined ──
  'admin:tenant-features': handleTenantFeatures,
  'admin:tenant-info': handleTenantInfo,
  'admin:tenant-stats': handleTenantStats,
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
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Request-ID': requestId, 'X-Trace-ID': requestId };
  for (const name of FORWARDED_HEADERS) {
    const v = req.headers.get(name);
    if (v) h[name] = v;
  }
  return h;
}

import { servePublic } from '../_shared/serve-public.ts';

servePublic(async (req, ctx) => {
  const { requestId, supabase: supabaseAny, body } = ctx;
  const traceId = requestId;
  const origin = req.headers.get('origin');
  const startedAt = Date.now();

  try {
    const authResult = await assertInternalCaller(req, { allowAuthenticated: true, returnContext: true });
    if (authResult instanceof Response) return authResult;

    const validatedCtx = authResult as { userId: string | null; tenantId: string | null; isInternal: boolean };

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
      const supabase = supabaseAny; // servePublic provides service_role client
      const handlerCtx: HandlerContext = { req, userId: validatedCtx.userId || undefined, tenantId: validatedCtx.tenantId || undefined };
      
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

    // Proxy to target function
    const targetFn = ACTION_TO_FUNCTION[action];
    const url = `${requireEnv('SUPABASE_URL')}/functions/v1/${targetFn}`;
    logger.info(`[api-gateway] Proxy: ${action} → ${targetFn}`, { requestId });

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: forwardHeaders(req, requestId),
      body: JSON.stringify(payload),
      timeoutMs: FETCH_TIMEOUT_MS,
    }).catch(err => {
      logger.error(`[api-gateway] Proxy failed for ${action}:`, err);
      return new Response(JSON.stringify({ 
        error: 'GATEWAY_PROXY_TIMEOUT', 
        message: 'A operacao demorou demais ou o servico de destino esta indisponivel.',
        details: err.message
      }), { status: 504, headers: { 'Content-Type': 'application/json' } });
    });

    if (response.status === 504) return response;

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
}, {
  rateLimit: {
    endpoint: 'api-gateway',
    maxRequests: 200,
    windowMinutes: 1
  }
});