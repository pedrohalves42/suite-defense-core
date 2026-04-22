/**
 * submit-vuln-findings — PROXY STUB
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleVulnFindings } from '../_shared/submit-handlers/vuln-findings.ts';
import { validateAgentBody } from '../_shared/schemas/agent-submit.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  const validated = validateAgentBody(body);
  if (!validated.ok) return validated.response;
  return handleVulnFindings(supabase, agentId, agentName, tenantId, requestId, validated.data as Record<string, unknown>);
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-vuln-findings', maxRequests: 10, windowMinutes: 60, blockMinutes: 10 },
});
