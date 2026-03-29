import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

export interface CachedBuild {
  id: string;
  download_url: string;
  sha256_hash: string | null;
  file_size_bytes: number | null;
}

/**
 * Check if a valid cached build exists for this tenant/script combination.
 * Returns the cached build response if valid, or null if a new build is needed.
 */
export async function checkBuildCache(
  supabase: SupabaseClient,
  tenantId: string,
  scriptHash: string,
  requestId: string
): Promise<Response | null> {
  const { data: cachedBuild } = await supabase
    .from('agent_builds')
    .select('id, download_url, sha256_hash, file_size_bytes, download_expires_at')
    .eq('tenant_id', tenantId)
    .eq('build_status', 'completed')
    .eq('script_hash', scriptHash)
    .order('build_completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cachedBuild?.download_url && cachedBuild.download_expires_at) {
    const expiresAt = new Date(cachedBuild.download_expires_at);
    const now = new Date();
    const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilExpiry > 1) {
      logger.info(`[${requestId}] [OK]  BUILD CACHE HIT`, {
        build_id: cachedBuild.id,
        expires_in_hours: hoursUntilExpiry.toFixed(1),
      });

      return new Response(
        JSON.stringify({
          success: true,
          build_id: cachedBuild.id,
          status: 'cached',
          download_url: cachedBuild.download_url,
          sha256_hash: cachedBuild.sha256_hash,
          file_size_bytes: cachedBuild.file_size_bytes,
          cached: true,
          message: 'Build recuperado do cache (mesmo tenant/script/versao)',
        }),
        { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    } else {
      logger.info(`[${requestId}] Cache expired or expiring soon`, {
        hours_until_expiry: hoursUntilExpiry.toFixed(1),
      });
    }
  } else {
    logger.info(`[${requestId}] No valid cached build found`);
  }

  return null;
}
