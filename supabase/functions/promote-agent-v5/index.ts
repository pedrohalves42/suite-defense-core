import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { signPayload } from '../_shared/crypto-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ED25519_PRIVATE_KEY = Deno.env.get('ED25519_PRIVATE_KEY');

const VERSION = 'v5.0.14';
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
  if (platform === 'windows') {
    return scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
  }

  return scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function sha256Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function requireSuperAdmin(supabase: ReturnType<typeof createClient>, req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing authorization');
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  if (rolesError) {
    throw new Error(rolesError.message);
  }

  const isSuperAdmin = roles?.some((role) => role.role === 'super_admin');
  if (!isSuperAdmin) {
    throw new Error('Requires super_admin role');
  }

  return user;
}

/**
 * Emergency sync utility for v5.0.14.
 * Reads the authoritative v5 scripts from _shared/agent-scripts,
 * validates the embedded version, re-signs them, and updates agent_releases/agent_versions.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Allow internal/service_role calls (e.g. from curl_edge_functions tooling)
    const authHeader = req.headers.get('Authorization') ?? '';
    const isServiceRole = authHeader.replace('Bearer ', '') === SUPABASE_SERVICE_ROLE_KEY;
    const user = isServiceRole
      ? { id: 'service_role', email: 'system@internal' }
      : await requireSuperAdmin(supabase, req);
    const results: Record<string, unknown> = {};

    const platforms = [
      { platform: 'windows', file: 'cybershield-agent-windows-v5.ps1' },
      { platform: 'linux', file: 'cybershield-agent-linux-v5.sh' },
      { platform: 'macos', file: 'cybershield-agent-macos-v5.sh' },
    ];

    for (const { platform, file } of platforms) {
      try {
        let scriptContent: string | null = null;
        const possiblePaths = [
          `/home/deno/functions/_shared/agent-scripts/${file}`,
          `../_shared/agent-scripts/${file}`,
          `./_shared/agent-scripts/${file}`,
        ];

        for (const path of possiblePaths) {
          try {
            scriptContent = await Deno.readTextFile(path);
            break;
          } catch {
            continue;
          }
        }

        if (!scriptContent) {
          throw new Error(`Script file not found: ${file}`);
        }

        const trimmed = scriptContent.trimStart();
        if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
          throw new Error('Script content is corrupted HTML');
        }

        const embeddedVersion = extractEmbeddedVersion(scriptContent);
        if (!embeddedVersion) {
          throw new Error('Embedded script version not found');
        }

        if (normalizeVersion(embeddedVersion) !== normalizeVersion(VERSION)) {
          throw new Error(`Embedded version mismatch: ${embeddedVersion} != ${VERSION}`);
        }

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

        await supabase
          .from('agent_releases')
          .update({ is_active: false })
          .eq('platform', platform)
          .eq('channel', CHANNEL)
          .neq('version', VERSION);

        const { error: releaseError } = await supabase
          .from('agent_releases')
          .upsert({
            platform,
            version: VERSION,
            channel: CHANNEL,
            script_content: normalized,
            sha256: hash,
            is_active: true,
            release_notes: `Emergency re-sync of authoritative ${VERSION} scripts`,
            created_by: user.id,
            signature_base64: signatureBase64,
            signed_at: signedAt,
            signed_by: signedBy,
          }, {
            onConflict: 'platform,version,channel',
          });

        if (releaseError) throw releaseError;

        await supabase
          .from('agent_versions')
          .update({ is_latest: false })
          .eq('platform', platform);

        const { error: versionError } = await supabase
          .from('agent_versions')
          .upsert({
            platform,
            version: VERSION,
            is_latest: true,
            sha256: hash,
            size_bytes: normalized.length,
            download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`,
            release_notes: `Emergency re-sync of authoritative ${VERSION} scripts`,
          }, {
            onConflict: 'platform,version',
          });

        if (versionError) throw versionError;

        results[platform] = {
          success: true,
          version: VERSION,
          sha256: hash,
          signed: !!signatureBase64,
        };
      } catch (error) {
        results[platform] = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return new Response(JSON.stringify({ success: true, version: VERSION, results }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Missing authorization' || message === 'Unauthorized'
      ? 401
      : message === 'Requires super_admin role'
        ? 403
        : 500;

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});