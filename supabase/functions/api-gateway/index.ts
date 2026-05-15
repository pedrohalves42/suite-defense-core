/**
 * api-gateway — Unified Platform API Gateway (Phase 6 Hexagonal)
 * 
 * Refactored using Hexagonal Architecture (Ports and Adapters).
 * Logic moved to Domain (Use Cases) and Infrastructure (Adapters).
 */
import { createSupabaseClient } from '../_shared/supabase-client.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { httpJson } from '../_shared/http.ts';
import { handleExceptionWithContext, createErrorResponse, ErrorCode } from '../_shared/error-handler.ts';
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

// Configuration for the Router Adapter
const ACTION_TO_FUNCTION: Record<string, string> = {
  'security:scan-vulnerabilities': 'scan-vulnerabilities',
  'security:fido2-register': 'fido2-register',
  'build:build-agent-exe': 'build-agent-exe',
  'build:generate-deploy-package': 'generate-deploy-package',
  'build:generate-portable-installer': 'generate-portable-installer',
  'build:auto-generate-enrollment': 'auto-generate-enrollment',
  'build:register-agent-release': 'register-agent-release',
  'build:sign-release': 'sign-release',
  'build:upload-release-content': 'upload-release-content',
  'build:validate-build-pipeline': 'validate-build-pipeline',
  'agent:get-agent-script-content': 'get-agent-script-content',
  'agent:promote-agent-v5': 'promote-agent-v5',
  'agent:setup-agent-script': 'setup-agent-script',
  'agent:force-reinstall-fleet': 'force-reinstall-fleet',
  'agent:create-reinstall-jobs': 'create-reinstall-jobs',
  'agent:action-center-feed': 'action-center-feed',
  'agent:ai-action-executor': 'ai-action-executor',
  'agent:ai-agent-assist': 'ai-agent-assist',
  'agent:ai-analyze-agent': 'ai-analyze-agent',
  'agent:ai-full-audit': 'ai-full-audit',
  'agent:ai-quality-check': 'ai-quality-check',
  'agent:ai-red-team-assessment': 'ai-red-team-assessment',
  'agent:ai-router': 'ai-router',
  'agent:ai-system-audit': 'ai-system-audit',
};

const INLINED_HANDLERS: Record<string, any> = {
  'billing:cohort-analysis': handleCohortAnalysisV2,
  'billing:unit-economics': handleUnitEconomicsV2,
  'billing:list-invoices': handleListInvoicesV2,
  'billing:customer-portal': handleCustomerPortalV2,
  'billing:check-subscription': handleCheckSubscriptionV2,
  'billing:create-checkout': handleCreateCheckoutV2,
  'billing:charge-subscription': handleChargeSubscription,
  'billing:security-cleanup': handleSecurityCleanup,
  'security:security-cleanup': handleSecurityCleanup,
  'security:auto-block-threats': handleAutoBlockThreats,
  'security:check-credential-leaks': handleCheckCredentialLeaks,
  'security:clear-failed-logins': handleClearFailedLogins,
  'security:classify-shadow-it': handleClassifyShadowIt,
  'security:threat-intelligence-lookup': handleThreatIntelligenceLookup,
  'security:build-security-graph': handleBuildSecurityGraph,
  'security:activate-agent-honeypot': handleActivateAgentHoneypot,
  'security:revert-agent-honeypot': handleRevertAgentHoneypot,
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
  'agent:agent-snapshot': handleAgentSnapshot,
  'agent:check-agent-name-availability': handleCheckAgentNameAvailability,
  'agent:diagnose-agent': handleDiagnoseAgent,
  'agent:get-agent-timeline': handleGetAgentTimeline,
  'build:build-callback': handleBuildCallback,
  'admin:accept-invite': handleAcceptInvite,
  'admin:delete-invite': handleDeleteInvite,
  'admin:send-invite': handleSendInvite,
  'build:generate-enrollment-key': handleGenerateEnrollmentKey,
  'build:revoke-enrollment-key': handleRevokeEnrollmentKey,
  'agent:get-software-inventory': handleGetSoftwareInventory,
  'agent:get-web-activity': handleGetWebActivity,
  'agent:get-agent-dashboard-data': handleGetAgentDashboardData,
  'agent:token-rotate': handleTokenRotate,
  'agent:recover-agent-credentials': handleRecoverAgentCredentials,
  'agent:agent-version-management': handleAgentVersionManagement,
  'security:analyze-url': handleAnalyzeUrl,
  'security:siem-export': handleSiemExport,
  'security:security-advisor': handleSecurityAdvisor,
  'admin:change-password': handleChangePassword,
  'admin:create-job': handleCreateJob,
  'security:sync-cve-database': handleSyncCveDatabase,
  'security:mitre-sync': handleMitreSync,
  'security:translate-cve': handleTranslateCve,
  'security:calculate-compliance': handleCalculateCompliance,
  'security:export-evidence-bundle': handleExportEvidenceBundle,
  'admin:tenant-features': handleTenantFeatures,
  'admin:tenant-info': handleTenantInfo,
  'admin:tenant-stats': handleTenantStats,
};

