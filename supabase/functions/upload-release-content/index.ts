/**
 * upload-release-content - Migrated to serveInternal
 * Auth: Internal (X-Internal-Secret or service_role)
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;
  const { platform, version, content, release_notes } = body as Record<string, string>;

  if (!platform || !version || !content) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: platform, version, content' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[upload-release-content][${requestId}] Uploading ${platform}/${version} (${content.length} chars)`);

  // Validate content
  const trimmed = content.trimStart();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return new Response(
      JSON.stringify({ error: 'Content appears to be HTML, not a script' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Normalize line endings
  const normalized = platform === 'windows'
    ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
    : content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Calculate SHA-256
  const bytes = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Sign with ECDSA if key available
  let signatureBase64: string | null = null;
  const ecdsaPrivateKeyB64 = Deno.env.get('ECDSA_PRIVATE_KEY');

  if (ecdsaPrivateKeyB64) {
    try {
      const keyData = base64ToArrayBuffer(ecdsaPrivateKeyB64);
      const privateKey = await crypto.subtle.importKey('pkcs8', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
      const signatureBuffer = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes);
      signatureBase64 = arrayBufferToBase64(signatureBuffer);
    } catch (signErr) {
      logger.warn(`[upload-release-content][${requestId}] Signing failed:`, (signErr as Error).message);
    }
  }

  // Deactivate previous releases
  await supabase.from('agent_releases').update({ is_active: false }).eq('platform', platform).eq('channel', 'stable');

  // Upsert release
  const releaseData: Record<string, unknown> = {
    platform, version, channel: 'stable', script_content: normalized, sha256,
    is_active: true, release_notes: release_notes || `Release ${version}`,
  };

  if (signatureBase64) {
    releaseData.signature_base64 = signatureBase64;
    releaseData.signed_at = new Date().toISOString();
    releaseData.signed_by = 'automation';
  }

  const { error: releaseError } = await supabase.from('agent_releases').upsert(releaseData, { onConflict: 'platform,version,channel' });
  if (releaseError) throw releaseError;

  // Update agent_versions
  await supabase.from('agent_versions').update({ is_latest: false }).eq('platform', platform);
  const { error: versionError } = await supabase.from('agent_versions').upsert({
    platform, version, is_latest: true, sha256, size_bytes: normalized.length,
    download_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/serve-agent-update`,
    release_notes: release_notes || `Release ${version}`,
  }, { onConflict: 'platform,version' });
  if (versionError) throw versionError;

  logger.info(`[upload-release-content][${requestId}] Uploaded successfully: ${sha256.slice(0, 16)}...`);

  return { success: true, platform, version, sha256, size_bytes: normalized.length, signed: !!signatureBase64 };
});
