// @ts-nocheck
/**
 * public-gateway — Unified Public API Gateway (Phase 5 + 6D + 7)
 *
 * Consolidates servePublic functions that don't require JWT authentication.
 * 
 * Routing:
 *   POST { action: "public:check-failed-logins", payload: {} }
 *   GET  ?action=public:health
 *   GET  ?action=public:approve-via-token&token=...
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { securityHeaders } from '../_shared/security-headers.ts';
import { servePublic } from '../_shared/serve-public.ts';

// Phase 5 Handlers
import { handleCheckFailedLogins, handleRecordFailedLogin } from './handlers/auth-security.ts';
import { handleApproveViaToken } from './handlers/approval.ts';
import { handleSubmitContact } from './handlers/contact.ts';
import { handleHealth } from './handlers/health.ts';
import { handleEvaluateSoftwareRisk } from './handlers/software-risk.ts';
import { handleGetReinstallScript, handleGetReinstallPreserveScript } from './handlers/scripts.ts';

// Phase 6D Handlers
import { handleValidateInvite } from './handlers/validate-invite.ts';
import { handleVerifyDocument } from './handlers/verify-document.ts';
import { handleVerifyComplianceReport } from './handlers/verify-compliance-report.ts';
import { handleTrackInstallationEvent } from './handlers/track-installation.ts';
import { handleValidateHmacSignature } from './handlers/validate-hmac.ts';
import { handleFido2Authenticate } from './handlers/fido2-auth.ts';
import { handleGetReinstallByName } from './handlers/reinstall-by-name.ts';

// Phase 7 Handlers (inlined from standalone servePublic functions)
import { handleGetDiagnosticScript } from '../_shared/handlers/diagnostic-script.ts';
import { handleGetLatestAgentScript } from '../_shared/handlers/latest-agent-script.ts';
import { handleServeInstaller } from '../_shared/handlers/installer.ts';

type PublicHandler = (
  supabase: any,
  req: Request,
  requestId: string,
  payload: Record<string, unknown>,
) => Promise<Response | Record<string, unknown>>;

const INLINED_HANDLERS: Record<string, PublicHandler> = {
  // Phase 5
  'public:check-failed-logins': handleCheckFailedLogins,
  'public:record-failed-login': handleRecordFailedLogin,
  'public:approve-via-token': handleApproveViaToken as PublicHandler,
  'public:submit-contact': handleSubmitContact as PublicHandler,
  'public:health': handleHealth as PublicHandler,
  'public:evaluate-software-risk': handleEvaluateSoftwareRisk,
  'public:get-reinstall-script': handleGetReinstallScript as PublicHandler,
  'public:get-reinstall-preserve-script': handleGetReinstallPreserveScript as PublicHandler,
  // Phase 6D
  'public:validate-invite': handleValidateInvite as PublicHandler,
  'public:verify-document': handleVerifyDocument as PublicHandler,
  'public:verify-compliance-report': handleVerifyComplianceReport as PublicHandler,
  'public:track-installation-event': handleTrackInstallationEvent as PublicHandler,
  'public:validate-hmac-signature': handleValidateHmacSignature as PublicHandler,
  'public:fido2-authenticate': handleFido2Authenticate as PublicHandler,
  'public:get-reinstall-by-name': handleGetReinstallByName as PublicHandler,
  // Phase 7 (inlined servePublic functions)
  'public:get-diagnostic-script': handleGetDiagnosticScript as PublicHandler,
  'public:get-latest-agent-script': handleGetLatestAgentScript as PublicHandler,
  'public:serve-installer': handleServeInstaller as PublicHandler,
};

const ALL_ACTIONS = new Set(Object.keys(INLINED_HANDLERS));

const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCorsHeaders(origin), ...securityHeaders, 'Content-Type': 'application/json' },
  });
}

servePublic(async (req, ctx) => {
  const { requestId, supabase, body: reqBody } = ctx;
  const origin = req.headers.get('origin');
  const startedAt = Date.now();

  try {
    let action: string;
    let payload: Record<string, unknown> = {};

    if (req.method === 'GET') {
      const url = new URL(req.url);
      action = url.searchParams.get('action') || '';
      for (const [key, value] of url.searchParams.entries()) {
        if (key !== 'action') payload[key] = value;
      }
    } else if (req.method === 'POST') {
      const parsed = RouterSchema.safeParse(reqBody);
      if (!parsed.success) {
        return jsonRes({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400, origin);
      }
      action = parsed.data.action;
      payload = parsed.data.payload;
    } else {
      return jsonRes({ error: 'Method not allowed' }, 405, origin);
    }

    if (!ALL_ACTIONS.has(action)) {
      return jsonRes({
        error: `Unknown action: ${action}`,
        available_actions: Array.from(ALL_ACTIONS),
        hint: 'Use format "public:action-name"',
      }, 400, origin);
    }

    const handler = INLINED_HANDLERS[action];
    logger.info(`[public-gateway] ${action}`, { requestId });

    const result = await handler(supabase, req, requestId, payload);

    if (result instanceof Response) return result;

    const resultObj = result as Record<string, unknown>;
    const status = typeof resultObj?.__status === 'number' ? resultObj.__status : 200;
    if (resultObj?.__status) {
      const { __status, ...rest } = resultObj;
      return jsonRes(rest, status, origin);
    }

    const elapsed = Date.now() - startedAt;
    logger.info(`[public-gateway] ${action} done in ${elapsed}ms`);
    return result;
  } catch (err) {
    logger.error('[public-gateway] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown', requestId }, 500, origin);
  }
}, {
  rateLimit: {
    endpoint: 'public-gateway',
    maxRequests: 500,
    windowMinutes: 1
  }
});