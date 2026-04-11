/**
 * submit-antivirus-status — PROXY STUB
 * Delegates to the consolidated handler in submit-hmac-router.
 * Kept for backward compatibility with agents using the legacy URL.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleAntivirusStatus } from '../submit-hmac-router/handlers/antivirus-status.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  return handleAntivirusStatus(supabase, agentId, agentName, tenantId, requestId, body as Record<string, unknown>);
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-antivirus-status', maxRequests: 20, windowMinutes: 60, blockMinutes: 10 },
});
