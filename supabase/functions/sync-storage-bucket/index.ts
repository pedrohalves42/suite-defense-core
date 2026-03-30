/**
 * Sync Storage Bucket - Migrated to serveTenant middleware
 * Auth: JWT (super_admin) via serveTenant
 *
 * Sincroniza scripts de agent_releases para o storage bucket como fallback de emergencia.
 * Garante que o storage bucket sempre tenha a mesma versao que a tabela agent_releases.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const SyncSchema = z.object({
  platform: z.enum(['windows', 'linux', 'macos']).default('windows'),
  force: z.boolean().default(false),
});

serveTenant(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const parsed = SyncSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { platform, force } = parsed.data;

  logger.info(`[${requestId}] Starting storage bucket sync for ${platform}...`);

  // Fetch active release
  const { data: releaseData, error: releaseError } = await supabase
    .from('agent_releases')
    .select('script_content, version, sha256, created_at')
    .eq('platform', platform)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (releaseError || !releaseData?.script_content) {
    logger.error(`[${requestId}] No active release found:`, releaseError);
    return new Response(
      JSON.stringify({ error: `No active ${platform} release found`, requestId }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { script_content, version } = releaseData;
  logger.info(`[${requestId}] Found active release: ${version} (${script_content.length} bytes)`);

  // Calculate SHA256
  const encoder = new TextEncoder();
  const data = encoder.encode(script_content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const calculatedSha256 = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Determine storage path
  const scriptFileName = platform === 'windows'
    ? 'cybershield-agent-windows-v3.ps1'
    : platform === 'linux'
      ? 'cybershield-agent-linux-v3.sh'
      : 'cybershield-agent-macos-v3.sh';

  const filePath = `scripts/${scriptFileName}`;

  // Check if update is needed
  let needsUpdate = force;
  let currentStorageHash = '';

  if (!force) {
    try {
      const { data: currentFile, error: downloadError } = await supabase.storage
        .from('agent-installers')
        .download(filePath);

      if (!downloadError && currentFile) {
        const currentContent = await currentFile.text();
        const currentBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(currentContent));
        currentStorageHash = Array.from(new Uint8Array(currentBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        if (currentStorageHash === calculatedSha256) {
          logger.info(`[${requestId}] Storage already synced with version ${version}`);
          return {
            success: true,
            synced: false,
            message: 'Storage bucket already synced with latest release',
            version,
            sha256: calculatedSha256,
            platform,
            requestId,
          };
        }
        needsUpdate = true;
      } else {
        needsUpdate = true;
      }
    } catch {
      needsUpdate = true;
    }
  }

  if (!needsUpdate) {
    return { success: true, synced: false, message: 'No update needed', version, requestId };
  }

  // Upload to storage
  logger.info(`[${requestId}] Uploading ${version} to storage bucket (${script_content.length} bytes)...`);

  const { error: uploadError } = await supabase.storage
    .from('agent-installers')
    .upload(filePath, new Blob([script_content], { type: 'application/octet-stream' }), {
      upsert: true,
      contentType: 'application/octet-stream',
    });

  if (uploadError) {
    logger.error(`[${requestId}] Upload failed:`, uploadError);
    throw uploadError;
  }

  logger.info(`[${requestId}] Storage bucket synced: ${version} (${calculatedSha256.substring(0, 32)}...)`);

  return {
    success: true,
    synced: true,
    message: `Storage bucket synced with ${version}`,
    platform,
    version,
    file_path: filePath,
    size_bytes: script_content.length,
    sha256: calculatedSha256,
    previous_hash: currentStorageHash || null,
    requestId,
  };
}, { methods: ['POST'], skipTenantValidation: true });
