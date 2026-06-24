/**
 * poll-jobs - Agent job polling endpoint
 * MODULARIZED: Auth in auth-handler.ts, job logic in job-claimer.ts
 *
 * D6: removed @ts-nocheck. Typing only — no runtime, selection, ordering,
 * payload, auth, HMAC, RLS or contract changes.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import type { Database } from '../_shared/database.types.ts';
import { handleExceptionWithContext } from '../_shared/error-handler.ts';
import { logger } from '../_shared/logger.ts';
import { checkOfflineGuard, checkBacklogLimit, claimAndBuildResponse } from './job-claimer.ts';
import type { AuthenticatedAgent } from './auth-handler.ts';

import { serveAgent } from '../_shared/serve-agent.ts';

/** Narrowing helpers — preserve existing `as string`/`||''` semantics without `any`. */
function asNullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

serveAgent(async (req, ctx) => {
  const { requestId, supabase: supabaseRaw, agentId, agentName, tenantId, agentData } = ctx;
  const startTime = Date.now();
  const traceId = requestId;
  const origin = req.headers.get('origin');

  // Local narrowing only; serveAgent's public AgentContext keeps `any` for back-compat.
  const supabase = supabaseRaw as SupabaseClient<Database>;

  try {
    // Build AuthenticatedAgent for legacy sub-modules (job-claimer / offline / backlog).
    // Fields mirror previous runtime exactly: missing values fall back to '' / null / false.
    const authenticatedAgent: AuthenticatedAgent = {
      agentId,
      agentName,
      hmacSecret: ctx.hmacSecret ?? '',
      agentVersion: asNullableString(agentData.agent_version) ?? '',
      tenantId: tenantId || null,
      lastHeartbeat: asNullableString(agentData.last_heartbeat),
      status: asNullableString(agentData.status),
      tokenHash: '', // not surfaced through serveAgent; sub-modules tolerate empty string
      isLegacyAgent: false, // determined elsewhere; preserved as previous default
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
      agentId,
    });
  }
}, {
  rateLimit: {
    endpoint: 'poll-jobs',
    maxRequests: 10, // Optimized: Reduced from 30 to 10 to decrease DB load and costs
    windowMinutes: 1,
    blockMinutes: 5,
  },
});
