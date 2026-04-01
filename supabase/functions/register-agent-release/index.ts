/**
 * register-agent-release — Migrated to serveTenant middleware
 * Requires super_admin role.
 * SSA-004: Auto-signs releases with Ed25519 if private key available.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { signPayload } from '../_shared/crypto-utils.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ED25519_PRIVATE_KEY = Deno.env.get('ED25519_PRIVATE_KEY');

const RegisterReleaseSchema = z.object({
  platform: z.enum(['windows', 'linux', 'macos']),
  version: z.string().min(1).max(32),
  script_content: z.string().min(10000).max(5_000_000),
  release_notes: z.string().max(5000).optional(),
  channel: z.string().max(32).default('stable'),
  manual_sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  signature_base64: z.string().max(2048).optional(),
  signed_by: z.string().max(100).optional(),
});

function normalizeVersion(version: string | null | undefined): string {
  return (version ?? '').trim().toLowerCase().replace(/^v/, '');
}

function extractEmbeddedVersion(scriptContent: string): string | null {
  const patterns = [
    /CyberShield\s+Agent\s*-\s*(?:Windows|Linux|macOS)\s+v?(\d+\.\d+\.\d+)/i,
    /AGENT_VERSION\s*=\s*["']v?(\d+\.\d+\.\d+)["']/i,
    /\$AgentVersion\s*=\s*["']v?(\d+\.\d+\.\d+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = scriptContent.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

serveTenant(async (req, ctx) => {
  const { supabase, userId } = ctx;
  const origin = req.headers.get('origin');
  const requestId = crypto.randomUUID();

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId!);
  if (!roles?.some(r => r.role === 'super_admin')) {
    return new Response(JSON.stringify({ error: 'Requires super_admin role' }), { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  const parsed = RegisterReleaseSchema.safeParse(ctx.body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
  const { platform, version, script_content: scriptStr, release_notes, channel, manual_sha256, signature_base64, signed_by } = parsed.data;

  // Platform validation
  // Platform validation
  const scriptTrimmed = scriptStr.trim();
  const isWindowsScript = scriptTrimmed.startsWith('<#') || scriptTrimmed.startsWith('param(');
  const isUnixScript = scriptTrimmed.startsWith('#!/');

  if (platform === 'windows' && !isWindowsScript) {
    return new Response(JSON.stringify({ error: 'Platform mismatch: Windows scripts must start with <# or param()', detected: isUnixScript ? 'Unix/macOS bash script' : 'Unknown script type' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
  if ((platform === 'linux' || platform === 'macos') && !isUnixScript) {
    return new Response(JSON.stringify({ error: 'Platform mismatch: Linux/macOS scripts must start with #!/', detected: isWindowsScript ? 'Windows PowerShell script' : 'Unknown script type' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  // Embedded version validation
  const embeddedVersion = extractEmbeddedVersion(scriptStr);
  if (!embeddedVersion) {
    return new Response(JSON.stringify({ error: 'Embedded version not found in script content' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
  if (normalizeVersion(embeddedVersion) !== normalizeVersion(version)) {
    return new Response(JSON.stringify({ error: 'Embedded script version mismatch', declared_version: version, embedded_version: embeddedVersion }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  // SHA256
  let sha256: string;
  if (manual_sha256) {
    sha256 = manual_sha256 as string;
  } else {
    const data = new TextEncoder().encode(scriptStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Deactivate previous versions
  await supabase.from('agent_versions').update({ is_latest: false }).eq('platform', platform);
  await supabase.from('agent_releases').update({ is_active: false }).eq('platform', platform).eq('channel', channel);

  // Auto-sign
  let finalSignature = signature_base64 as string | undefined;
  let finalSignedBy = (signed_by as string) || 'manual';
  if (!finalSignature && ED25519_PRIVATE_KEY) {
    try {
      finalSignature = await signPayload(`release:${platform}:${version}:${sha256}`, ED25519_PRIVATE_KEY);
      finalSignedBy = 'automation';
    } catch (signError) {
      logger.error('[register-agent-release] Failed to auto-sign release', { requestId, error: (signError as Error).message });
    }
  }

  const releaseData: Record<string, unknown> = {
    platform, version, channel, script_content: scriptStr, sha256,
    release_notes: release_notes || `Release ${version}`, is_active: true, created_by: userId,
  };
  if (finalSignature) {
    releaseData.signature_base64 = finalSignature;
    releaseData.signed_at = new Date().toISOString();
    releaseData.signed_by = finalSignedBy;
  }

  const { error: releaseError } = await supabase.from('agent_releases').upsert(releaseData, { onConflict: 'platform,version,channel' });
  if (releaseError) throw releaseError;

  const { error: versionError } = await supabase.from('agent_versions').upsert({
    platform, version, is_latest: true, sha256, size_bytes: scriptStr.length,
    download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`,
    release_notes: release_notes || `Release ${version}`
  }, { onConflict: 'platform,version' });
  if (versionError) throw versionError;

  logger.info('[register-agent-release] Release registered successfully', { requestId, platform, version });

  return { success: true, platform, version, sha256, size_bytes: scriptStr.length, signature_present: !!finalSignature, signed_by: finalSignedBy || null };
}, { skipTenantValidation: true });
