import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download script from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('agent-installers')
      .download('v5.0.14/cybershield-agent-windows-v5.ps1');

    if (downloadError || !fileData) {
      return new Response(JSON.stringify({ error: 'Failed to download from storage', details: downloadError }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const scriptBytes = new Uint8Array(await fileData.arrayBuffer());
    const scriptText = new TextDecoder().decode(scriptBytes);
    
    // Base64 encode (handle UTF-8 properly)
    const base64Content = btoa(Array.from(scriptBytes).map(b => String.fromCharCode(b)).join(''));
    
    // SHA256
    const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Update release
    const { error: updateError } = await supabase
      .from('agent_releases')
      .update({ script_content: base64Content, sha256 })
      .eq('version', 'v5.0.14')
      .eq('platform', 'windows')
      .eq('is_active', true);

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Failed to update release', details: updateError }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      sha256,
      script_size: scriptBytes.length,
      base64_size: base64Content.length
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
