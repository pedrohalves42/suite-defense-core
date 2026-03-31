/**
 * check-agent-updates — Migrated to serveAgent middleware with HMAC verification.
 * Returns latest version info for the agent's platform.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { normalizeVersion } from '../_shared/hexagonal/update-decision-service.ts';
import { logger } from '../_shared/logger.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentName, requestId, agentData } = ctx;

  const platform = ((agentData.os_type as string) || 'windows').toLowerCase();
  logger.info(`[${requestId}] Agent: ${agentName}, Platform: ${platform}`);

  const { data: latestRelease, error: releaseError } = await supabase
    .from('agent_releases')
    .select('version, platform, sha256, release_notes, created_at')
    .eq('platform', platform)
    .eq('channel', 'stable')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (releaseError || !latestRelease) {
    return { has_update: false, message: 'No updates available', requestId };
  }

  const currentNorm = normalizeVersion(agentData.agent_version as string | null);
  const latestNorm = normalizeVersion(latestRelease.version);
  const hasUpdate = currentNorm !== latestNorm;

  return {
    has_update: hasUpdate,
    current_version: agentData.agent_version,
    latest_version: latestRelease.version,
    version: latestRelease.version,
    platform: latestRelease.platform,
    sha256: latestRelease.sha256,
    release_notes: hasUpdate ? latestRelease.release_notes : null,
    requestId,
  };
}, {
  hmacVerify: true,
  extraAgentFields: ['os_type', 'agent_version'],
});
