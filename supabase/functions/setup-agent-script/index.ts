import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Setup agent script in storage`);

  try {
    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // FASE 1 CRÍTICO: Use inline agent script
    console.log(`[${requestId}] Using inline agent script`);
    const { getAgentScriptWindows, validateAgentScript } = await import('../_shared/agent-script-windows-content.ts');
    const scriptContent = getAgentScriptWindows();
    
    if (!validateAgentScript(scriptContent)) {
      console.error(`[${requestId}] CRITICAL: Inline script validation failed`);
      return new Response(
        JSON.stringify({
          error: 'Agent script validation failed',
          message: 'Inline script content is invalid or corrupted',
          requestId
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    console.log(`[${requestId}] Agent script validated`, { 
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
      console.error(`[${requestId}] Storage upload failed:`, error);
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
    const { calculateScriptHash } = await import('../_shared/agent-script-windows-content.ts');
    const hash = await calculateScriptHash(scriptContent);

    console.log(`[${requestId}] Agent script uploaded successfully`);
    console.log(`[${requestId}] Size: ${scriptContent.length} bytes`);
    console.log(`[${requestId}] SHA256: ${hash}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Agent script uploaded to storage successfully',
        size: scriptContent.length,
        sha256: hash,
        path: data.path,
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/agent-installers/cybershield-agent-windows.ps1`,
        requestId,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Setup failed:`, error);
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
