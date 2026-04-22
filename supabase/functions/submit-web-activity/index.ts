/**
 * submit-web-activity — PROXY STUB
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleWebActivity } from '../_shared/submit-handlers/web-activity.ts';
import { validateAgentBody } from '../_shared/schemas/agent-submit.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  const validated = validateAgentBody(body);
  if (!validated.ok) return validated.response;
  return handleWebActivity(supabase, agentId, agentName, tenantId, requestId, validated.data as Record<string, unknown>);
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-web-activity', maxRequests: 20, windowMinutes: 60, blockMinutes: 10 },
});
