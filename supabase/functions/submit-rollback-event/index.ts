/**
 * submit-rollback-event — PROXY STUB
 * Delegates to the consolidated handler in _shared/submit-handlers.
 * Kept for backward compatibility with agents using the legacy URL.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleRollbackEvent } from '../_shared/submit-handlers/rollback-event.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body, agentData } = ctx;
  return handleRollbackEvent(supabase, agentId, agentName, tenantId, requestId, body as Record<string, unknown>, agentData);
}, {
  hmacVerify: true,
  extraAgentFields: ['agent_version'],
});
