/**
 * Feed builder — generates the action center feed (GET handler)
 */
import { logger } from '../_shared/logger.ts';
import type { ActionItem, ActionCenterFeed } from './types.ts';
import {
  HISTORICAL_THRESHOLD_MS,
  calculateOfflineSeverity,
  formatOfflineDuration,
  calculatePriorityScore,
  extractAgentFromTitle,
  enrichActionItem,
} from './copy-map.ts';

export async function buildFeed(
  serviceClient: any,
  tenantId: string,
): Promise<ActionCenterFeed> {
  // Agent health metrics
  const { data: agentStats } = await serviceClient
    .from('agents')
    .select('id, agent_state, last_heartbeat, agent_state_changed_at, agent_name, hostname, offline_reason')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  const allAgents = agentStats || [];
  const healthyAgents = allAgents.filter((a: Record<string, unknown>) => a.agent_state === 'healthy');
  const offlineAgents = allAgents.filter((a: Record<string, unknown>) => a.agent_state === 'offline');

  logger.debug('[action-center-feed] Agent stats:', {
    total: allAgents.length,
    healthy: healthyAgents.length,
    offline: offlineAgents.length,
  });

  // Offline agent items
  const offlineActionItems: ActionItem[] = offlineAgents.map((agent: Record<string, unknown>) => {
    const severity = calculateOfflineSeverity(agent.last_heartbeat as string, agent.agent_state_changed_at as string);
    const duration = formatOfflineDuration(agent.last_heartbeat as string, agent.agent_state_changed_at as string);
    return {
      item_id: `offline_${agent.id}`,
      source_type: 'agent_offline' as const,
      agent_id: agent.id as string,
      agent_name: agent.agent_name as string,
      hostname: agent.hostname as string,
      title: `${agent.agent_name || agent.hostname || 'Computador'} esta offline`,
      description: `Offline ha ${duration}. ${agent.offline_reason || 'Sem desligamento normal registrado.'}`,
      severity,
      risk_score: severity === 'urgent' ? 90 : severity === 'high' ? 70 : severity === 'medium' ? 40 : 20,
      context: { last_heartbeat: agent.last_heartbeat, agent_state_changed_at: agent.agent_state_changed_at, offline_reason: agent.offline_reason, duration },
      created_at: (agent.agent_state_changed_at || agent.last_heartbeat || new Date().toISOString()) as string,
      trigger_type: 'agent_offline',
      playbook_id: null,
      priority_score: calculatePriorityScore(severity),
    };
  });

  // Playbook executions
  const { data: executions, error: execError } = await serviceClient
    .from('playbook_executions')
    .select(`id, tenant_id, agent_id, status, risk_score, trigger_context, triggered_at, playbook:playbooks(id, name, description, severity, trigger_type), agent:agents(agent_name, hostname)`)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .order('triggered_at', { ascending: false })
    .limit(50);

  if (execError) logger.error('[action-center-feed] Playbook query error:', execError);

  const playbookItems: ActionItem[] = (executions || []).map((exec: Record<string, unknown>) => ({
    item_id: exec.id as string,
    source_type: 'playbook' as const,
    agent_id: exec.agent_id as string,
    agent_name: (exec as any).agent?.agent_name || null,
    hostname: (exec as any).agent?.hostname || null,
    title: (exec as any).playbook?.name || 'Acao pendente',
    description: (exec as any).playbook?.description || null,
    severity: (exec as any).playbook?.severity || 'medium',
    risk_score: exec.risk_score as number,
    context: (exec.trigger_context || {}) as Record<string, unknown>,
    created_at: exec.triggered_at as string,
    trigger_type: (exec as any).playbook?.trigger_type || 'unknown',
    playbook_id: (exec as any).playbook?.id || null,
    priority_score: ((exec.risk_score as number) || 0) * 2 +
      ((exec as any).playbook?.severity === 'critical' ? 100 :
       (exec as any).playbook?.severity === 'high' ? 50 :
       (exec as any).playbook?.severity === 'medium' ? 20 : 5),
  }));

  // AI Insights
  const { data: insights, error: insightsError } = await serviceClient
    .from('ai_insights')
    .select('id, tenant_id, agent_id, insight_type, severity, title, description, evidence, recommendation, confidence_score, category, recommended_actions, auto_action_mode, auto_action_executed, created_at')
    .eq('tenant_id', tenantId)
    .eq('acknowledged', false)
    .eq('auto_action_executed', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (insightsError) logger.error('[action-center-feed] AI Insights query error:', insightsError);

  // Resolve agent info for insights
  const agentIds = (insights || []).filter((i: Record<string, unknown>) => i.agent_id).map((i: Record<string, unknown>) => i.agent_id);
  let agentMap: Record<string, { agent_name: string; hostname: string }> = {};

  if (agentIds.length > 0) {
    const { data: insightAgents } = await serviceClient
      .from('agents')
      .select('id, agent_name, hostname')
      .in('id', agentIds);
    agentMap = (insightAgents || []).reduce((acc: Record<string, unknown>, a: Record<string, unknown>) => {
      acc[a.id as string] = { agent_name: a.agent_name, hostname: a.hostname };
      return acc;
    }, {} as Record<string, { agent_name: string; hostname: string }>);
  }

  // Resolve hostnames from titles
  const insightsNeedingResolution: Array<{ index: number; extractedHostname: string }> = [];
  (insights || []).forEach((insight: Record<string, unknown>, index: number) => {
    if (!insight.agent_id && insight.title) {
      const extracted = extractAgentFromTitle(insight.title as string);
      if (extracted) insightsNeedingResolution.push({ index, extractedHostname: extracted });
    }
  });

  let hostnameToAgentMap: Record<string, { id: string; agent_name: string; hostname: string }> = {};
  if (insightsNeedingResolution.length > 0) {
    const hostnames = [...new Set(insightsNeedingResolution.map(i => i.extractedHostname))];
    const { data: resolvedAgents } = await serviceClient
      .from('agents')
      .select('id, agent_name, hostname')
      .eq('tenant_id', tenantId)
      .or(hostnames.map(h => `hostname.ilike.%${h}%,agent_name.ilike.%${h}%`).join(','));

    if (resolvedAgents) {
      for (const agent of resolvedAgents) {
        if (agent.hostname) hostnameToAgentMap[agent.hostname.toUpperCase()] = agent;
        if (agent.agent_name) hostnameToAgentMap[agent.agent_name.toUpperCase()] = agent;
      }
    }
  }

  const aiInsightItems: ActionItem[] = (insights || []).map((insight: Record<string, unknown>) => {
    const agent = insight.agent_id ? agentMap[insight.agent_id as string] : null;
    const severityScore = insight.severity === 'critical' ? 100 : insight.severity === 'high' ? 75 : insight.severity === 'medium' ? 50 : 25;

    let agentName = agent?.agent_name || null;
    let hostname = agent?.hostname || null;
    let resolvedAgentId = insight.agent_id as string;

    if (!agentName && insight.title) {
      const extractedHostname = extractAgentFromTitle(insight.title as string);
      if (extractedHostname) {
        const resolved = hostnameToAgentMap[extractedHostname.toUpperCase()];
        if (resolved) {
          agentName = resolved.agent_name || extractedHostname;
          hostname = resolved.hostname;
          resolvedAgentId = resolved.id;
        } else {
          agentName = extractedHostname;
          hostname = extractedHostname;
        }
      }
    }

    return {
      item_id: insight.id as string,
      source_type: 'ai_insight' as const,
      agent_id: resolvedAgentId,
      agent_name: agentName,
      hostname,
      title: insight.title as string,
      description: insight.description as string,
      severity: insight.severity as string,
      risk_score: insight.confidence_score as number,
      context: {
        insight_type: insight.insight_type,
        category: insight.category,
        recommended_actions: insight.recommended_actions,
        evidence: insight.evidence,
        auto_action_mode: insight.auto_action_mode,
        confidence_score: insight.confidence_score,
        recommendation: insight.recommendation,
      },
      created_at: insight.created_at as string,
      trigger_type: insight.insight_type as string,
      playbook_id: null,
      priority_score: severityScore + Math.round(((insight.confidence_score as number) || 0) * 10),
    };
  });

  // Merge and categorize
  const allItems = [...playbookItems, ...offlineActionItems, ...aiInsightItems];
  const now = Date.now();
  const enrichedItems = allItems.map(item => ({
    ...item,
    is_historical: (now - new Date(item.created_at).getTime()) > HISTORICAL_THRESHOLD_MS
  }));

  const urgent = enrichedItems
    .filter(i => !i.is_historical && (i.severity === 'critical' || i.severity === 'urgent' || i.severity === 'high' || i.priority_score >= 70))
    .sort((a, b) => b.priority_score - a.priority_score)
    .map(enrichActionItem);

  const recommended = enrichedItems
    .filter(i =>
      (!i.is_historical && i.severity !== 'critical' && i.severity !== 'urgent' && i.severity !== 'high' && i.priority_score >= 30 && i.priority_score < 70) ||
      (i.is_historical && (i.severity === 'critical' || i.severity === 'urgent' || i.severity === 'high' || i.priority_score >= 70))
    )
    .sort((a, b) => b.priority_score - a.priority_score)
    .map(enrichActionItem);

  const informational = enrichedItems
    .filter(i =>
      (!i.is_historical && i.priority_score < 30) ||
      (i.is_historical && i.severity !== 'critical' && i.severity !== 'urgent' && i.severity !== 'high' && i.priority_score < 70)
    )
    .sort((a, b) => b.priority_score - a.priority_score)
    .map(enrichActionItem);

  return {
    urgent,
    recommended,
    informational,
    healthy_count: healthyAgents.length,
    offline_count: offlineAgents.length,
    total_agents: allAgents.length,
    generated_at: new Date().toISOString(),
  };
}
