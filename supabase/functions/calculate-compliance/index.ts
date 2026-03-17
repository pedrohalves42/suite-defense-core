/**
 * calculate-compliance Edge Function
 * 
 * Calculates compliance score for a tenant based on multiple data sources.
 * Detects drift from previous scores and creates alerts.
 * Called by admin users or maintenance cron.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { validateCallerTenant } from '../_shared/validate-caller-tenant.ts';

interface CategoryScore {
  category: string;
  score: number;
  max_score: number;
  weight: number;
  details: string;
}

function gradeFromScore(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { tenant_id } = body;

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // V-1015 FIX: Validate caller has access to requested tenant
    const validation = await validateCallerTenant(req, supabase, tenant_id);
    if (!validation.authorized) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: validation.statusCode || 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] [calc-compliance] Starting for tenant ${tenant_id}`);

    // ─── Gather Metrics ──────────────────────────────────

    // 1. Vulnerability Management (weight: 25%)
    const { count: totalAgents } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .not('status', 'in', '("archived","deleted")');

    const { count: criticalVulns } = await supabase
      .from('vuln_findings')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .ilike('severity', 'critical');

    const { count: highVulns } = await supabase
      .from('vuln_findings')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .ilike('severity', 'high');

    const vulnScore = Math.max(0, 100 - (criticalVulns || 0) * 15 - (highVulns || 0) * 5);

    // 2. Agent Health (weight: 20%)
    // Count agents NOT in online-equivalent states
    const { count: offlineAgents } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .not('status', 'in', '("active","online","warning","degraded","recovery","healthy","enforcing")');

    const agentHealthScore = totalAgents
      ? Math.round(((totalAgents - (offlineAgents || 0)) / totalAgents) * 100)
      : 100;

    // 3. Certificate Management (weight: 15%)
    const now = new Date().toISOString();
    const { count: expiredCerts } = await supabase
      .from('agent_certificates')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .lt('valid_until', now);

    const { count: totalCerts } = await supabase
      .from('agent_certificates')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id);

    const certScore = totalCerts
      ? Math.round(((totalCerts - (expiredCerts || 0)) / totalCerts) * 100)
      : 100;

    // 4. USB Security (weight: 10%)
    const { count: blockedUsb } = await supabase
      .from('agent_usb_devices')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .eq('is_blocked', true);

    const usbScore = (blockedUsb || 0) > 0 ? Math.max(50, 100 - (blockedUsb || 0) * 10) : 100;

    // 5. Incident Response (weight: 15%)
    const { count: unresolvedAlerts } = await supabase
      .from('system_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .eq('resolved', false);

    const incidentScore = Math.max(0, 100 - (unresolvedAlerts || 0) * 3);

    // 6. Audit Trail (weight: 15%)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentEvents } = await supabase
      .from('domain_events')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .gte('occurred_on', oneDayAgo);

    // Having events = good audit coverage
    const auditScore = (recentEvents || 0) > 0 ? Math.min(100, 70 + (recentEvents || 0)) : 50;

    // ─── Calculate Overall ──────────────────────────────

    const categories: CategoryScore[] = [
      { category: 'vulnerability_management', score: vulnScore, max_score: 100, weight: 0.25, details: `${criticalVulns || 0} critical, ${highVulns || 0} high vulns` },
      { category: 'agent_health', score: agentHealthScore, max_score: 100, weight: 0.20, details: `${offlineAgents || 0}/${totalAgents || 0} offline` },
      { category: 'certificate_management', score: certScore, max_score: 100, weight: 0.15, details: `${expiredCerts || 0}/${totalCerts || 0} expired` },
      { category: 'usb_security', score: usbScore, max_score: 100, weight: 0.10, details: `${blockedUsb || 0} blocked devices` },
      { category: 'incident_response', score: incidentScore, max_score: 100, weight: 0.15, details: `${unresolvedAlerts || 0} unresolved alerts` },
      { category: 'audit_trail', score: auditScore, max_score: 100, weight: 0.15, details: `${recentEvents || 0} events in 24h` },
    ];

    const overallScore = Math.round(
      categories.reduce((sum, c) => sum + c.score * c.weight, 0)
    );
    const grade = gradeFromScore(overallScore);

    // ─── Drift Detection ────────────────────────────────

    const { data: previousSnapshot } = await supabase
      .from('compliance_snapshots')
      .select('overall_score, grade, calculated_at')
      .eq('tenant_id', tenant_id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let hasDrift = false;
    let trend = 'stable';
    let scoreDiff = 0;

    if (previousSnapshot) {
      scoreDiff = overallScore - previousSnapshot.overall_score;
      if (Math.abs(scoreDiff) >= 5) {
        hasDrift = true;
        trend = scoreDiff > 0 ? 'improving' : 'degrading';
      }
    }

    // ─── Persist Snapshot ───────────────────────────────

    const { error: snapshotError } = await supabase
      .from('compliance_snapshots')
      .insert({
        tenant_id,
        overall_score: overallScore,
        grade,
        category_scores: categories,
        calculated_at: new Date().toISOString(),
      });

    if (snapshotError) {
      console.warn(`[${requestId}] [calc-compliance] Snapshot insert error:`, snapshotError.message);
    }

    // ─── Alert on Degradation ───────────────────────────

    if (hasDrift && trend === 'degrading' && Math.abs(scoreDiff) >= 10) {
      await supabase.from('system_alerts').insert({
        tenant_id,
        alert_type: 'compliance_drift',
        severity: Math.abs(scoreDiff) >= 20 ? 'critical' : 'high',
        message: `Compliance score dropped from ${previousSnapshot!.overall_score}% to ${overallScore}% (${scoreDiff} points)`,
        resolved: false,
        metadata: {
          previous_score: previousSnapshot!.overall_score,
          current_score: overallScore,
          drift: scoreDiff,
          grade,
          categories: categories.map((c) => ({ category: c.category, score: c.score })),
        },
      });
    }

    // ─── Domain Event ───────────────────────────────────

    await supabase.from('domain_events').insert({
      aggregate_id: tenant_id,
      aggregate_type: 'compliance',
      event_type: 'compliance.score_calculated',
      payload: {
        overall_score: overallScore,
        grade,
        has_drift: hasDrift,
        trend,
        score_diff: scoreDiff,
      },
      occurred_on: new Date().toISOString(),
      tenant_id,
    });

    const durationMs = Date.now() - startedAt;

    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'calculate-compliance',
        p_success: true,
        p_duration_ms: durationMs,
        p_result: { overall_score: overallScore, grade, has_drift: hasDrift, trend },
        p_processed_count: categories.length,
        p_job_source: 'api',
      });
    } catch (e) { console.warn('[calculate-compliance] Failed to log job run:', e); }

    console.log(`[${requestId}] [calc-compliance] Done: score=${overallScore} grade=${grade} drift=${hasDrift} in ${durationMs}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        overall_score: overallScore,
        grade,
        categories,
        drift: { has_drift: hasDrift, trend, score_diff: scoreDiff },
        agents_total: totalAgents || 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${requestId}] [calc-compliance] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
