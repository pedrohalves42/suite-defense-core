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

import { serveAgent } from '../_shared/serve-agent.ts';

serveAgent(async (req, ctx) => {
  const { requestId, supabase: supabaseAny, agentId, agentName, tenantId, agentData } = ctx;
  const traceId = requestId;
  const origin = req.headers.get("origin");

  try {
    const supabase = supabaseAny;

    // Offline guard (>2h)
    const offlineGuard = await checkOfflineGuard(supabase, { agentId, agentName, tenantId }, origin);
    if (offlineGuard) return offlineGuard;

    // Backlog limit check
    const backlogGuard = await checkBacklogLimit(supabase, { agentId, agentName, tenantId }, origin);
    if (backlogGuard) return backlogGuard;

    // Claim and deliver jobs
    logger.info('Fetching jobs for agent', { agentName, agentId, traceId });
    return await claimAndBuildResponse(supabase, { agentId, agentName, tenantId }, origin);

  } catch (error) {
    return handleException(error, traceId, 'poll-jobs');
  }
}, {
  rateLimit: {
    endpoint: 'poll-jobs',
    maxRequests: 30, // Relaxed from 3 per min to 30 per min to handle fleet bursts
    windowMinutes: 1,
    blockMinutes: 5,
  }
});
