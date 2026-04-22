/**
 * submit-software-inventory — PROXY STUB
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleSoftwareInventory } from '../_shared/submit-handlers/software-inventory.ts';
import { validateAgentBody } from '../_shared/schemas/agent-submit.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  const validated = validateAgentBody(body);
  if (!validated.ok) return validated.response;
  return handleSoftwareInventory(supabase, agentId, agentName, tenantId, requestId, validated.data as Record<string, unknown>);
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-software-inventory', maxRequests: 60, windowMinutes: 60, blockMinutes: 10 },
});
