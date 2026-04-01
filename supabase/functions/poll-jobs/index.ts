/**
 * poll-jobs - Agent job polling endpoint
 * MODULARIZED: Auth in auth-handler.ts, job logic in job-claimer.ts
 * 
 * Auth: Deno.serve (raw body needed for HMAC verification)
 */
import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException } from '../_shared/error-handler.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { authenticateAndValidateAgent } from './auth-handler.ts';
import { emptyResponse, checkOfflineGuard, checkBacklogLimit, claimAndBuildResponse } from './job-claimer.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest();
  const methodError = validateHttpMethod(req, ['POST', 'GET']);
  if (methodError) return methodError;

  const traceId = req.headers.get('X-Trace-ID') || req.headers.get('X-Request-ID') || crypto.randomUUID();

  try {
    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

    // Authenticate agent
    const authResult = await authenticateAndValidateAgent(req, supabase, origin);
    if (!authResult.success) return authResult.response;
    const agent = authResult.agent;

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, agent.agentName, 'poll-jobs', { maxRequests: 6, windowMinutes: 1, blockMinutes: 5 });
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit excedido', resetAt: rateLimitResult.resetAt, traceId }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json', 'X-Trace-ID': traceId } });
    }

    logger.debug('Agent polling', { agentName: agent.agentName, traceId });

    // Offline guard (>2h)
    const offlineGuard = await checkOfflineGuard(supabase, agent, origin);
    if (offlineGuard) return offlineGuard;

    // Backlog limit check
    const backlogGuard = await checkBacklogLimit(supabase, agent, origin);
    if (backlogGuard) return backlogGuard;

    // Claim and deliver jobs
    logger.info('Fetching jobs for agent', { agentName: agent.agentName, agentId: agent.agentId, traceId });
    return await claimAndBuildResponse(supabase, agent, origin);

  } catch (error) {
    return handleException(error, traceId, 'poll-jobs');
  }
});
