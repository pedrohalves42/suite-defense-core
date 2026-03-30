/**
 * Rollout policy evaluation and telemetry logging.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

/** Calculate deterministic bucket via SHA256(agent_id) % 100 */
export async function calculateBucket(agentId: string): Promise<number> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(agentId));
  const bytes = new Uint8Array(hash);
  return ((bytes[0] << 8) | bytes[1]) % 100;
}

/** Log rollout decision for telemetry */
export async function logRolloutDecision(
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  platform: string,
  currentVersion: string | null,
  targetVersion: string,
  bucket: number,
  rolloutPercentage: number,
  decision: 'allowed' | 'skipped' | 'no_policy' | 'already_current' | 'force_update',
  requestId: string,
): Promise<void> {
  try {
    await supabase.from('agent_update_decisions').insert({
      agent_id: agentId,
      agent_name: agentName,
      platform,
      target_version: targetVersion,
      bucket,
      rollout_percentage: rolloutPercentage,
      decision,
      current_version: currentVersion,
    });
  } catch (err) {
    logger.warn('[serve-agent-update] Failed to log rollout decision', { requestId, error: err });
  }
}

/** Check rollout policy. Returns a Response if agent is outside rollout, null otherwise. */
export async function checkRolloutPolicy(
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  agentVersion: string | null,
  platform: string,
  bucket: number,
  origin: string | null,
  requestId: string,
): Promise<{ policy: Record<string, unknown> | null; blockedResponse: Response | null }> {
  const { data: rolloutPolicy } = await supabase
    .from('agent_update_policies')
    .select('*')
    .eq('platform', platform)
    .eq('enabled', true)
    .single();

  if (!rolloutPolicy) {
    return { policy: null, blockedResponse: null };
  }

  if (bucket >= rolloutPolicy.rollout_percentage) {
    logger.info('[serve-agent-update] Agente fora do rollout', {
      requestId, agentName, bucket,
      rolloutPercentage: rolloutPolicy.rollout_percentage,
      targetVersion: rolloutPolicy.target_version,
    });

    await logRolloutDecision(supabase, agentId, agentName, platform, agentVersion, rolloutPolicy.target_version, bucket, rolloutPolicy.rollout_percentage, 'skipped', requestId);

    return {
      policy: rolloutPolicy,
      blockedResponse: new Response(
        JSON.stringify({
          message: 'No update available (outside rollout)',
          current_version: agentVersion,
          rollout_bucket: bucket,
          rollout_percentage: rolloutPolicy.rollout_percentage,
        }),
        { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
      ),
    };
  }

  logger.info('[serve-agent-update] Agente dentro do rollout', { requestId, agentName, bucket, rolloutPercentage: rolloutPolicy.rollout_percentage });
  return { policy: rolloutPolicy, blockedResponse: null };
}
