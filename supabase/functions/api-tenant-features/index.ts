import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticateApiKey, logApiRequest, hasScope } from '../_shared/api-auth.ts';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const apiKey = req.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing API key' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const authResult = await authenticateApiKey(apiKey, supabaseUrl, supabaseServiceKey);
    
    if (!authResult.success) {
      return new Response(
        JSON.stringify({ error: authResult.error }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check scope
    if (!hasScope(authResult.scopes!, 'read')) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch tenant features
    const { data: features, error } = await supabase
      .from('tenant_features')
      .select('feature_key, enabled, quota_limit, quota_used, metadata')
      .eq('tenant_id', authResult.tenantId!)
      .order('feature_key');

    if (error) throw error;

    const responseTimeMs = Date.now() - startTime;

    await logApiRequest(supabase, {
      apiKeyId: authResult.apiKeyId!,
      tenantId: authResult.tenantId!,
      endpoint: '/api/tenant/features',
      method: req.method,
      statusCode: 200,
      responseTimeMs,
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    });

    return new Response(
      JSON.stringify({ features }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in api-tenant-features:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
