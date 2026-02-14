import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');

interface PlatformConfig {
  storagePath: string;
  versionRegex: RegExp;
}

const PLATFORMS: Record<string, PlatformConfig> = {
  windows: {
    storagePath: 'scripts/cybershield-agent-windows-v5.ps1',
    versionRegex: /AgentVersion\s*=\s*"([^"]+)"/,
  },
  linux: {
    storagePath: 'scripts/cybershield-agent-linux-v5.sh',
    versionRegex: /AGENT_VERSION="([^"]+)"/,
  },
  macos: {
    storagePath: 'scripts/cybershield-agent-macos-v5.sh',
    versionRegex: /AGENT_VERSION="([^"]+)"/,
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: internal secret, service role, or one-time setup token
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  const isInternal = token === INTERNAL_SECRET;
  const isInternal = token === INTERNAL_SECRET;
  const isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY;
  if (!isInternal && !isServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] populate-releases started`);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const targetVersion = body.version; // optional override
    const results: Record<string, unknown> = {};

    for (const [platform, config] of Object.entries(PLATFORMS)) {
      try {
        // Download script from Storage
        const { data: signedUrlData } = await supabase.storage
          .from('agent-installers')
          .createSignedUrl(config.storagePath, 120);

        if (!signedUrlData?.signedUrl) {
          results[platform] = { error: 'Script not found in Storage', path: config.storagePath };
          continue;
        }

        const response = await fetch(signedUrlData.signedUrl);
        if (!response.ok) {
          results[platform] = { error: `Fetch failed: ${response.status}` };
          continue;
        }

        const scriptContent = await response.text();
        if (scriptContent.length < 1000) {
          results[platform] = { error: `Script too small: ${scriptContent.length} bytes` };
          continue;
        }

        // Extract version
        const versionMatch = scriptContent.match(config.versionRegex);
        const version = targetVersion || (versionMatch ? versionMatch[1] : 'unknown');

        // Calculate SHA256
        const encoder = new TextEncoder();
        const data = encoder.encode(scriptContent);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Upsert into agent_releases
        const { error: upsertError } = await supabase
          .from('agent_releases')
          .update({
            script_content: scriptContent,
            sha256,
            release_notes: `${version}: Auto-populated from Storage at ${new Date().toISOString()}`,
          })
          .eq('version', version)
          .eq('platform', platform);

        if (upsertError) {
          // Try insert if update matched nothing
          const { error: insertError } = await supabase
            .from('agent_releases')
            .insert({
              version,
              platform,
              channel: 'stable',
              is_active: true,
              script_content: scriptContent,
              sha256,
              release_notes: `${version}: Auto-populated from Storage`,
            });

          if (insertError) {
            results[platform] = { error: `DB error: ${insertError.message}` };
            continue;
          }
        }

        results[platform] = {
          success: true,
          version,
          size: scriptContent.length,
          sha256: sha256.substring(0, 16) + '...',
        };

      } catch (err) {
        results[platform] = { error: (err as Error).message };
      }
    }

    return new Response(JSON.stringify({ requestId, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message, requestId }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
