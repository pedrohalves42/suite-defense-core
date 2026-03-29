import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

/**
 * Sync Storage Bucket
 * 
 * Sincroniza scripts de agent_releases para o storage bucket como fallback de emergencia.
 * Garante que o storage bucket sempre tenha a mesma versao que a tabela agent_releases.
 */

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const requestId = crypto.randomUUID();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[${requestId}] Starting storage bucket sync...`);

  try {
    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { platform = 'windows', force = false } = body;

    if (!['windows', 'linux', 'macos'].includes(platform)) {
      return new Response(
        JSON.stringify({ error: 'Invalid platform', requestId }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Check for internal secret or Authorization header
    const authHeader = req.headers.get('Authorization');
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') || Deno.env.get('INTERNAL_SECRET');
    
    let isAuthorized = false;
    
    // Check internal secret first (supports both header formats)
    if (internalSecret) {
      if (authHeader === `Bearer ${internalSecret}` || authHeader === internalSecret) {
        isAuthorized = true;
        logger.info(`[${requestId}] Authorized via internal secret`);
      }
    }
    
    // Check user auth if no internal secret match
    if (!isAuthorized && authHeader?.startsWith('Bearer ')) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (!userError && user) {
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        
        const { data: isSuperAdmin } = await supabaseAdmin.rpc('has_role', {
          _user_id: user.id,
          _role: 'super_admin'
        });
        
        if (isSuperAdmin) {
          isAuthorized = true;
          logger.info(`[${requestId}] Authorized via super_admin role`);
        }
      }
    }
    
    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', requestId }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch active release from agent_releases
    logger.info(`[${requestId}] Fetching active ${platform} release from database...`);
    
    const { data: releaseData, error: releaseError } = await supabaseAdmin
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
        JSON.stringify({ 
          error: `No active ${platform} release found in agent_releases`,
          requestId 
        }),
        { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const { script_content, version, sha256: dbSha256 } = releaseData;
    
    logger.info(`[${requestId}] Found active release: ${version} (${script_content.length} bytes)`);

    // Calculate SHA256 of script content
    const encoder = new TextEncoder();
    const data = encoder.encode(script_content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const calculatedSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Determine storage file path
    const scriptFileName = platform === 'windows' 
      ? 'cybershield-agent-windows-v3.ps1'
      : platform === 'linux'
        ? 'cybershield-agent-linux-v3.sh'
        : 'cybershield-agent-macos-v3.sh';

    const filePath = `scripts/${scriptFileName}`;

    // Check current storage version (by downloading and comparing hash)
    let needsUpdate = force;
    let currentStorageHash = '';
    
    if (!force) {
      try {
        const { data: currentFile, error: downloadError } = await supabaseAdmin.storage
          .from('agent-installers')
          .download(filePath);

        if (!downloadError && currentFile) {
          const currentContent = await currentFile.text();
          const currentBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(currentContent));
          const currentArray = Array.from(new Uint8Array(currentBuffer));
          currentStorageHash = currentArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          logger.info(`[${requestId}] Current storage hash: ${currentStorageHash.substring(0, 16)}...`);
          logger.info(`[${requestId}] Database release hash: ${calculatedSha256.substring(0, 16)}...`);
          
          if (currentStorageHash === calculatedSha256) {
            logger.info(`[${requestId}] Storage already synced with version ${version}`);
            return new Response(
              JSON.stringify({
                success: true,
                synced: false,
                message: 'Storage bucket already synced with latest release',
                version,
                sha256: calculatedSha256,
                platform,
                requestId
              }),
              { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
            );
          }
          
          needsUpdate = true;
          logger.info(`[${requestId}] Hash mismatch - sync required`);
        } else {
          needsUpdate = true;
          logger.info(`[${requestId}] File not in storage or error - upload required`);
        }
      } catch (e) {
        needsUpdate = true;
        logger.info(`[${requestId}] Error checking storage: ${e}`);
      }
    }

    if (!needsUpdate) {
      return new Response(
        JSON.stringify({
          success: true,
          synced: false,
          message: 'No update needed',
          version,
          requestId
        }),
        { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Upload to storage bucket
    logger.info(`[${requestId}] Uploading ${version} to storage bucket (${script_content.length} bytes)...`);
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from('agent-installers')
      .upload(filePath, new Blob([script_content], { type: 'application/octet-stream' }), {
        upsert: true,
        contentType: 'application/octet-stream'
      });

    if (uploadError) {
      logger.error(`[${requestId}] Upload failed:`, uploadError);
      throw uploadError;
    }

    logger.info(`[${requestId}] [OK]  Storage bucket synced successfully!`);
    logger.info(`[${requestId}] Version: ${version}`);
    logger.info(`[${requestId}] Size: ${script_content.length} bytes`);
    logger.info(`[${requestId}] SHA256: ${calculatedSha256.substring(0, 32)}...`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: true,
        message: `Storage bucket synced with ${version}`,
        platform,
        version,
        file_path: filePath,
        size_bytes: script_content.length,
        sha256: calculatedSha256,
        previous_hash: currentStorageHash || null,
        requestId
      }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        requestId
      }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
