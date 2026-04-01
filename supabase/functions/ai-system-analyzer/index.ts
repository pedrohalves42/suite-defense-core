/**
 * AI System Analyzer - Modularized
 * Auth: X-Internal-Secret / service_role (cron only)
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

import type { AnalysisData, AIInsight } from './types.ts';
import { checkTenantAIEligibility, incrementAIQuotaUsage } from './tenant-eligibility.ts';
import { analyzeWithAI, generateSuggestedActions } from './analysis-engine.ts';

serveInternal(async (_req, ctx) => {
  const { supabase } = ctx;
  const startedAt = Date.now();

  // KILL SWITCH CHECK
  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') {
    logger.info('[ai-system-analyzer] SYSTEM_HALTED: Kill switch active, skipping analysis');
    return new Response(
      JSON.stringify({ success: false, error: 'SYSTEM_HALTED', message: 'Kill switch is active. Set system_state.mode to normal to resume.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info('[ai-system-analyzer] Starting analysis cycle...');

  const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id, name');
  if (tenantsError) { logger.error('[ai-system-analyzer] Error fetching tenants:', tenantsError); throw tenantsError; }
  if (!tenants || tenants.length === 0) { return { message: 'No tenants to analyze' }; }

  logger.info(`[ai-system-analyzer] Analyzing ${tenants.length} tenant(s)`);

  const insights: AIInsight[] = [];
  const skippedTenants: { id: string; name: string; reason: string }[] = [];

  for (const tenant of tenants) {
    try {
      const eligibility = await checkTenantAIEligibility(supabase, tenant.id);
      if (!eligibility.eligible) {
        skippedTenants.push({ id: tenant.id, name: tenant.name, reason: eligibility.reason! });
        continue;
      }

      logger.info(`[ai-system-analyzer] Analyzing tenant: ${tenant.name} (${tenant.id})`);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      // Fetch agent friendly names
      const { data: agentsList } = await supabase.from('agents').select('id, agent_name, hostname, display_name').eq('tenant_id', tenant.id);
      const agentFriendlyNames = new Map<string, string>();
      for (const agent of (agentsList || [])) {
        agentFriendlyNames.set(agent.id, agent.display_name || agent.hostname || agent.agent_name);
      }

      // Fetch data
      const { data: problematicJobs } = await supabase.from('v_problematic_jobs').select('*').eq('tenant_id', tenant.id).gte('created_at', cutoffDate.toISOString()).limit(100);
      const { data: installationStats } = await supabase.from('installation_analytics').select('*').eq('tenant_id', tenant.id).gte('created_at', cutoffDate.toISOString()).order('created_at', { ascending: false }).limit(500);
      const { data: agentMetrics } = await supabase.from('agent_system_metrics_partitioned').select('*').eq('tenant_id', tenant.id).gte('collected_at', cutoffDate.toISOString()).order('collected_at', { ascending: false }).limit(500);
      const enrichedAgentMetrics = (agentMetrics || []).map(metric => ({ ...metric, friendly_name: agentFriendlyNames.get(metric.agent_id) || metric.agent_name || metric.agent_id.slice(0, 8) }));
      const { data: systemAlerts } = await supabase.from('system_alerts').select('*').eq('tenant_id', tenant.id).gte('created_at', cutoffDate.toISOString()).order('created_at', { ascending: false }).limit(100);
      const { data: jobStats } = await supabase.from('jobs').select('status, type, created_at').eq('tenant_id', tenant.id).gte('created_at', cutoffDate.toISOString()).limit(1000);

      const analysisData: AnalysisData = {
        problematicJobs: problematicJobs || [],
        failurePatterns: installationStats?.filter(s => s.success === false) || [],
        agentMetrics: enrichedAgentMetrics || [],
        installationStats: installationStats || [],
        systemAlerts: systemAlerts || [],
      };

      const totalDataPoints = analysisData.problematicJobs.length + analysisData.failurePatterns.length + analysisData.agentMetrics.length + analysisData.systemAlerts.length;
      if (totalDataPoints < 5) { continue; }

      const tenantInsights = await analyzeWithAI(tenant.id, tenant.name, analysisData, jobStats || []);
      if (tenantInsights.length > 0) await incrementAIQuotaUsage(supabase, tenant.id, tenantInsights.length);
      insights.push(...tenantInsights);
    } catch (tenantError) {
      logger.error(`[ai-system-analyzer] Error analyzing tenant ${tenant.name}:`, tenantError);
    }
  }

  // Deduplication: auto-resolve existing open insights
  if (insights.length > 0) {
    const tenantIds = [...new Set(insights.map(i => i.tenant_id))];
    for (const tid of tenantIds) {
      const titlesForTenant = insights.filter(i => i.tenant_id === tid).map(i => i.title);
      await supabase.from('ai_insights').update({
        status: 'resolved', resolved_at: new Date().toISOString(),
        resolution_method: 'manual_dismiss', final_outcome: 'no_action_required',
        acknowledged: true, acknowledged_at: new Date().toISOString(),
      }).eq('tenant_id', tid).in('status', ['open', 'in_progress']).in('title', titlesForTenant);
    }
  }

  // Save insights
  if (insights.length > 0) {
    const { data: insertedInsights, error: insertError } = await supabase.from('ai_insights').insert(insights).select();
    if (insertError) { logger.error('[ai-system-analyzer] Error saving insights:', insertError); throw insertError; }

    if (insertedInsights && insertedInsights.length > 0) {
      const suggestedActions = await generateSuggestedActions(insertedInsights);
      if (suggestedActions.length > 0) {
        const { error: actionError } = await supabase.from('ai_actions').insert(suggestedActions);
        if (actionError) logger.error(`[ai-system-analyzer] Error inserting suggested actions:`, actionError);
        else logger.info(`[ai-system-analyzer] Generated ${suggestedActions.length} suggested actions`);
      }

      for (const insight of insertedInsights) {
        try {
          await supabase.functions.invoke('ai-router', {
            body: { action: 'insight-dispatcher', payload: { insight: { ...insight, auto_action_mode: insight.severity === 'critical' ? 'auto_with_approval' : 'suggest', recommended_actions: [] }, source: 'ai-system-analyzer' } },
          });
        } catch (dispatchErr) { logger.warn('[ai-system-analyzer] Insight dispatch error:', dispatchErr); }
      }
    }
  }

  // Auto-resolve stale tasks
  try {
    const { data: resolvedTasks } = await supabase.from('tasks').update({
      status: 'resolved', closed_at: new Date().toISOString(),
      closure_reason: 'Auto-resolved: condicao normalizada ou tarefa sem progresso por 48h',
      updated_at: new Date().toISOString(),
    }).eq('status', 'in_progress').lt('updated_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()).select('id');
    if (resolvedTasks && resolvedTasks.length > 0) logger.info(`[ai-system-analyzer] Auto-resolved ${resolvedTasks.length} stale tasks`);
  } catch (e) { logger.warn('[ai-system-analyzer] Auto-resolve tasks failed:', e); }

  const result = {
    success: true, insightsGenerated: insights.length,
    tenantsAnalyzed: tenants.length - skippedTenants.length, tenantsSkipped: skippedTenants.length,
    skippedDetails: skippedTenants.map(t => ({ name: t.name, reason: t.reason })),
  };

  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'ai-system-analyzer', p_success: true,
    p_duration_ms: Date.now() - startedAt, p_result: result,
    p_processed_count: insights.length, p_job_source: 'cron',
  });

  return result;
});
