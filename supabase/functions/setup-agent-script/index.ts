import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }


  const requestId = crypto.randomUUID();
  logger.info(`[${requestId}] Setup agent script in storage`);

  try {
    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // FASE 1 CRITICO: Fetch agent script from storage
    logger.info(`[${requestId}] Fetching agent script from storage`);
    
    const { validateAgentScriptContent } = await import('../_shared/agent-script-validator.ts');
    
    // Buscar script do storage bucket
    const { data: fileData, error: storageError } = await supabase.storage
      .from('agent-installers')
      .download('scripts/cybershield-agent-windows-v3.ps1');
    
    if (storageError || !fileData) {
      logger.error(`[${requestId}] Failed to fetch script from storage:`, storageError);
      return new Response(
        JSON.stringify({
          error: 'Agent script not found',
          message: 'Script not found in storage bucket',
          requestId
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    const scriptContent = await fileData.text();
    
    if (!validateAgentScriptContent(scriptContent)) {
      logger.error(`[${requestId}] CRITICAL: Script validation failed`);
      return new Response(
        JSON.stringify({
          error: 'Agent script validation failed',
          message: 'Script content is invalid or corrupted',
          requestId
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    logger.info(`[${requestId}] Agent script validated`, { 
      size: scriptContent.length,
      sizeKB: (scriptContent.length / 1024).toFixed(2)
    });

    // Upload to storage bucket
    const { data, error } = await supabase.storage
      .from('agent-installers')
      .upload('cybershield-agent-windows.ps1', scriptContent, {
        contentType: 'text/plain',
        upsert: true
      });

    if (error) {
      logger.error(`[${requestId}] Storage upload failed:`, error);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to upload to storage',
          details: error.message,
          requestId
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Calculate hash for verification
    const { calculateScriptHash } = await import('../_shared/agent-script-validator.ts');
    const hash = await calculateScriptHash(scriptContent);

    logger.info(`[${requestId}] Agent script uploaded successfully`);
    logger.info(`[${requestId}] Size: ${scriptContent.length} bytes`);
    logger.info(`[${requestId}] SHA256: ${hash}`);

    // Generate signed URL (valid for 15 minutes) instead of public URL
    const { data: signedUrlData } = await supabase.storage
      .from('agent-installers')
      .createSignedUrl('cybershield-agent-windows.ps1', 900); // 15 minutes

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Agent script uploaded to storage successfully',
        size: scriptContent.length,
        sha256: hash,
        path: data.path,
        signedUrl: signedUrlData?.signedUrl || null,
        requestId,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    logger.error(`[${requestId}] Setup failed:`, error);
    return new Response(
      JSON.stringify({
        error: 'Setup failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
