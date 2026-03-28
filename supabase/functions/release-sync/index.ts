import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

/**
 * release-sync ? Consolidated release sync function
 * 
 * Replaces 5 individual sync functions:
 *   sync-release-content, sync-release-from-codebase, sync-release-from-repo,
 *   sync-agent-script, sync-scripts-direct
 * 
 * Usage:
 *   POST /functions/v1/release-sync
 *   Body: {
 *     "action": "sync_content" | "sync_from_repo" | "sync_all" | "validate",
 *     "platform": "windows" | "linux",
 *     "version": "v5.0.7"
 *   }
 *   
 * Auth: Internal only (service_role / X-Internal-Secret)
 */

type SyncAction = 'sync_content' | 'sync_from_repo' | 'sync_all' | 'validate';

interface SyncRequest {
  action?: SyncAction;
  platform?: 'windows' | 'linux';
  version?: string;
}

interface SyncResult {
  action: string;
  success: boolean;
  releases_processed: number;
  releases_updated: number;
  errors: string[];
  duration_ms: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let body: SyncRequest = {};
    try {
      body = await req.json();
    } catch {
      // Default action
    }

    const action = body.action || 'sync_all';
    const platform = body.platform;
    const version = body.version;

    logger.info(`[release-sync][${requestId}] action=${action} platform=${platform || 'all'} version=${version || 'latest'}`);

    const result: SyncResult = {
      action,
      success: false,
      releases_processed: 0,
      releases_updated: 0,
      errors: [],
      duration_ms: 0,
    };

    // Build query for releases
    let query = supabase
      .from('agent_releases')
      .select('id, version, platform, script_content, is_active, download_url, storage_path');

    if (platform) query = query.eq('platform', platform);
    if (version) query = query.eq('version', version);
    if (action !== 'validate') query = query.eq('is_active', true);

    const { data: releases, error: fetchErr } = await query;

    if (fetchErr) {
      result.errors.push(fetchErr.message);
      return respond(result, requestId, startedAt);
    }

    if (!releases || releases.length === 0) {
      logger.info(`[release-sync][${requestId}] No matching releases found`);
      result.success = true;
      return respond(result, requestId, startedAt);
    }

    result.releases_processed = releases.length;

    for (const release of releases) {
      try {
        if (action === 'validate') {
          // Just check if content exists
          if (!release.script_content && !release.storage_path) {
            result.errors.push(`Release ${release.version}/${release.platform}: no content or storage path`);
          }
          continue;
        }

        // sync_content / sync_all: ensure script_content is populated
        if (!release.script_content && release.storage_path) {
          // Try to read from storage bucket
          const { data: fileData, error: dlErr } = await supabase.storage
            .from('agent-installers')
            .download(release.storage_path);

          if (dlErr || !fileData) {
            result.errors.push(`Release ${release.version}: storage download failed ? ${dlErr?.message}`);
            continue;
          }

          const content = await fileData.text();

          const { error: updateErr } = await supabase
            .from('agent_releases')
            .update({ script_content: content })
            .eq('id', release.id);

          if (updateErr) {
            result.errors.push(`Release ${release.version}: update failed ? ${updateErr.message}`);
          } else {
            result.releases_updated++;
          }
        } else if (release.script_content) {
          // Content exists ? if sync_from_repo, push to storage
          if (action === 'sync_from_repo' || action === 'sync_all') {
            const storagePath = `scripts/${release.platform}/${release.version}/install.ps1`;

            const { error: uploadErr } = await supabase.storage
              .from('agent-installers')
              .upload(storagePath, new Blob([release.script_content]), {
                upsert: true,
                contentType: 'text/plain',
              });

            if (uploadErr) {
              result.errors.push(`Release ${release.version}: storage upload failed ? ${uploadErr.message}`);
            } else {
              // Update storage path reference
              await supabase
                .from('agent_releases')
                .update({ storage_path: storagePath })
                .eq('id', release.id);

              result.releases_updated++;
            }
          }
        }
      } catch (e) {
        result.errors.push(`Release ${release.version}: ${String(e)}`);
      }
    }

    result.success = result.errors.length === 0;

    // Log observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'release-sync',
        p_status: result.success ? 'success' : 'partial',
        p_details: { ...result, requestId },
      });
    } catch {
      // Non-critical
    }

    return respond(result, requestId, startedAt);
  } catch (error) {
    logger.error(`[release-sync][${requestId}] Fatal:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal error', message: String(error), requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function respond(result: SyncResult, requestId: string, startedAt: number): Response {
  result.duration_ms = Date.now() - startedAt;
  return new Response(
    JSON.stringify({ ...result, requestId }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
