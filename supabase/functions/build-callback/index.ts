import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate callback token
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
      logger.warn('Unauthorized callback attempt', { requestId });
      return new Response('Unauthorized', { status: 401 });
    }

    const { build_id, exe_binary_base64, sha256, size_bytes, github_run_id, error } = await req.json();

    logger.info('Build callback received', { requestId, build_id, has_error: !!error });

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (error) {
      // Build failed
      await supabaseClient
        .from('agent_builds')
        .update({
          build_status: 'failed',
          error_message: error,
          github_run_id,
          build_completed_at: new Date().toISOString()
        })
        .eq('id', build_id);
        
      logger.error('Build failed', { requestId, build_id, error });
      
      return new Response(JSON.stringify({ success: false }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Upload EXE to Supabase Storage
    const exeBuffer = Uint8Array.from(atob(exe_binary_base64), c => c.charCodeAt(0));
    
    // Get build info for file path
    const { data: buildData } = await supabaseClient
      .from('agent_builds')
      .select('tenant_id, build_started_at, agents!inner(agent_name)')
      .eq('id', build_id)
      .single();

    if (!buildData) {
      logger.error('Build record not found', { requestId, build_id });
      return new Response(JSON.stringify({ success: false, error: 'Build not found' }), { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Type guard for agents data - using type assertion since we know the structure
    const agentName = (buildData.agents as any)?.agent_name;
      
    if (!agentName) {
      logger.error('Agent name not found', { requestId, build_id });
      return new Response(JSON.stringify({ success: false, error: 'Agent not found' }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const storagePath = `${buildData.tenant_id}/${agentName}-${Date.now()}.exe`;
    
    logger.info('Uploading EXE to storage', { requestId, build_id, storagePath, size_bytes });
    
    const { error: uploadError } = await supabaseClient.storage
      .from('agent-installers')
      .upload(storagePath, exeBuffer, {
        contentType: 'application/octet-stream',
        upsert: true
      });

    if (uploadError) {
      logger.error('Storage upload failed', { error: uploadError, requestId, build_id });
      
      await supabaseClient
        .from('agent_builds')
        .update({
          build_status: 'failed',
          error_message: 'Failed to upload EXE to storage',
          build_completed_at: new Date().toISOString()
        })
        .eq('id', build_id);
        
      return new Response(JSON.stringify({ success: false, error: 'Upload failed' }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate signed URL (valid for 24 hours)
    const { data: downloadUrlData } = await supabaseClient.storage
      .from('agent-installers')
      .createSignedUrl(storagePath, 86400);

    if (!downloadUrlData) {
      logger.error('Failed to create signed URL', { requestId, build_id });
      return new Response(JSON.stringify({ success: false, error: 'URL generation failed' }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate build duration
    const duration = Math.floor((Date.now() - new Date(buildData.build_started_at).getTime()) / 1000);

    // Update build record with success
    await supabaseClient
      .from('agent_builds')
      .update({
        build_status: 'completed',
        build_completed_at: new Date().toISOString(),
        build_duration_seconds: duration,
        file_path: storagePath,
        file_size_bytes: size_bytes,
        sha256_hash: sha256,
        download_url: downloadUrlData.signedUrl,
        download_expires_at: new Date(Date.now() + 86400000).toISOString(),
        github_run_id
      })
      .eq('id', build_id);

    logger.info('Build completed successfully', { 
      requestId, 
      build_id, 
      duration_seconds: duration,
      file_size_mb: (size_bytes / 1024 / 1024).toFixed(2) 
    });

    return new Response(JSON.stringify({ success: true }), { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Callback failed', { error: errorMessage, requestId });
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
