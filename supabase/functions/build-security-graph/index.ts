import { serveTenant } from '../_shared/serve-tenant.ts';

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, requestId } = ctx;

  // Build graph from existing data sources
  const [agents, processes, networkInfo, threatMatches] = await Promise.all([
    supabase.from('agents').select('id, hostname, agent_version, status, os_type')
      .eq('tenant_id', tenantId).neq('status', 'archived'),
    supabase.from('agent_processes').select('agent_id, process_name, pid, parent_pid, executable_path')
      .eq('tenant_id', tenantId).order('collected_at', { ascending: false }).limit(200),
    supabase.from('agent_network_info').select('agent_id, interface_name, ipv4_address, dns_servers')
      .eq('tenant_id', tenantId).limit(100),
    supabase.from('threat_matches').select('*, threat_indicators(indicator_type, indicator_value, severity)')
      .eq('tenant_id', tenantId).limit(100),
  ]);

  const nodeUpserts: Array<Record<string, unknown>> = [];
  const edgeUpserts: Array<Record<string, unknown>> = [];
  const nodeIds = new Map<string, string>();

  const ensureNode = (type: string, value: string, label?: string, riskScore = 0) => {
    const key = `${type}:${value}`;
    if (nodeIds.has(key)) return nodeIds.get(key)!;
    const id = crypto.randomUUID();
    nodeIds.set(key, id);
    nodeUpserts.push({
      id, tenant_id: tenantId, node_type: type, node_value: value,
      label: label || value, risk_score: riskScore,
      first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    });
    return id;
  };

  for (const agent of agents.data || []) {
    ensureNode('agent', agent.id, agent.hostname || agent.id, agent.status === 'active' ? 10 : 40);
  }

  for (const proc of processes.data || []) {
    const procNodeId = ensureNode('process', proc.process_name, proc.process_name, 20);
    const agentNodeId = nodeIds.get(`agent:${proc.agent_id}`);
    if (agentNodeId) {
      edgeUpserts.push({ id: crypto.randomUUID(), tenant_id: tenantId, source_node_id: agentNodeId, target_node_id: procNodeId, relationship: 'installed_on', confidence: 0.9 });
    }
  }

  for (const net of networkInfo.data || []) {
    if (net.ipv4_address) {
      const ipNodeId = ensureNode('ip', net.ipv4_address, net.ipv4_address, 5);
      const agentNodeId = nodeIds.get(`agent:${net.agent_id}`);
      if (agentNodeId) {
        edgeUpserts.push({ id: crypto.randomUUID(), tenant_id: tenantId, source_node_id: agentNodeId, target_node_id: ipNodeId, relationship: 'connects_to', confidence: 0.95 });
      }
    }
  }

  for (const match of threatMatches.data || []) {
    const indicator = (match as Record<string, unknown>).threat_indicators;
    if (indicator) {
      const nodeType = indicator.indicator_type === 'ip_address' ? 'ip'
        : indicator.indicator_type === 'domain' ? 'domain'
        : indicator.indicator_type?.includes('hash') ? 'hash' : 'domain';
      const riskScore = indicator.severity === 'critical' ? 95 : indicator.severity === 'high' ? 80 : indicator.severity === 'medium' ? 60 : 30;
      const threatNodeId = ensureNode(nodeType, indicator.indicator_value, indicator.indicator_value, riskScore);
      const agentNodeId = nodeIds.get(`agent:${match.agent_id}`);
      if (agentNodeId) {
        edgeUpserts.push({ id: crypto.randomUUID(), tenant_id: tenantId, source_node_id: agentNodeId, target_node_id: threatNodeId, relationship: 'connects_to', confidence: 0.85 });
      }
    }
  }

  await supabase.from('security_graph_edges').delete().eq('tenant_id', tenantId);
  await supabase.from('security_graph_nodes').delete().eq('tenant_id', tenantId);

  const batchSize = 50;
  for (let i = 0; i < nodeUpserts.length; i += batchSize) {
    await supabase.from('security_graph_nodes').insert(nodeUpserts.slice(i, i + batchSize));
  }
  for (let i = 0; i < edgeUpserts.length; i += batchSize) {
    await supabase.from('security_graph_edges').insert(edgeUpserts.slice(i, i + batchSize));
  }

  return { nodes_created: nodeUpserts.length, edges_created: edgeUpserts.length };
}, { methods: ['POST'] });
