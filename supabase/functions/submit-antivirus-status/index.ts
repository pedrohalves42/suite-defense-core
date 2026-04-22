/**
 * submit-antivirus-status — PROXY STUB
 * Delegates to the consolidated handler in _shared/submit-handlers.
 * Kept for backward compatibility with agents using the legacy URL.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleAntivirusStatus } from '../_shared/submit-handlers/antivirus-status.ts';
import { validateAgentBody } from '../_shared/schemas/agent-submit.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  const validated = validateAgentBody(body);
  if (!validated.ok) return validated.response;
  return handleAntivirusStatus(supabase, agentId, agentName, tenantId, requestId, validated.data as Record<string, unknown>);
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-antivirus-status', maxRequests: 20, windowMinutes: 60, blockMinutes: 10 },
});
