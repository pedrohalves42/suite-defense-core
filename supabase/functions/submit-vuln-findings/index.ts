/**
 * submit-vuln-findings — PROXY STUB
 * Delegates to the consolidated handler in submit-hmac-router.
 * Kept for backward compatibility with agents using the legacy URL.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleVulnFindings } from '../submit-hmac-router/handlers/vuln-findings.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  return handleVulnFindings(supabase, agentId, agentName, tenantId, requestId, body as Record<string, unknown>);
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-vuln-findings', maxRequests: 10, windowMinutes: 60, blockMinutes: 10 },
});
