import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

/**
 * compute-compliance-benchmarks
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1137: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Verificar auth: aceitar cron (service_role) ou super_admin
    const authHeader = req.headers.get('Authorization');
    let isCronCall = false;

    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role === 'service_role') {
          isCronCall = true;
        }
      } catch {
        // Not service role, check user auth
      }

      if (!isCronCall) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Verify super_admin
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'super_admin');
        if (!roles?.length) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    const now = new Date();
    const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    logger.info(`[compute-compliance-benchmarks] Computing for period ${periodMonth}`);

    // Get all active tenants with subscriptions
    const { data: tenants } = await supabase
      .from('tenant_subscriptions')
      .select('tenant_id')
      .in('status', ['active', 'trialing']);

    if (!tenants?.length) {
      return new Response(JSON.stringify({ message: 'No active tenants' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tenantIds = [...new Set(tenants.map(t => t.tenant_id))];
    const scores: number[] = [];
    const categoryScores: Record<string, number[]> = {};

    for (const tenantId of tenantIds) {
      const score = await calculateTenantComplianceScore(supabase, tenantId);
      if (score !== null) {
        scores.push(score.overall);
        // Aggregate category scores
        for (const [cat, val] of Object.entries(score.categories)) {
          if (!categoryScores[cat]) categoryScores[cat] = [];
          categoryScores[cat].push(val as number);
        }
      }
    }

    if (scores.length === 0) {
      return new Response(JSON.stringify({ message: 'No scores computed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate aggregates
    scores.sort((a, b) => a - b);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const median = scores.length % 2 === 0
      ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
      : scores[Math.floor(scores.length / 2)];
    const min = scores[0];
    const max = scores[scores.length - 1];

    // Category averages
    const catAvg: Record<string, number> = {};
    for (const [cat, vals] of Object.entries(categoryScores)) {
      catAvg[cat] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    }

    // Upsert benchmark for this period
    const { error: upsertError } = await supabase
      .from('compliance_benchmarks')
      .upsert({
        industry_segment: 'all',
        period_month: periodMonth,
        avg_score: Math.round(avg * 10) / 10,
        median_score: Math.round(median * 10) / 10,
        min_score: Math.round(min * 10) / 10,
        max_score: Math.round(max * 10) / 10,
        tenant_count: scores.length,
        category_averages: catAvg,
      }, {
        onConflict: 'industry_segment,period_month',
      });

    if (upsertError) {
      logger.error('[compute-compliance-benchmarks] Upsert error:', upsertError);
      throw upsertError;
    }

    const result = {
      period: periodMonth,
      tenant_count: scores.length,
      avg_score: Math.round(avg * 10) / 10,
      median_score: Math.round(median * 10) / 10,
      min_score: Math.round(min * 10) / 10,
      max_score: Math.round(max * 10) / 10,
      categories: catAvg,
    };

    logger.info(`[compute-compliance-benchmarks] Success:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('[compute-compliance-benchmarks] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function calculateTenantComplianceScore(
  supabase: any,
  tenantId: string
): Promise<{ overall: number; categories: Record<string, number> } | null> {
  try {
    // Category weights
    const categories: Record<string, number> = {};

    // 1. Agent Coverage (weight: 25%)
    const { data: agents } = await supabase
      .from('agents')
      .select('id, status')
      .eq('tenant_id', tenantId);
    
    const totalAgents = agents?.length || 0;
    const activeAgents = agents?.filter((a: Record<string, unknown>) => a.status === 'active').length || 0;
    categories['agent_coverage'] = totalAgents > 0 ? Math.round((activeAgents / totalAgents) * 100) : 0;

    // 2. Alert Response (weight: 20%)
    const { data: alerts } = await supabase
      .from('system_alerts')
      .select('id, acknowledged')
      .eq('tenant_id', tenantId)
      .limit(100);
    
    const totalAlerts = alerts?.length || 0;
    const ackAlerts = alerts?.filter((a: Record<string, unknown>) => a.acknowledged).length || 0;
    categories['alert_response'] = totalAlerts > 0 ? Math.round((ackAlerts / totalAlerts) * 100) : 100;

    // 3. Job Success Rate (weight: 20%)
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .limit(500);
    
    const totalJobs = jobs?.length || 0;
    const completedJobs = jobs?.filter((j: Record<string, unknown>) => j.status === 'completed').length || 0;
    categories['job_reliability'] = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

    // 4. Evidence Coverage (weight: 20%)
    const { count: evidenceCount } = await supabase
      .from('agent_evidence_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    
    // Score based on evidence volume (>50 = 100%, linear scale)
    categories['evidence_coverage'] = Math.min(100, Math.round(((evidenceCount || 0) / 50) * 100));

    // 5. Threat Intelligence (weight: 15%)
    const { count: threatCount } = await supabase
      .from('threat_indicators')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    
    // Global metric: having threat intel active is good
    categories['threat_intelligence'] = (threatCount || 0) > 0 ? 100 : 0;

    // Weighted overall
    const weights: Record<string, number> = {
      agent_coverage: 0.25,
      alert_response: 0.20,
      job_reliability: 0.20,
      evidence_coverage: 0.20,
      threat_intelligence: 0.15,
    };

    let overall = 0;
    for (const [cat, weight] of Object.entries(weights)) {
      overall += (categories[cat] || 0) * weight;
    }

    return { overall: Math.round(overall), categories };
  } catch (error) {
    logger.error(`[compute-compliance-benchmarks] Error for tenant ${tenantId}:`, error);
    return null;
  }
}
