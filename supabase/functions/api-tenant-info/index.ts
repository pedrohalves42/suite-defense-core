import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticateApiKey, logApiRequest } from '../_shared/api-auth.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Extract API key from Authorization header
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

    // Authenticate
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

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, authResult.apiKeyId!, 'api-tenant-info', {
      maxRequests: 100,
      windowMinutes: 1,
      blockMinutes: 5,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          resetAt: rateLimitResult.resetAt 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch tenant info
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, name, slug, created_at, updated_at')
      .eq('id', authResult.tenantId!)
      .single();

    if (error) throw error;

    const responseTimeMs = Date.now() - startTime;

    // Log request
    await logApiRequest(supabase, {
      apiKeyId: authResult.apiKeyId!,
      tenantId: authResult.tenantId!,
      endpoint: '/api/tenant/info',
      method: req.method,
      statusCode: 200,
      responseTimeMs,
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    });

    return new Response(
      JSON.stringify(tenant),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in api-tenant-info:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
