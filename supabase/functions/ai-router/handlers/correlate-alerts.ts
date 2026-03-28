/**
 * Handler: correlate-alerts
 * Extracted from ai-correlate-alerts for direct dispatch.
 */
import { TenantContext } from '../../_shared/serve-tenant.ts';
import { callAIJson } from '../../_shared/ai-provider-helper.ts';

interface CorrelationResult {
  cluster_name: string;
  related_alerts: string[];
  root_cause: string;
  confidence: number;
  severity: string;
  affected_agents: string[];
  recommendation: string;
}

export async function handleCorrelateAlerts(
  _req: Request,
  ctx: TenantContext,
  payload: Record<string, unknown>
): Promise<Response | Record<string, unknown>> {
  const { supabase, tenantId } = ctx;

  const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
  if (systemMode === 'halt_jobs') {
    return new Response(JSON.stringify({ success: false, error: 'SYSTEM_HALTED' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const timeRangeHours = (payload.time_range_hours as number) || 24;
  const cutoff = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();

  const { data: alerts } = await supabase
    .from('system_alerts')
    .select('id, title, message, severity, agent_id, alert_type, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', cutoff)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (!alerts || alerts.length < 3) {
    return { success: true, correlations: [] };
  }

  const { data: tenant } = await supabase
    .from('tenants').select('name').eq('id', tenantId).maybeSingle();
  const tenantName = tenant?.name || 'Tenant';

  const agentIds = [...new Set(alerts.filter(a => a.agent_id).map(a => a.agent_id!))];
  const { data: agents } = agentIds.length > 0
    ? await supabase.from('agents').select('id, hostname, display_name, agent_name').in('id', agentIds)
    : { data: [] };

  const agentMap = new Map((agents || []).map(a => [a.id, a.display_name || a.hostname || a.agent_name]));

  const alertsByType: Record<string, number> = {};
  const alertsByAgent: Record<string, number> = {};
  for (const alert of alerts) {
    alertsByType[alert.alert_type || 'unknown'] = (alertsByType[alert.alert_type || 'unknown'] || 0) + 1;
    if (alert.agent_id) {
      const name = agentMap.get(alert.agent_id) || alert.agent_id.slice(0, 8);
      alertsByAgent[name] = (alertsByAgent[name] || 0) + 1;
    }
  }

  const systemPrompt = `Voce e um especialista em Root Cause Analysis (RCA). Analise os alertas e identifique clusters correlacionados.
Responda APENAS com JSON: [{"cluster_name":"string","related_alerts":["type"],"root_cause":"string","confidence":0-1,"severity":"info"|"warning"|"critical","affected_agents":["name"],"recommendation":"string"}]`;

  const userPrompt = `Alertas para ${tenantName} (ultimas ${timeRangeHours}h):
Total: ${alerts.length}
Por tipo:\n${Object.entries(alertsByType).map(([t, c]) => `- ${t}: ${c}`).join('\n')}
Por agente:\n${Object.entries(alertsByAgent).map(([a, c]) => `- ${a}: ${c}`).join('\n')}
Detalhes:\n${alerts.slice(0, 20).map(a => `[${a.severity}] ${a.title} (${agentMap.get(a.agent_id!) || 'sistema'}) - ${a.message?.slice(0, 100) || ''}`).join('\n')}`;

  const { data: correlations } = await callAIJson<CorrelationResult[]>(
    systemPrompt, userPrompt,
    { maxTokens: 1536, functionName: 'ai-correlate-alerts', tenantId }
  );

  const allCorrelations: (CorrelationResult & { tenant_id: string })[] = [];

  if (correlations && Array.isArray(correlations)) {
    const insights = correlations
      .filter(c => c.confidence > 0.6)
      .map(c => ({
        tenant_id: tenantId,
        insight_type: 'root_cause' as const,
        severity: c.severity as 'info' | 'warning' | 'critical',
        title: `RCA: ${c.cluster_name}`,
        description: `Causa raiz: ${c.root_cause}. ${c.related_alerts.length} tipos correlacionados afetando ${c.affected_agents.length} agente(s).`,
        evidence: { correlation: c, alert_count: alerts.length, time_range_hours: timeRangeHours },
        recommendation: c.recommendation,
        confidence_score: c.confidence,
      }));

    if (insights.length > 0) {
      await supabase.from('ai_insights').insert(insights);
    }

    allCorrelations.push(...correlations.map(c => ({ ...c, tenant_id: tenantId })));
  }

  return { success: true, correlations: allCorrelations, timestamp: new Date().toISOString() };
}
