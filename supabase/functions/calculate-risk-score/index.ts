import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { validateCallerTenant } from '../_shared/validate-caller-tenant.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RiskBreakdown {
  antivirus_issues: number;
  critical_vulnerabilities: number;
  offline_agents: number;
  critical_events: number;
  job_failure_rate: number;
}

interface RiskExplanation {
  antivirus_issues?: string;
  critical_vulnerabilities?: string;
  offline_agents?: string;
  critical_events?: string;
  job_failure_rate?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tenant_id, include_agents = false } = await req.json();

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // V-1041 FIX: Validate caller has access to requested tenant
    const validation = await validateCallerTenant(req, supabase, tenant_id);
    if (!validation.authorized) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: validation.statusCode || 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[calculate-risk-score] Calculating risk score for tenant: ${tenant_id}`);

    let score = 100;
    const breakdown: RiskBreakdown = {
      antivirus_issues: 0,
      critical_vulnerabilities: 0,
      offline_agents: 0,
      critical_events: 0,
      job_failure_rate: 0,
    };
    const explanation: RiskExplanation = {};

    // 1️⃣ Antivirus issues (enabled = false or status != 'active')
    const { count: avIssuesCount } = await supabase
      .from('antivirus_status')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .or('status.neq.UpToDate,status.is.null');

    if ((avIssuesCount ?? 0) > 0) {
      breakdown.antivirus_issues = -20;
      explanation.antivirus_issues = `${avIssuesCount} computador(es) com antivírus desativado ou desatualizado`;
      score -= 20;
    }

    // 2️⃣ Critical vulnerabilities
    const { count: criticalVulnsCount } = await supabase
      .from('vuln_findings')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .in('severity', ['critical', 'high']);

    if ((criticalVulnsCount ?? 0) > 0) {
      breakdown.critical_vulnerabilities = -30;
      explanation.critical_vulnerabilities = `${criticalVulnsCount} vulnerabilidade(s) crítica(s) encontrada(s)`;
      score -= 30;
    }

    // 3️⃣ Offline agents (last_heartbeat > 5 minutes ago)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: offlineAgentsData } = await supabase
      .from('agents')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('status', 'active')
      .or(`last_heartbeat.lt.${fiveMinutesAgo},last_heartbeat.is.null`);

    const offlineCount = offlineAgentsData?.length ?? 0;
    if (offlineCount > 0) {
      const penalty = Math.min(offlineCount * 5, 20);
      breakdown.offline_agents = -penalty;
      explanation.offline_agents = `${offlineCount} computador(es) offline há mais de 5 minutos`;
      score -= penalty;
    }

    // 4️⃣ Critical security events (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: criticalEventsCount } = await supabase
      .from('security_events')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .in('severity', ['critical', 'high'])
      .gte('created_at', oneDayAgo);

    if ((criticalEventsCount ?? 0) > 0) {
      breakdown.critical_events = -40;
      explanation.critical_events = `${criticalEventsCount} evento(s) crítico(s) nas últimas 24h`;
      score -= 40;
    }

    // 5️⃣ Job failure rate (last 24h)
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('status')
      .eq('tenant_id', tenant_id)
      .gte('created_at', oneDayAgo);

    if (jobsData && jobsData.length >= 5) {
      const failedJobs = jobsData.filter(j => j.status === 'failed').length;
      const failureRate = (failedJobs / jobsData.length) * 100;
      if (failureRate > 30) {
        breakdown.job_failure_rate = -10;
        explanation.job_failure_rate = `Taxa de falha de jobs: ${failureRate.toFixed(1)}%`;
        score -= 10;
      }
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    // Get previous score for trend calculation
    const { data: previousScoreData } = await supabase
      .from('tenant_risk_scores')
      .select('score')
      .eq('tenant_id', tenant_id)
      .eq('scope', 'tenant')
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousScore = previousScoreData?.score ?? null;
    let trend: 'up' | 'down' | 'stable' = 'stable';
    
    if (previousScore !== null) {
      if (score > previousScore) trend = 'up';
      else if (score < previousScore) trend = 'down';
    }

    // Persist the score
    const { error: insertError } = await supabase
      .from('tenant_risk_scores')
      .insert({
        tenant_id,
        scope: 'tenant',
        score,
        breakdown,
        previous_score: previousScore,
        trend,
        calculation_version: 'v1',
      });

    if (insertError) {
      console.error('[calculate-risk-score] Error inserting score:', insertError);
      throw insertError;
    }

    console.log(`[calculate-risk-score] Score calculated: ${score}, trend: ${trend}`);

    return new Response(
      JSON.stringify({
        score,
        trend,
        previous_score: previousScore,
        breakdown,
        explanation,
        calculated_at: new Date().toISOString(),
        version: 'v1',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[calculate-risk-score] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
