import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { hashToken } from '../_shared/token-hash.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use GET or POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[${requestId}] serve-dns-filter: Request received`);

  try {
    // Validate auth headers
    const agentToken = req.headers.get('x-agent-token');

    if (!agentToken) {
      console.warn(`[${requestId}] Missing agent token`);
      return new Response(
        JSON.stringify({ error: 'Missing authentication headers' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Hash token for secure lookup (consistent with other Edge Functions)
    const tokenHash = await hashToken(agentToken);

    // Lookup agent by token_hash (not plaintext token)
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, tenant_id, hmac_secret)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.warn(`[${requestId}] Invalid agent token`);
      return new Response(
        JSON.stringify({ error: 'Invalid agent token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract agent info from nested object
    const agentInfo = tokenData.agents as unknown as { id: string; agent_name: string; tenant_id: string; hmac_secret: string };
    
    // Verify HMAC signature
    const hmacResult = await verifyHmacSignature(supabase, req, agentInfo.agent_name, agentInfo.hmac_secret);

    if (!hmacResult.valid) {
      console.warn(`[${requestId}] Invalid HMAC signature for agent ${agentInfo.agent_name}: ${hmacResult.errorMessage}`);
      return new Response(
        JSON.stringify({ error: 'Invalid HMAC signature', details: hmacResult.errorMessage }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Authenticated agent: ${agentInfo.agent_name}`);

    // Check if tenant has DNS filter enabled (feature flag)
    const { data: tenantSettings } = await supabase
      .from('tenant_settings')
      .select('dns_local_filter_enabled')
      .eq('tenant_id', agentInfo.tenant_id)
      .single();

    if (!tenantSettings?.dns_local_filter_enabled) {
      console.log(`[${requestId}] DNS filter not enabled for tenant`);
      return new Response(
        JSON.stringify({ 
          error: 'DNS filter not enabled for this tenant',
          enabled: false 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get DNS filter binary info from storage or configuration
    const dnsFilterVersion = '1.0.0';
    const dnsFilterBucket = 'agent-installers';
    const dnsFilterPath = 'dns-filter/cybershield-dns.exe';

    // Try to get signed URL from storage
    let downloadUrl = '';
    let sha256 = '';

    try {
      // Check if file exists and get signed URL
      const { data: signedUrlData, error: signedUrlError } = await supabase
        .storage
        .from(dnsFilterBucket)
        .createSignedUrl(dnsFilterPath, 3600); // 1 hour expiry

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.warn(`[${requestId}] DNS filter binary not found in storage`);
        return new Response(
          JSON.stringify({ 
            error: 'DNS filter binary not available',
            message: 'O binário do DNS filter ainda não foi carregado. Entre em contato com o suporte.'
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      downloadUrl = signedUrlData.signedUrl;

      // Get SHA256 from metadata or separate file
      const { data: hashData } = await supabase
        .storage
        .from(dnsFilterBucket)
        .download(`${dnsFilterPath}.sha256`);

      if (hashData) {
        sha256 = (await hashData.text()).trim().toLowerCase();
      } else {
        // Fallback: use stored hash in database or compute
        console.warn(`[${requestId}] SHA256 file not found, using placeholder`);
        sha256 = 'placeholder-sha256-compute-on-upload';
      }

    } catch (storageError) {
      console.error(`[${requestId}] Storage error:`, storageError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to access DNS filter storage',
          message: 'Erro ao acessar storage do DNS filter'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Serving DNS filter v${dnsFilterVersion} to ${agentInfo.agent_name}`);

    return new Response(
      JSON.stringify({
        version: dnsFilterVersion,
        download_url: downloadUrl,
        sha256: sha256,
        config: {
          listen_addr: '127.0.0.1:53',
          upstream_dns: '1.1.1.1:53',
          fallback_dns: '8.8.8.8:53',
        },
        served_at: new Date().toISOString(),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});