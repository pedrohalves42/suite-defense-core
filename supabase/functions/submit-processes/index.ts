/**
 * submit-processes — PROXY STUB
 * Delegates to the consolidated handler in _shared/submit-handlers.
 * Kept for backward compatibility with agents using the legacy URL.
 * 
 * NOTE: Previously used raw Deno.serve() with manual auth.
 * Now uses serveAgent middleware for consistency.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleProcesses } from '../_shared/submit-handlers/processes.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body, agentData } = ctx;
  return handleProcesses(supabase, agentId, agentName, tenantId, requestId, body as Record<string, unknown>, agentData);
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-processes', maxRequests: 60, windowMinutes: 60, blockMinutes: 10 },
});
