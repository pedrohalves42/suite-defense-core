import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { callAIJson } from '../_shared/ai-provider-helper.ts';
import { validateCallerTenant } from '../_shared/validate-caller-tenant.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CorrelationResult {
  cluster_name: string;
  related_alerts: string[];
  root_cause: string;
  confidence: number;
  severity: string;
  affected_agents: string[];
  recommendation: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // KILL SWITCH CHECK
    const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
    if (systemMode === 'halt_jobs') {
      return new Response(JSON.stringify({ success: false, error: 'SYSTEM_HALTED' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenant_id;
    const timeRangeHours = body.time_range_hours || 24;
    const cutoff = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();

    // V-4002 FIX: Always require tenant_id — processing all tenants without auth is dangerous
    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // V-1025 FIX: Validate caller has access to requested tenant
    const validation = await validateCallerTenant(req, supabase, tenantId);
    if (!validation.authorized) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: validation.statusCode || 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get tenants
    let tenantsQuery = supabase.from('tenants').select('id, name');
    if (tenantId) tenantsQuery = tenantsQuery.eq('id', tenantId);
    const { data: tenants } = await tenantsQuery;

    if (!tenants || tenants.length === 0) {
      return new Response(JSON.stringify({ success: true, correlations: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allCorrelations: (CorrelationResult & { tenant_id: string })[] = [];

    for (const tenant of tenants) {
      // Fetch unresolved alerts
      const { data: alerts } = await supabase
        .from('system_alerts')
        .select('id, title, message, severity, agent_id, alert_type, created_at')
        .eq('tenant_id', tenant.id)
        .gte('created_at', cutoff)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!alerts || alerts.length < 3) continue;

      // Get agent names for context
      const agentIds = [...new Set(alerts.filter(a => a.agent_id).map(a => a.agent_id!))];
      const { data: agents } = agentIds.length > 0 ? await supabase
        .from('agents')
        .select('id, hostname, display_name, agent_name')
        .in('id', agentIds) : { data: [] };

      const agentMap = new Map((agents || []).map(a => [a.id, a.display_name || a.hostname || a.agent_name]));

      // Group alerts by type and agent for AI context
      const alertsByType: Record<string, number> = {};
      const alertsByAgent: Record<string, number> = {};
      for (const alert of alerts) {
        alertsByType[alert.alert_type || 'unknown'] = (alertsByType[alert.alert_type || 'unknown'] || 0) + 1;
        if (alert.agent_id) {
          const name = agentMap.get(alert.agent_id) || alert.agent_id.slice(0, 8);
          alertsByAgent[name] = (alertsByAgent[name] || 0) + 1;
        }
      }

      const systemPrompt = `Voce e um especialista em Root Cause Analysis (RCA) para sistemas de monitoramento. Analise os alertas e identifique clusters de alertas correlacionados, fornecendo a causa raiz mais provavel.

Responda APENAS com JSON valido no formato:
[{
  "cluster_name": "string (nome curto do cluster)",
  "related_alerts": ["alert_type1", "alert_type2"],
  "root_cause": "string (causa raiz identificada)",
  "confidence": number (0-1),
  "severity": "info" | "warning" | "critical",
  "affected_agents": ["nome_agente1"],
  "recommendation": "string"
}]`;

      const userPrompt = `Alertas não resolvidos para ${tenant.name} (últimas ${timeRangeHours}h):

Total: ${alerts.length} alertas

Por tipo:
${Object.entries(alertsByType).map(([t, c]) => `- ${t}: ${c}`).join('\n')}

Por agente:
${Object.entries(alertsByAgent).map(([a, c]) => `- ${a}: ${c} alertas`).join('\n')}

Detalhes (amostra):
${alerts.slice(0, 20).map(a =>
  `[${a.severity}] ${a.title} (${agentMap.get(a.agent_id!) || 'sistema'}) - ${a.message?.slice(0, 100) || ''}`
).join('\n')}

Identifique clusters de alertas relacionados e a causa raiz.`;

      const { data: correlations } = await callAIJson<CorrelationResult[]>(
        systemPrompt, userPrompt,
        { maxTokens: 1536, functionName: 'ai-correlate-alerts', tenantId: tenant.id }
      );

      if (correlations && Array.isArray(correlations)) {
        // Persist significant correlations as insights
        const insights = correlations
          .filter(c => c.confidence > 0.6)
          .map(c => ({
            tenant_id: tenant.id,
            insight_type: 'root_cause' as const,
            severity: c.severity as 'info' | 'warning' | 'critical',
            title: `RCA: ${c.cluster_name}`,
            description: `Causa raiz: ${c.root_cause}. ${c.related_alerts.length} tipos de alerta correlacionados afetando ${c.affected_agents.length} agente(s).`,
            evidence: { correlation: c, alert_count: alerts.length, time_range_hours: timeRangeHours },
            recommendation: c.recommendation,
            confidence_score: c.confidence,
          }));

        if (insights.length > 0) {
          await supabase.from('ai_insights').insert(insights);
        }

        allCorrelations.push(...correlations.map(c => ({ ...c, tenant_id: tenant.id })));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      correlations: allCorrelations,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ai-correlate-alerts] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
