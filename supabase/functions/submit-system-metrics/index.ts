/**
 * submit-system-metrics — PROXY STUB
 * Delegates to the consolidated handler in _shared/submit-handlers.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleSystemMetrics } from '../_shared/submit-handlers/system-metrics.ts';
import { validateAgentBody } from '../_shared/schemas/agent-submit.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body, agentData } = ctx;
  const validated = validateAgentBody(body);
  if (!validated.ok) return validated.response;
  return handleSystemMetrics(supabase, agentId, agentName, tenantId, requestId, validated.data as Record<string, unknown>, agentData);
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-system-metrics', maxRequests: 60, windowMinutes: 60, blockMinutes: 10 },
});
