import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate internal caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.slice(0, 20) || '___')) {
      const internalSecret = req.headers.get('x-internal-secret');
      if (internalSecret !== Deno.env.get('INTERNAL_SECRET')) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 1. Run cleanup
    const { data: cleanupResult, error: cleanupError } = await supabase.rpc('cleanup_expired_telemetry');
    if (cleanupError) {
      console.error('[cleanup-telemetry] Cleanup error:', cleanupError.message);
    }

    // 2. Run summarization for each tenant
    const { data: tenants } = await supabase
      .from('telemetry_retention_config')
      .select('tenant_id')
      .eq('is_enabled', true);

    const uniqueTenants = [...new Set((tenants || []).map(t => t.tenant_id))];
    const summaryResults = [];

    for (const tenantId of uniqueTenants) {
      const { data: summaryResult, error: summaryError } = await supabase.rpc('summarize_telemetry_hourly', {
        p_tenant_id: tenantId,
        p_hours_ago: 2,
      });
      if (summaryError) {
        console.error(`[cleanup-telemetry] Summary error for ${tenantId}:`, summaryError.message);
      }
      summaryResults.push({ tenant_id: tenantId, result: summaryResult });
    }

    return new Response(
      JSON.stringify({
        success: true,
        cleanup: cleanupResult,
        summaries: summaryResults,
        tenants_processed: uniqueTenants.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[cleanup-telemetry] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
