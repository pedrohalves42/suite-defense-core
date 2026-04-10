/**
 * Security Intel Handlers — Inlined from standalone functions
 * Handles: threat-intelligence-lookup, build-security-graph
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';
import type { HandlerContext } from './admin.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// ─── threat-intelligence-lookup ──────────────────────────────────────────────

function determineTargetType(target: string): 'url' | 'ip' | 'domain' {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(target)) return 'ip';
  if (target.startsWith('http://') || target.startsWith('https://')) return 'url';
  return 'domain';
}

async function checkVirusTotal(target: string, type: 'url' | 'domain' | 'ip'): Promise<{ verdict: string; score: number; details: Record<string, unknown> } | null> {
  const apiKey = Deno.env.get('VIRUSTOTAL_API_KEY');
  if (!apiKey) return null;
  try {
    let endpoint: string;
    if (type === 'url') { const id = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); endpoint = `https://www.virustotal.com/api/v3/urls/${id}`; }
    else if (type === 'domain') endpoint = `https://www.virustotal.com/api/v3/domains/${target}`;
    else endpoint = `https://www.virustotal.com/api/v3/ip_addresses/${target}`;

    const response = await fetchWithTimeout(endpoint, { headers: { 'x-apikey': apiKey } });
    if (response.status === 404) {
      if (type === 'url') {
        const submitResponse = await fetchWithTimeout('https://www.virustotal.com/api/v3/urls', { method: 'POST', headers: { 'x-apikey': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `url=${encodeURIComponent(target)}` });
        if (submitResponse.ok) return { verdict: 'pending', score: 0, details: { status: 'submitted_for_analysis' } };
      }
      return { verdict: 'unknown', score: 0, details: { status: 'not_found' } };
    }
    if (!response.ok) return null;
    const data = await response.json();
    const stats = data.data?.attributes?.last_analysis_stats || {};
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const total = Object.values(stats).reduce((a: number, b) => a + (b as number), 0) as number;
    let verdict = 'clean', score = 0;
    if (malicious > 3) { verdict = 'malicious'; score = Math.min(100, malicious * 10); }
    else if (malicious > 0 || suspicious > 2) { verdict = 'suspicious'; score = Math.min(70, (malicious + suspicious) * 10); }
    return { verdict, score, details: { malicious_count: malicious, suspicious_count: suspicious, total_scanners: total, reputation: data.data?.attributes?.reputation } };
  } catch (error) { logger.error('VirusTotal check failed:', error); return null; }
}

async function checkAbuseIPDB(ip: string): Promise<{ verdict: string; score: number; details: Record<string, unknown> } | null> {
  const apiKey = Deno.env.get('ABUSEIPDB_API_KEY');
  if (!apiKey) return null;
  try {
    const response = await fetchWithTimeout(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`, { headers: { 'Key': apiKey, 'Accept': 'application/json' } });
    if (!response.ok) return null;
    const data = await response.json();
    const abuseScore = data.data?.abuseConfidenceScore || 0;
    let verdict = 'clean';
    if (abuseScore >= 80) verdict = 'malicious';
    else if (abuseScore >= 30) verdict = 'suspicious';
    return { verdict, score: abuseScore, details: { abuse_confidence_score: abuseScore, country_code: data.data?.countryCode, isp: data.data?.isp, total_reports: data.data?.totalReports } };
  } catch (error) { logger.error('AbuseIPDB check failed:', error); return null; }
}

async function checkURLhaus(target: string): Promise<{ verdict: string; score: number; details: Record<string, unknown> } | null> {
  try {
    const response = await fetchWithTimeout('https://urlhaus-api.abuse.ch/v1/url/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `url=${encodeURIComponent(target)}` });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.query_status === 'ok' && data.url_status) return { verdict: 'malicious', score: 100, details: { threat: data.threat, tags: data.tags, urlhaus_reference: data.urlhaus_reference } };
    return { verdict: 'clean', score: 0, details: { status: 'not_found_in_urlhaus' } };
  } catch (error) { logger.error('URLhaus check failed:', error); return null; }
}

export async function handleThreatIntelligenceLookup(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const tenantId = (payload.tenant_id as string) || ctx?.tenantId;
  const target = payload.target as string;
  const skip_cache = payload.skip_cache as boolean || false;
  if (!target || !tenantId) return { __status: 400, error: 'target and tenant_id required' };

  const targetType = determineTargetType(target);
  const normalizedTarget = target.trim().toLowerCase();

  if (!skip_cache) {
    const { data: cached } = await supabase.from('threat_intelligence_cache').select('id, target, target_type, reputation, risk_score, sources, cached_at, expires_at, tenant_id')
      .eq('target', normalizedTarget).eq('target_type', targetType).eq('tenant_id', tenantId)
      .gt('expires_at', new Date().toISOString()).single();
    if (cached) return { target: cached.target, target_type: cached.target_type, reputation: cached.reputation, risk_score: cached.risk_score, sources: cached.sources, cached: true, cached_at: cached.cached_at };
  }

  const sources: Array<{ name: string; verdict: string; confidence: number; details?: Record<string, unknown> }> = [];
  const rawResponses: Record<string, unknown> = {};

  const checks = await Promise.allSettled([
    targetType === 'ip' ? checkAbuseIPDB(normalizedTarget) : checkVirusTotal(normalizedTarget, targetType),
    targetType === 'url' ? checkURLhaus(normalizedTarget) : null,
    targetType === 'domain' ? checkVirusTotal(normalizedTarget, 'domain') : null,
  ]);

  if (checks[0].status === 'fulfilled' && checks[0].value) {
    const result = checks[0].value;
    sources.push({ name: targetType === 'ip' ? 'AbuseIPDB' : 'VirusTotal', verdict: result.verdict, confidence: result.score, details: result.details });
    rawResponses[targetType === 'ip' ? 'abuseipdb' : 'virustotal'] = result;
  }
  if (checks[1].status === 'fulfilled' && checks[1].value) {
    const result = checks[1].value;
    sources.push({ name: 'URLhaus', verdict: result.verdict, confidence: result.score, details: result.details });
    rawResponses.urlhaus = result;
  }
  if (checks[2].status === 'fulfilled' && checks[2].value) {
    const result = checks[2].value;
    sources.push({ name: 'VirusTotal (Domain)', verdict: result.verdict, confidence: result.score, details: result.details });
    rawResponses.virustotal_domain = result;
  }

  let maxScore = 0;
  let reputation: 'clean' | 'suspicious' | 'malicious' | 'unknown' = 'unknown';
  for (const source of sources) {
    if (source.confidence > maxScore) maxScore = source.confidence;
    if (source.verdict === 'malicious') reputation = 'malicious';
    else if (source.verdict === 'suspicious' && reputation !== 'malicious') reputation = 'suspicious';
    else if (source.verdict === 'clean' && reputation === 'unknown') reputation = 'clean';
  }
  if (sources.length === 0) reputation = 'unknown';

  await supabase.from('threat_intelligence_cache').upsert({
    target: normalizedTarget, target_type: targetType, reputation, risk_score: maxScore,
    sources, raw_responses: rawResponses, tenant_id: tenantId,
    cached_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(),
  }, { onConflict: 'target,target_type,tenant_id' });

  return { target: normalizedTarget, target_type: targetType, reputation, risk_score: maxScore, sources, cached: false };
}

// ─── build-security-graph ───────────────────────────────────────────────────

export async function handleBuildSecurityGraph(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const tenantId = (payload.tenant_id as string) || ctx?.tenantId;
  if (!tenantId) return { __status: 400, error: 'tenant_id required' };

  const [agents, processes, networkInfo, threatMatches] = await Promise.all([
    supabase.from('agents').select('id, hostname, agent_version, status, os_type').eq('tenant_id', tenantId).neq('status', 'archived'),
    supabase.from('agent_processes').select('agent_id, process_name, pid, parent_pid, executable_path').eq('tenant_id', tenantId).order('collected_at', { ascending: false }).limit(200),
    supabase.from('agent_network_info').select('agent_id, interface_name, ipv4_address, dns_servers').eq('tenant_id', tenantId).limit(100),
    supabase.from('threat_matches').select('*, threat_indicators(indicator_type, indicator_value, severity)').eq('tenant_id', tenantId).limit(100),
  ]);

  const nodeUpserts: Array<Record<string, unknown>> = [];
  const edgeUpserts: Array<Record<string, unknown>> = [];
  const nodeIds = new Map<string, string>();

  const ensureNode = (type: string, value: string, label?: string, riskScore = 0) => {
    const key = `${type}:${value}`;
    if (nodeIds.has(key)) return nodeIds.get(key)!;
    const id = crypto.randomUUID();
    nodeIds.set(key, id);
    nodeUpserts.push({ id, tenant_id: tenantId, node_type: type, node_value: value, label: label || value, risk_score: riskScore, first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString() });
    return id;
  };

  for (const agent of agents.data || []) ensureNode('agent', agent.id, agent.hostname || agent.id, agent.status === 'active' ? 10 : 40);
  for (const proc of processes.data || []) {
    const procNodeId = ensureNode('process', proc.process_name, proc.process_name, 20);
    const agentNodeId = nodeIds.get(`agent:${proc.agent_id}`);
    if (agentNodeId) edgeUpserts.push({ id: crypto.randomUUID(), tenant_id: tenantId, source_node_id: agentNodeId, target_node_id: procNodeId, relationship: 'installed_on', confidence: 0.9 });
  }
  for (const net of networkInfo.data || []) {
    if (net.ipv4_address) {
      const ipNodeId = ensureNode('ip', net.ipv4_address, net.ipv4_address, 5);
      const agentNodeId = nodeIds.get(`agent:${net.agent_id}`);
      if (agentNodeId) edgeUpserts.push({ id: crypto.randomUUID(), tenant_id: tenantId, source_node_id: agentNodeId, target_node_id: ipNodeId, relationship: 'connects_to', confidence: 0.95 });
    }
  }
  for (const match of threatMatches.data || []) {
    const indicator = (match as Record<string, unknown>).threat_indicators as Record<string, unknown>;
    if (indicator) {
      const nodeType = indicator.indicator_type === 'ip_address' ? 'ip' : indicator.indicator_type === 'domain' ? 'domain' : (indicator.indicator_type as string)?.includes('hash') ? 'hash' : 'domain';
      const riskScore = indicator.severity === 'critical' ? 95 : indicator.severity === 'high' ? 80 : indicator.severity === 'medium' ? 60 : 30;
      const threatNodeId = ensureNode(nodeType, indicator.indicator_value as string, indicator.indicator_value as string, riskScore);
      const agentNodeId = nodeIds.get(`agent:${match.agent_id}`);
      if (agentNodeId) edgeUpserts.push({ id: crypto.randomUUID(), tenant_id: tenantId, source_node_id: agentNodeId, target_node_id: threatNodeId, relationship: 'connects_to', confidence: 0.85 });
    }
  }

  await supabase.from('security_graph_edges').delete().eq('tenant_id', tenantId);
  await supabase.from('security_graph_nodes').delete().eq('tenant_id', tenantId);
  const batchSize = 50;
  for (let i = 0; i < nodeUpserts.length; i += batchSize) await supabase.from('security_graph_nodes').insert(nodeUpserts.slice(i, i + batchSize));
  for (let i = 0; i < edgeUpserts.length; i += batchSize) await supabase.from('security_graph_edges').insert(edgeUpserts.slice(i, i + batchSize));

  return { nodes_created: nodeUpserts.length, edges_created: edgeUpserts.length };
}
