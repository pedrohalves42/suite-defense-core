import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * FASE 3: Edge Function para registrar novas releases de agentes
 * 
 * Permite que o deploy automatizado registre novas versoes nas tabelas
 * agent_releases e agent_versions sem necessidade de SQL manual.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    logger.info('[register-agent-release] Request received', { requestId });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verificar autenticacao (super admin ou deploy automation)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se e super admin
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roles || roles.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Requires super_admin role' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse payload
    const payload = await req.json();
    const { platform, version, script_content, release_notes, channel = 'stable', manual_sha256 } = payload;

    if (!platform || !version || !script_content) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: platform, version, script_content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use manual SHA256 if provided (for BOM compatibility with old agents)
    // Otherwise calculate SHA256 normally
    let sha256: string;
    if (manual_sha256) {
      sha256 = manual_sha256;
      logger.info('[register-agent-release] Using manual SHA256', {
        requestId,
        manual_sha256: sha256.substring(0, 16) + '...'
      });
    } else {
      const encoder = new TextEncoder();
      const data = encoder.encode(script_content);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    logger.info('[register-agent-release] Registering new release', {
      requestId,
      platform,
      version,
      sha256: sha256.substring(0, 16) + '...',
      size: script_content.length
    });

    // Desativar versoes anteriores como "latest"
    await supabase
      .from('agent_versions')
      .update({ is_latest: false })
      .eq('platform', platform);

    await supabase
      .from('agent_releases')
      .update({ is_active: false })
      .eq('platform', platform)
      .eq('channel', channel);

    // Inserir em agent_releases
    const { error: releaseError } = await supabase
      .from('agent_releases')
      .upsert({
        platform,
        version,
        channel,
        script_content,
        sha256,
        release_notes: release_notes || `Release ${version}`,
        is_active: true,
        created_by: user.id
      }, {
        onConflict: 'platform,version,channel'
      });

    if (releaseError) {
      logger.error('[register-agent-release] Failed to insert agent_releases', {
        requestId,
        error: releaseError
      });
      throw releaseError;
    }

    // Inserir em agent_versions
    const { error: versionError } = await supabase
      .from('agent_versions')
      .upsert({
        platform,
        version,
        is_latest: true,
        sha256,
        size_bytes: script_content.length,
        download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`,
        release_notes: release_notes || `Release ${version}`
      }, {
        onConflict: 'platform,version'
      });

    if (versionError) {
      logger.error('[register-agent-release] Failed to insert agent_versions', {
        requestId,
        error: versionError
      });
      throw versionError;
    }

    logger.info('[register-agent-release] Release registered successfully', {
      requestId,
      platform,
      version
    });

    return new Response(
      JSON.stringify({
        success: true,
        platform,
        version,
        sha256,
        size_bytes: script_content.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const err = error as Error;
    logger.error('[register-agent-release] Internal error', {
      requestId,
      error: err.message,
      stack: err.stack
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: err.message,
        requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
