import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[auto-triage-insights] Starting auto-triage of old informational insights...');

    // Calculate 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get insights to triage
    const { data: insightsToTriage, error: fetchError } = await supabase
      .from('ai_insights')
      .select('id, insight_type, severity, created_at')
      .eq('acknowledged', false)
      .in('severity', ['info', 'warning'])
      .lt('created_at', sevenDaysAgo.toISOString());

    if (fetchError) {
      console.error('[auto-triage-insights] Error fetching insights:', fetchError);
      throw fetchError;
    }

    if (!insightsToTriage || insightsToTriage.length === 0) {
      console.log('[auto-triage-insights] No insights to auto-triage');
      return new Response(
        JSON.stringify({ 
          success: true, 
          triaged: 0, 
          message: 'No insights to auto-triage' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[auto-triage-insights] Found ${insightsToTriage.length} insights to auto-triage`);

    // Update insights
    const { data: updated, error: updateError } = await supabase
      .from('ai_insights')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        metadata: {
          auto_triaged: true,
          auto_triage_reason: 'informational insight older than 7 days',
          auto_triaged_at: new Date().toISOString()
        }
      })
      .eq('acknowledged', false)
      .in('severity', ['info', 'warning'])
      .lt('created_at', sevenDaysAgo.toISOString())
      .select('id');

    if (updateError) {
      console.error('[auto-triage-insights] Error updating insights:', updateError);
      throw updateError;
    }

    const triagedCount = updated?.length || 0;
    console.log(`[auto-triage-insights] Auto-triaged ${triagedCount} insights`);

    // Log audit event (defensive - non-blocking)
    if (triagedCount > 0) {
      try {
        await supabase.from('audit_logs').insert({
          action: 'auto_triage_insights',
          resource_type: 'ai_insight',
          resource_id: 'system_cron',
          details: {
            triaged_count: triagedCount,
            insight_ids: updated?.map(i => i.id) || [],
            description: `Auto-triaged ${triagedCount} informational insights older than 7 days`
          },
          success: true
        });
      } catch (auditError) {
        console.warn('[auto-triage-insights] Audit log failed (non-blocking):', auditError);
        // Don't block the operation if audit fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        triaged: triagedCount,
        message: `Auto-triaged ${triagedCount} informational insights`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[auto-triage-insights] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
