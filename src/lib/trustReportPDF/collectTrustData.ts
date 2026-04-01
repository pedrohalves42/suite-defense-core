import { supabase } from '@/integrations/supabase/client';
import type { TrustReportData } from './types';

export async function collectTrustData(tenantId: string, startDate: Date, endDate: Date): Promise<TrustReportData> {
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const [
    tenantRes, agentsRes, rulesRes, detectionsRes, alertsRes,
    threatIndRes, threatMatchRes, feedSyncRes, auditRes,
    complianceRes, coverageRes, execChainRes,
  ] = await Promise.all([
    supabase.from('tenants').select('id, name, slug').eq('id', tenantId).single(),
    supabase.from('agents').select('id, status, is_isolated').eq('tenant_id', tenantId),
    supabase.from('detection_rules').select('id, rule_name, severity, mitre_tactic, is_enabled').eq('tenant_id', tenantId),
    supabase.from('endpoint_detection_events').select('id, detection_name, severity, created_at')
      .eq('tenant_id', tenantId).gte('created_at', start).lte('created_at', end),
    supabase.from('system_alerts').select('id, severity, status, created_at')
      .eq('tenant_id', tenantId).gte('created_at', start).lte('created_at', end),
    supabase.from('threat_indicators').select('id, source, indicator_type').eq('is_active', true),
    supabase.from('threat_matches').select('id, created_at')
      .eq('tenant_id', tenantId).gte('created_at', start).lte('created_at', end),
    supabase.from('threat_feed_sync_log').select('feed_source, sync_completed_at, status')
      .order('sync_completed_at', { ascending: false }).limit(10),
    supabase.rpc('verify_audit_log_chain', { p_tenant_id: tenantId, p_start_date: start, p_end_date: end }),
    supabase.from('compliance_snapshots').select('*')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1),
    supabase.rpc('validate_governance_coverage', { tenant_uuid: tenantId }),
    supabase.from('agent_execution_chain').select('agent_id, last_execution_index').eq('tenant_id', tenantId),
  ]);

  const tenant = tenantRes.data || { id: tenantId, name: 'N/A', slug: 'N/A' };
  const agents = agentsRes.data || [];
  const rules = rulesRes.data || [];
  const detections = detectionsRes.data || [];
  const alerts = alertsRes.data || [];
  const threatInd = threatIndRes.data || [];
  const threatMatches = threatMatchRes.data || [];
  const feedSync = feedSyncRes.data || [];
  const auditChain = auditRes.data?.[0] || { total_logs: 0, chain_valid: true };
  const compliance = complianceRes.data?.[0] || null;
  const coverage = coverageRes.data as unknown as TrustReportData['coverageGates'];
  const execChains = execChainRes.data || [];

  const bySeverityRules: Record<string, number> = {};
  const byTactic: Record<string, number> = {};
  rules.forEach((r) => {
    const sev = String(r.severity || 'unknown');
    bySeverityRules[sev] = (bySeverityRules[sev] || 0) + 1;
    const tactic = String(r.mitre_tactic || 'unknown');
    byTactic[tactic] = (byTactic[tactic] || 0) + 1;
  });

  const bySeverityDet: Record<string, number> = {};
  const ruleCount: Record<string, number> = {};
  detections.forEach((d) => {
    const sev = String(d.severity || 'info');
    bySeverityDet[sev] = (bySeverityDet[sev] || 0) + 1;
    const name = String(d.detection_name || 'unknown');
    ruleCount[name] = (ruleCount[name] || 0) + 1;
  });
  const topRules = Object.entries(ruleCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const alertsBySev = { critical: 0, high: 0, medium: 0, low: 0, resolved: 0 };
  alerts.forEach(a => {
    if (a.severity === 'critical') alertsBySev.critical++;
    else if (a.severity === 'high') alertsBySev.high++;
    else if (a.severity === 'medium') alertsBySev.medium++;
    else alertsBySev.low++;
    if (a.status === 'resolved') alertsBySev.resolved++;
  });

  const sources = [...new Set(threatInd.map((t) => String(t.source)).filter(Boolean))];
  const lastSync = feedSync.length > 0 ? String((feedSync as Array<Record<string, unknown>>)[0].sync_completed_at) : null;

  const categories: { name: string; score: number }[] = [];
  if (compliance?.category_scores && typeof compliance.category_scores === 'object') {
    const sd = compliance.category_scores as Record<string, unknown>;
    Object.entries(sd).forEach(([name, val]) => {
      const score = typeof val === 'number' ? val : Number((val as Record<string, unknown>)?.score ?? 0);
      categories.push({ name, score });
    });
  }

  return {
    tenant,
    period: { start: startDate, end: endDate },
    agents: {
      total: agents.length,
      online: agents.filter(a => a.status === 'online').length,
      offline: agents.filter(a => a.status !== 'online').length,
      isolated: agents.filter(a => a.is_isolated).length,
    },
    detectionRules: { total: rules.length, enabled: rules.filter((r: any) => r.is_enabled).length, bySeverity: bySeverityRules, byTactic },
    detections: { total: detections.length, bySeverity: bySeverityDet, topRules },
    alerts: { total: alerts.length, ...alertsBySev },
    threatIntel: { totalIndicators: threatInd.length, matches: threatMatches.length, lastSync, sources },
    auditIntegrity: { totalLogs: auditChain.total_logs || 0, chainValid: auditChain.chain_valid ?? true },
    compliance: { score: compliance?.overall_score ?? null, categories },
    coverageGates: coverage,
    evidenceChain: {
      totalExecutions: execChains.reduce((s, c) => s + (c.last_execution_index || 0), 0),
      agentsWithChain: execChains.length,
    },
  };
}
