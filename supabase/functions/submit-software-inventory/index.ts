/**
 * submit-software-inventory — PROXY STUB
 * Delegates to the consolidated handler in submit-hmac-router.
 * Kept for backward compatibility with agents using the legacy URL.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleSoftwareInventory } from '../submit-hmac-router/handlers/software-inventory.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  return handleSoftwareInventory(supabase, agentId, agentName, tenantId, requestId, body as Record<string, unknown>);
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-software-inventory', maxRequests: 60, windowMinutes: 60, blockMinutes: 10 },
});
