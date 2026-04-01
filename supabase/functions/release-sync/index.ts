/**
 * release-sync - Consolidated release sync function
 * Migrated to serveInternal middleware
 * Auth: Internal only (service_role / X-Internal-Secret)
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const ReleaseSyncSchema = z.object({
  action: z.enum(['sync_content', 'sync_from_repo', 'sync_all', 'validate']).default('sync_all'),
  platform: z.enum(['windows', 'linux', 'macos']).optional(),
  version: z.string().max(32).optional(),
});

interface SyncResult {
  action: string; success: boolean; releases_processed: number;
  releases_updated: number; errors: string[]; duration_ms: number;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;
  const startedAt = Date.now();

  const parsed = ReleaseSyncSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { action, platform, version } = parsed.data;

  logger.info(`[release-sync][${requestId}] action=${action} platform=${platform || 'all'} version=${version || 'latest'}`);

  const result: SyncResult = { action, success: false, releases_processed: 0, releases_updated: 0, errors: [], duration_ms: 0 };

  let query = supabase.from('agent_releases').select('id, version, platform, script_content, is_active, download_url, storage_path');
  if (platform) query = query.eq('platform', platform);
  if (version) query = query.eq('version', version);
  if (action !== 'validate') query = query.eq('is_active', true);

  const { data: releases, error: fetchErr } = await query;
  if (fetchErr) { result.errors.push(fetchErr.message); result.duration_ms = Date.now() - startedAt; return result; }
  if (!releases || releases.length === 0) { result.success = true; result.duration_ms = Date.now() - startedAt; return result; }

  result.releases_processed = releases.length;

  for (const release of releases) {
    try {
      if (action === 'validate') {
        if (!release.script_content && !release.storage_path) {
          result.errors.push(`Release ${release.version}/${release.platform}: no content or storage path`);
        }
        continue;
      }

      if (!release.script_content && release.storage_path) {
        const { data: fileData, error: dlErr } = await supabase.storage.from('agent-installers').download(release.storage_path);
        if (dlErr || !fileData) { result.errors.push(`Release ${release.version}: storage download failed`); continue; }
        const content = await fileData.text();
        const { error: updateErr } = await supabase.from('agent_releases').update({ script_content: content }).eq('id', release.id);
        if (updateErr) { result.errors.push(`Release ${release.version}: update failed`); } else { result.releases_updated++; }
      } else if (release.script_content && (action === 'sync_from_repo' || action === 'sync_all')) {
        const storagePath = `scripts/${release.platform}/${release.version}/install.ps1`;
        const { error: uploadErr } = await supabase.storage.from('agent-installers').upload(storagePath, new Blob([release.script_content]), { upsert: true, contentType: 'text/plain' });
        if (uploadErr) { result.errors.push(`Release ${release.version}: storage upload failed`); } else {
          await supabase.from('agent_releases').update({ storage_path: storagePath }).eq('id', release.id);
          result.releases_updated++;
        }
      }
    } catch (e) { result.errors.push(`Release ${release.version}: ${String(e)}`); }
  }

  result.success = result.errors.length === 0;
  result.duration_ms = Date.now() - startedAt;

  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'release-sync', p_status: result.success ? 'success' : 'partial', p_details: { ...result, requestId } }); } catch (err) { logger.warn('[release-sync] log_scheduled_job_run failed', err); }

  return { ...result, requestId };
});
