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

    // Create Supabase client with service role
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }
    
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.74.0');
    const supabase = createClient(SUPABASE_URL, supabaseServiceKey);

    // Fetch the source script from public directory via HTTP
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

    // Check current Storage version for comparison
    let currentHash = '';
    let needsUpdate = true;
    
    try {
      const storageUrl = `${SUPABASE_URL}/storage/v1/object/public/agent-installers/cybershield-agent-windows.ps1`;
      const storageResponse = await fetch(storageUrl);
      
      if (storageResponse.ok) {
        const currentContent = await storageResponse.text();
        const currentData = encoder.encode(currentContent);
        const currentHashBuffer = await crypto.subtle.digest('SHA-256', currentData);
        const currentHashArray = Array.from(new Uint8Array(currentHashBuffer));
        currentHash = currentHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        needsUpdate = (currentHash !== sourceHash);
        console.log(`[${requestId}] Current storage script hash: ${currentHash}`);
      } else {
        console.log(`[${requestId}] No existing storage script, will upload`);
      }
    } catch (error) {
      console.log(`[${requestId}] Error checking storage, will upload:`, error);
    }

    if (!needsUpdate) {
      console.log(`[${requestId}] Storage script is already up to date`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Storage script already in sync',
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

    // Upload updated content to Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('agent-installers')
      .upload('cybershield-agent-windows.ps1', sourceContent, {
        contentType: 'text/plain; charset=utf-8',
        upsert: true
      });
    
    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }
    
    console.log(`[${requestId}] Successfully synchronized agent script to storage`);
    console.log(`[${requestId}] Previous hash: ${currentHash || 'none'}`);
    console.log(`[${requestId}] New hash: ${sourceHash}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Agent script synchronized to storage successfully',
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
