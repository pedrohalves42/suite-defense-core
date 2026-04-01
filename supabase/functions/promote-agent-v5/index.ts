/**
 * promote-agent-v5 — Migrated to serveTenant middleware
 * Emergency sync utility for v5.0.15.
 * Auth: super_admin or internal caller
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { signPayload } from '../_shared/crypto-utils.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ED25519_PRIVATE_KEY = Deno.env.get('ED25519_PRIVATE_KEY');
const VERSION = 'v5.0.15';
const CHANNEL = 'stable';

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

function normalizeScriptForPlatform(platform: string, scriptContent: string): string {
  if (platform === 'windows') return scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
  return scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function sha256Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

serveTenant(async (req, ctx) => {
  const { supabase, userId, isInternal } = ctx;
  const origin = req.headers.get('origin');

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: buildCorsHeaders(origin) });
  }

  // If not internal, verify super_admin
  if (!isInternal) {
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId!);
    if (!roles?.some(r => r.role === 'super_admin')) {
      return new Response(JSON.stringify({ error: 'Requires super_admin role' }), { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
  }

  let body: Record<string, unknown> = {};
  try { body = ctx.body as Record<string, unknown>; } catch { /* empty body ok */ }
  const results: Record<string, unknown> = {};

  const platforms = [
    { platform: 'windows', file: 'cybershield-agent-windows-v5.ps1' },
    { platform: 'linux', file: 'cybershield-agent-linux-v5.sh' },
    { platform: 'macos', file: 'cybershield-agent-macos-v5.sh' },
  ];

  for (const { platform, file } of platforms) {
    try {
      let scriptContent: string | null = null;
      const bodyScripts = body?.scripts as Record<string, string> | undefined;
      if (bodyScripts?.[platform]) scriptContent = bodyScripts[platform];

      if (!scriptContent) {
        try { scriptContent = await Deno.readTextFile(new URL(`../_shared/agent-scripts/${file}`, import.meta.url)); } catch { /* continue */ }
      }
      if (!scriptContent) {
        const possiblePaths = [`/home/deno/functions/_shared/agent-scripts/${file}`];
        for (const path of possiblePaths) {
          try { scriptContent = await Deno.readTextFile(path); break; } catch { continue; }
        }
      }
      if (!scriptContent) throw new Error(`Script file not found: ${file}`);

      const trimmed = scriptContent.trimStart();
      if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) throw new Error('Script content is corrupted HTML');

      const embeddedVersion = extractEmbeddedVersion(scriptContent);
      if (!embeddedVersion) throw new Error('Embedded script version not found');
      if (normalizeVersion(embeddedVersion) !== normalizeVersion(VERSION)) throw new Error(`Embedded version mismatch: ${embeddedVersion} != ${VERSION}`);

      const normalized = normalizeScriptForPlatform(platform, scriptContent);
      const hash = await sha256Hex(normalized);

      let signatureBase64: string | null = null;
      let signedAt: string | null = null;
      let signedBy: string | null = null;

      if (ED25519_PRIVATE_KEY) {
        signatureBase64 = await signPayload(`release:${platform}:${VERSION}:${hash}`, ED25519_PRIVATE_KEY);
        signedAt = new Date().toISOString();
        signedBy = 'automation';
      }

      await supabase.from('agent_releases').update({ is_active: false }).eq('platform', platform).eq('channel', CHANNEL).neq('version', VERSION);

      const { error: releaseError } = await supabase.from('agent_releases').upsert({
        platform, version: VERSION, channel: CHANNEL, script_content: normalized, sha256: hash, is_active: true,
        release_notes: `Sync of authoritative ${VERSION} scripts`,
        signature_base64: signatureBase64, signed_at: signedAt, signed_by: signedBy,
      }, { onConflict: 'platform,version,channel' });
      if (releaseError) throw releaseError;

      await supabase.from('agent_versions').update({ is_latest: false }).eq('platform', platform);
      const { error: versionError } = await supabase.from('agent_versions').upsert({
        platform, version: VERSION, is_latest: true, sha256: hash, size_bytes: normalized.length,
        download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`,
        release_notes: `Emergency re-sync of authoritative ${VERSION} scripts`,
      }, { onConflict: 'platform,version' });
      if (versionError) throw versionError;

      results[platform] = { success: true, version: VERSION, sha256: hash, signed: !!signatureBase64 };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : JSON.stringify(error);
      logger.error(`[promote-agent-v5] ${platform} failed:`, errMsg);
      results[platform] = { success: false, error: errMsg };
    }
  }

  return { success: true, version: VERSION, results };
}, { skipTenantValidation: true });
