/**
 * submit-processes — PROXY STUB
 * Delegates to the consolidated handler in _shared/submit-handlers.
 * Kept for backward compatibility with agents using the legacy URL.
 * 
 * IMPORTANT: This function does NOT use HMAC verification.
 * The original submit-processes used raw Deno.serve() with token-only auth.
 * Using serveAgent without hmacVerify preserves this behavior.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { handleProcesses } from '../_shared/submit-handlers/processes.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  return handleProcesses(supabase, agentId, agentName, tenantId, requestId, body as Record<string, unknown>);
}, {
  rateLimit: { endpoint: 'submit-processes', maxRequests: 60, windowMinutes: 60, blockMinutes: 10 },
});
