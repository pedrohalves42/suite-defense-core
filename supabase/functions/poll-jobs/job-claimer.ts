/**
 * Job claiming, validation, signing and response building for poll-jobs
 * Extraído de poll-jobs/index.ts para modularização
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { signJob } from '../_shared/crypto-utils.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import type { AuthenticatedAgent } from './auth-handler.ts';

interface ClaimedJob {
  job_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  execution_id: string;
  nonce: string;
  payload_hash: string;
  expires_at: string;
  execution_index: number | null;
  previous_execution_hash: string | null;
}

const MAX_PENDING_JOBS = 50;

export function emptyResponse(isLegacyAgent: boolean, origin: string | null): Response {
  return new Response(
    JSON.stringify(isLegacyAgent ? [] : { jobs: [], poll_interval_seconds: 600 }),
    { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }, status: 200 }
  );
}

export async function checkOfflineGuard(
  supabase: SupabaseClient,
  agent: AuthenticatedAgent,
  origin: string | null,
): Promise<Response | null> {
  const now = new Date();
  const lastHeartbeat = agent.lastHeartbeat ? new Date(agent.lastHeartbeat) : null;
  const hoursSinceHeartbeat = lastHeartbeat
    ? (now.getTime() - lastHeartbeat.getTime()) / (1000 * 60 * 60)
    : Infinity;

  if (hoursSinceHeartbeat > 2) {
    logger.warn('Agent was offline >2h, updating heartbeat but not delivering jobs yet', {
      agentName: agent.agentName,
      hoursSinceHeartbeat: hoursSinceHeartbeat.toFixed(2),
    });

    await supabase.from('agents').update({ last_heartbeat: now.toISOString(), status: 'active' }).eq('id', agent.agentId);
    await supabase.from('agent_tokens').update({ last_used_at: now.toISOString() }).eq('token_hash', agent.tokenHash);

    return emptyResponse(agent.isLegacyAgent, origin);
  }

  await supabase.from('agent_tokens').update({ last_used_at: now.toISOString() }).eq('token_hash', agent.tokenHash);
  return null;
}

export async function checkBacklogLimit(
  supabase: SupabaseClient,
  agent: AuthenticatedAgent,
  origin: string | null,
): Promise<Response | null> {
  const { count: pendingCount, error: countError } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agent.agentId)
    .in('status', ['queued', 'delivered']);

  if (!countError && (pendingCount || 0) >= MAX_PENDING_JOBS) {
    logger.warn('SSA-026: Agent hit job limit', { agentName: agent.agentName, pendingCount, maxLimit: MAX_PENDING_JOBS });
    return emptyResponse(agent.isLegacyAgent, origin);
  }
  return null;
}

export async function claimAndBuildResponse(
  supabase: SupabaseClient,
  agent: AuthenticatedAgent,
  origin: string | null,
): Promise<Response> {
  const { data: jobs, error: jobsError } = await supabase
    .rpc('claim_jobs_for_agent', { p_agent_id: agent.agentId, p_limit: 3 }) as { data: ClaimedJob[] | null; error: { message: string } | null };

  if (jobsError) {
    logger.error('Error claiming jobs', { error: jobsError.message, agentName: agent.agentName });
    return emptyResponse(agent.isLegacyAgent, origin);
  }

  const validJobs = (jobs || []).filter((job: ClaimedJob) => {
    if (!job || !job.job_id || typeof job.job_id !== 'string') return false;
    if (!job.job_type || typeof job.job_type !== 'string') return false;
    if (job.payload === undefined || job.payload === null) return false;
    if (!job.execution_id || typeof job.execution_id !== 'string') return false;
    return true;
  });

  if (validJobs.length === 0) {
    return emptyResponse(agent.isLegacyAgent, origin);
  }

  const privateKey = Deno.env.get('ED25519_PRIVATE_KEY');
  const signingEnabled = !!privateKey;

  const jobsResponse = await Promise.all(validJobs.map(async (j: ClaimedJob) => {
    let signatureInfo: { payload_signature?: string; signing_alg?: string } = {};

    if (signingEnabled && privateKey) {
      try {
        const signed = await signJob(j.job_id, j.job_type, j.payload || {}, privateKey);
        signatureInfo = { payload_signature: signed.signature, signing_alg: signed.algorithm };
      } catch (signError) {
        logger.error('CRITICAL: Failed to sign job - SKIPPING', { jobId: j.job_id, error: signError instanceof Error ? signError.message : 'Unknown' });
        return null;
      }
    }

    return {
      id: j.job_id,
      type: j.job_type,
      job_type: j.job_type,
      payload: j.payload || {},
      approved: true,
      agent_id: agent.agentId,
      expires_at: j.expires_at,
      execution_id: j.execution_id,
      nonce: j.nonce,
      payload_hash: j.payload_hash,
      execution_index: j.execution_index,
      previous_execution_hash: j.previous_execution_hash,
      ...signatureInfo,
    };
  })).then(results => results.filter(Boolean));

  logger.info('Jobs delivered via atomic claim with audit trail', { agentName: agent.agentName, count: jobsResponse.length });

  if (agent.isLegacyAgent) {
    const recoveryTypes = ['update_agent', 'reinstall_agent', 'force_update'];
    const recoveryJobs = jobsResponse.filter(j => j && recoveryTypes.includes(j.type || j.job_type || ''));
    const blockedJobIds = jobsResponse
      .filter(j => j && !recoveryTypes.includes(j.type || j.job_type || ''))
      .map(j => j!.id)
      .filter(Boolean);

    if (blockedJobIds.length > 0) {
      await supabase
        .from('jobs')
        .update({ status: 'cancelled', error_message: `Blocked: agent ${agent.agentVersion} is legacy and cannot process this job type.` })
        .in('id', blockedJobIds);
    }

    return new Response(JSON.stringify(recoveryJobs), {
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  return new Response(
    JSON.stringify({ jobs: jobsResponse, poll_interval_seconds: 600 }),
    { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }, status: 200 }
  );
}
