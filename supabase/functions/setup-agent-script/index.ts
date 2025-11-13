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

    // Fetch the agent script from public directory via HTTP
    const publicUrl = `${SUPABASE_URL}/agent-scripts/cybershield-agent-windows.ps1`;
    console.log(`[${requestId}] Fetching script from: ${publicUrl}`);
    
    let scriptContent: string;
    
    try {
      const response = await fetch(publicUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      scriptContent = await response.text();
      
      // Validate script content
      if (!scriptContent || scriptContent.length < 1000) {
        throw new Error(`Script too small: ${scriptContent.length} bytes`);
      }
      
      if (!scriptContent.includes('CyberShield Agent')) {
        throw new Error('Invalid script content - missing CyberShield Agent signature');
      }
      
      console.log(`[${requestId}] Successfully fetched script (${scriptContent.length} bytes)`);
    } catch (fetchError) {
      console.error(`[${requestId}] Failed to fetch agent script:`, fetchError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch agent script',
          message: fetchError instanceof Error ? fetchError.message : 'Unknown error',
          source: publicUrl,
          requestId
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

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
    const encoder = new TextEncoder();
    const contentData = encoder.encode(scriptContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', contentData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

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
