// @ts-nocheck
/**
 * submit-rollback-event — PROXY STUB
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleRollbackEvent } from '../_shared/submit-handlers/rollback-event.ts';
import { validateAgentBody } from '../_shared/schemas/agent-submit.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body, agentData } = ctx;
  const validated = validateAgentBody(body);
  if (!validated.ok) return validated.response;
  return handleRollbackEvent(supabase, agentId, agentName, tenantId, requestId, validated.data as Record<string, unknown>, agentData);
}, {
  hmacVerify: true,
  extraAgentFields: ['agent_version'],
});