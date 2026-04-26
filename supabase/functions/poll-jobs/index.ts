// @ts-nocheck
/**
 * poll-jobs - Agent job polling endpoint
 * MODULARIZED: Auth in auth-handler.ts, job logic in job-claimer.ts
 * 
 * Auth: Deno.serve (raw body needed for HMAC verification)
 */
import { requireEnv } from '../_shared/env.ts';
import { createTypedClient } from '../_shared/supabase-client.ts';
import { handleExceptionWithContext } from '../_shared/error-handler.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { authenticateAndValidateAgent } from './auth-handler.ts';
import { emptyResponse, checkOfflineGuard, checkBacklogLimit, claimAndBuildResponse } from './job-claimer.ts';

import { serveAgent } from '../_shared/serve-agent.ts';

serveAgent(async (req, ctx) => {
  const { requestId, supabase: supabaseAny, agentId, agentName, tenantId, agentData } = ctx;
  const startTime = Date.now();
  const traceId = requestId;
  const origin = req.headers.get("origin");

  try {
    const supabase = supabaseAny;

    // Use context data to build AuthenticatedAgent if needed by legacy sub-modules
    const authenticatedAgent = {
      agentId,
      agentName,
      hmacSecret: ctx.hmacSecret || '',
      agentVersion: (agentData.agent_version as string) || '',
      tenantId: tenantId || null,
      lastHeartbeat: (agentData.last_heartbeat as string) || null,
      status: (agentData.status as string) || null,
      tokenHash: '', // We don't have the token hash here, but checkOfflineGuard uses it to update agent_tokens
      isLegacyAgent: false, // Default to false, logic for this is usually in sub-modules
    };

    // Offline guard (>2h)
    const offlineGuard = await checkOfflineGuard(supabase, authenticatedAgent, origin);
    if (offlineGuard) return offlineGuard;

    // Backlog limit check
    const backlogGuard = await checkBacklogLimit(supabase, authenticatedAgent, origin);
    if (backlogGuard) return backlogGuard;

    // Claim and deliver jobs
    logger.info('Fetching jobs for agent', { agentName, agentId, traceId });
    return await claimAndBuildResponse(supabase, authenticatedAgent, origin);

  } catch (error) {
    return handleExceptionWithContext(error, traceId, 'poll-jobs', startTime, {
      tenantId,
      agentId
    });
  }
}, {
  rateLimit: {
    endpoint: 'poll-jobs',
    maxRequests: 30, // Relaxed from 3 per min to 30 per min to handle fleet bursts
    windowMinutes: 1,
    blockMinutes: 5,
  }
});