// Initialize Hexagonal Components
import { SupabaseRouterAdapter } from './infrastructure/router/adapters/supabase-router-adapter.ts';
import { ActionDispatcherUseCase } from './domain/router/use-cases/action-dispatcher.ts';
import { validateDispatch } from '../_shared/schemas/registry.ts'; // Correção F-002: Validador de perímetro

const routerAdapter = new SupabaseRouterAdapter(ACTION_TO_FUNCTION, INLINED_HANDLERS);
const actionDispatcher = new ActionDispatcherUseCase(routerAdapter);

// ALL_VALID_ACTIONS Set is derived from keys of ACTION_TO_FUNCTION and INLINED_HANDLERS
// and is checked inside the actionDispatcher logic.
// Keeping it here for backward compatibility if any middleware uses it.

// Correção F-002: Validação estrita do envelope de requisição do gateway
const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()).default({}), // Garantindo chaves de string e valor desconhecido, mas validado pelos handlers
});

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// Removed duplicate Set definition

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
    if (!parsed.success) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid request', 400, requestId, origin);
    }

    const { action, payload } = parsed.data;

    // Use Hexagonal Dispatcher - It will handle the action check internally and return 400 if unknown
    const dispatchContext = {
      supabase: supabaseAny,
      requestId,
      userId: validatedCtx.userId || undefined,
      tenantId: validatedCtx.tenantId || undefined,
      req,
      forwardHeaders
    };

    // Override the router's default proxy fetch with our retry-enabled httpJson if needed
    // But since the dispatcher is internal, we should ensure the adapter/use-case uses the right tool.
    // For now, we handle the result.
    const result = await actionDispatcher.dispatch(action, payload, dispatchContext);

    const elapsed = Date.now() - startedAt;

    if (result instanceof Response) {
      logger.info(`[api-gateway] ${action} proxied in ${elapsed}ms (status: ${result.status})`);
      return result;
    }

    logger.info(`[api-gateway] ${action} handled in ${elapsed}ms`);

    const resultObj = result as Record<string, unknown>;
    const status = typeof resultObj?.__status === 'number' ? resultObj.__status : 200;
    
    if (typeof resultObj?.__status === 'number') {
      const { __status, ...rest } = resultObj;
      if (__status >= 400) {
        const errMessage =
          typeof rest.error === 'string'
            ? rest.error
            : (rest.message as string) || 'Internal Gateway Error';
        return createErrorResponse(
          ErrorCode.INTERNAL_ERROR,
          errMessage,
          __status,
          requestId,
          origin,
        );
      }
      return jsonRes(rest, __status, origin);
    }
    
    return jsonRes(result, 200, origin);
  } catch (err) {
    return handleExceptionWithContext(err, requestId, 'api-gateway', startedAt, {
      operation: 'dispatch',
      tenantId: (body as any)?.payload?.tenant_id
    }, origin);
  }
}, {
  rateLimit: {
    endpoint: 'api-gateway',
    maxRequests: 200,
    windowMinutes: 1
  }
});