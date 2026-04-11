/**
 * submit-system-metrics — PROXY STUB
 * Delegates to the consolidated handler in _shared/submit-handlers.
 * Kept for backward compatibility with agents using the legacy URL.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleSystemMetrics } from '../_shared/submit-handlers/system-metrics.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body, agentData } = ctx;
  return handleSystemMetrics(supabase, agentId, agentName, tenantId, requestId, body as Record<string, unknown>, agentData);
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-system-metrics', maxRequests: 60, windowMinutes: 60, blockMinutes: 10 },
});
