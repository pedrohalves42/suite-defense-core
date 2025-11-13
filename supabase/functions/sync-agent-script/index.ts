import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Starting agent script synchronization`);

  try {
    // Verify internal authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${INTERNAL_SECRET}`) {
      console.warn(`[${requestId}] Unauthorized sync attempt`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Read the source file from public directory via HTTP
    const sourceUrl = `${SUPABASE_URL}/agent-scripts/cybershield-agent-windows.ps1`;
    console.log(`[${requestId}] Fetching source script from: ${sourceUrl}`);
    
    const sourceResponse = await fetch(sourceUrl);
    if (!sourceResponse.ok) {
      throw new Error(`Failed to fetch source script: ${sourceResponse.status}`);
    }
    
    const sourceContent = await sourceResponse.text();
    
    // Validate source content
    if (!sourceContent || sourceContent.length < 1000) {
      throw new Error(`Source script is too small: ${sourceContent.length} bytes`);
    }

    if (!sourceContent.includes('CyberShield Agent')) {
      throw new Error('Source script does not appear to be a valid CyberShield agent script');
    }

    // Calculate SHA256 of source
    const encoder = new TextEncoder();
    const data = encoder.encode(sourceContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sourceHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    console.log(`[${requestId}] Source script validation:`, {
      size: sourceContent.length,
      hash: sourceHash,
      preview: sourceContent.substring(0, 100)
    });

    // Read current _shared version for comparison
    let currentHash = '';
    let needsUpdate = true;
    
    try {
      const sharedPath = new URL('../_shared/agent-script-windows.ps1', import.meta.url).pathname;
      const currentContent = await Deno.readTextFile(sharedPath);
      
      const currentData = encoder.encode(currentContent);
      const currentHashBuffer = await crypto.subtle.digest('SHA-256', currentData);
      const currentHashArray = Array.from(new Uint8Array(currentHashBuffer));
      currentHash = currentHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      needsUpdate = (currentHash !== sourceHash);
      console.log(`[${requestId}] Current _shared script hash: ${currentHash}`);
    } catch (error) {
      console.log(`[${requestId}] No existing _shared script or read error, will create new`);
    }

    if (!needsUpdate) {
      console.log(`[${requestId}] Scripts are already in sync, no update needed`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Scripts already in sync',
          sourceHash,
          currentHash,
          size: sourceContent.length,
          timestamp: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Write updated content to _shared directory
    const sharedPath = new URL('../_shared/agent-script-windows.ps1', import.meta.url).pathname;
    await Deno.writeTextFile(sharedPath, sourceContent);
    
    console.log(`[${requestId}] Successfully synchronized agent script`);
    console.log(`[${requestId}] Old hash: ${currentHash || 'none'}`);
    console.log(`[${requestId}] New hash: ${sourceHash}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Agent script synchronized successfully',
        previousHash: currentHash || null,
        newHash: sourceHash,
        size: sourceContent.length,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Sync failed:`, error);
    return new Response(
      JSON.stringify({
        error: 'Synchronization failed',
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
