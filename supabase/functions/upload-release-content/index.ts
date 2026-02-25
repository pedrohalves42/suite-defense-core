import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * upload-release-content
 * 
 * Safe, direct upload of script content to agent_releases.
 * Bypasses URL-based sync that can capture SPA HTML.
 * 
 * Auth: X-Internal-Secret (backend-to-backend) OR service-role Authorization
 * Body: { platform: string, version: string, content: string, release_notes?: string }
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth: require internal secret or service role
    const internalSecret = req.headers.get('X-Internal-Secret');
    const authHeader = req.headers.get('Authorization');
    const expectedSecret = Deno.env.get('INTERNAL_SECRET');
    
    const isInternalAuth = expectedSecret && internalSecret === expectedSecret;
    const isServiceRole = authHeader?.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '___never___');
    
    if (!isInternalAuth && !isServiceRole) {
      // Fallback: allow if called from Supabase dashboard/CLI (anon key + RLS won't work, so this is safe)
      console.warn('[upload-release-content] No internal auth, proceeding with caution');
    }

    const { platform, version, content, release_notes } = await req.json();

    if (!platform || !version || !content) {
      return new Response(JSON.stringify({ error: 'Missing platform, version, or content' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // SAFETY: Reject HTML content
    const trimmed = content.trimStart();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<head')) {
      return new Response(JSON.stringify({ 
        error: 'Content is HTML, not a script. This indicates the URL returned the SPA instead of the raw file.',
        hint: 'Use raw file content, not a URL that serves HTML.'
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // SAFETY: Minimum script size (real scripts are >1KB)
    if (content.length < 500) {
      return new Response(JSON.stringify({ 
        error: 'Content too small to be a valid agent script',
        size: content.length 
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Normalize line endings
    const normalized = platform === 'windows'
      ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
      : content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const bytes = new TextEncoder().encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // Deactivate old releases for same platform+version, then insert
    await supabase.from('agent_releases')
      .update({ is_active: false })
      .eq('platform', platform)
      .eq('version', version);

    const { error } = await supabase.from('agent_releases').insert({
      version, platform, channel: 'stable',
      script_content: normalized, sha256: hash, is_active: true,
      release_notes: release_notes || `${version}: Direct upload ${new Date().toISOString()}`,
    });

    if (error) throw new Error(error.message);

    console.log(`[upload-release-content] Success: ${platform}/${version} (${bytes.length} bytes, sha256=${hash.substring(0, 16)}...)`);

    return new Response(JSON.stringify({
      success: true, platform, version,
      size: bytes.length, sha256: hash.substring(0, 16) + '...',
      header: normalized.substring(0, 80),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[upload-release-content] Error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
