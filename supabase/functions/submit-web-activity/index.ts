/**
 * submit-web-activity — PROXY STUB
 * Delegates to the consolidated handler in submit-hmac-router.
 * Kept for backward compatibility with agents using the legacy URL.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleWebActivity } from '../submit-hmac-router/handlers/web-activity.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  return handleWebActivity(supabase, agentId, agentName, tenantId, requestId, body as Record<string, unknown>);
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-web-activity', maxRequests: 20, windowMinutes: 60, blockMinutes: 10 },
});
