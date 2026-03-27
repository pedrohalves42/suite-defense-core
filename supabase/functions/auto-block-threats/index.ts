/**
 * Auto Block Threats
 * Automatically blocks high-risk domains/IPs from security graph
 * Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, userId, tenantId, requestId } = ctx;

  // Fetch high/critical threat nodes (risk_score >= 80) of type domain or ip
  const { data: dangerousNodes, error: nodesError } = await supabase
    .from('security_graph_nodes')
    .select('id, node_type, node_value, label, risk_score, metadata')
    .eq('tenant_id', tenantId)
    .gte('risk_score', 80)
    .in('node_type', ['domain', 'ip', 'url']);

  if (nodesError) throw nodesError;
  if (!dangerousNodes || dangerousNodes.length === 0) {
    return {
      success: true,
      message: 'Nenhum item perigoso encontrado para bloquear',
      blocked: 0,
    };
  }

  // Get already blocked domains for this tenant
  const { data: existingBlocked } = await supabase
    .from('blocked_websites')
    .select('domain_pattern')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  const alreadyBlocked = new Set(
    (existingBlocked || []).map((b: any) => b.domain_pattern.toLowerCase())
  );

  const toBlock = dangerousNodes.filter(
    (n: any) => !alreadyBlocked.has(n.node_value.toLowerCase())
  );

  if (toBlock.length === 0) {
    return {
      success: true,
      message: 'Todos os itens perigosos já estão bloqueados',
      blocked: 0,
      already_blocked: dangerousNodes.length,
    };
  }

  // Insert into blocked_websites
  const insertData = toBlock.map((node: any) => {
    const meta = node.metadata as any;
    const sourceInfo = meta?.source || 'threat_intelligence';
    return {
      tenant_id: tenantId,
      domain_pattern: node.node_value.toLowerCase(),
      reason: `Bloqueio automático: ${meta?.threat_type || 'ameaça detectada'} (fonte: ${sourceInfo}, risco: ${node.risk_score}%)`,
      blocked_by: userId,
      is_active: true,
    };
  });

  const { data: blocked, error: insertError } = await supabase
    .from('blocked_websites')
    .upsert(insertData, {
      onConflict: 'tenant_id,domain_pattern',
      ignoreDuplicates: true,
    })
    .select('id');

  let blockedCount = blocked?.length || 0;
  if (insertError) {
    logger.warn(`[${requestId}] Upsert failed, falling back to individual inserts: ${insertError.message}`);
    blockedCount = 0;
    for (const item of insertData) {
      const { error: singleErr } = await supabase.from('blocked_websites').insert(item);
      if (!singleErr) blockedCount++;
    }
  }

  // Sync with online agents
  let syncResult = { jobs_created: 0 };
  if (blockedCount > 0) {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: agents } = await supabase
        .from('agents')
        .select('id, agent_name')
        .eq('tenant_id', tenantId)
        .gt('last_heartbeat', thirtyMinutesAgo);

      if (agents && agents.length > 0) {
        const { data: allBlocked } = await supabase
          .from('blocked_websites')
          .select('domain_pattern')
          .eq('tenant_id', tenantId)
          .eq('is_active', true);

        const blockedDomains = (allBlocked || []).map((s: any) => s.domain_pattern);
        const agentIds = agents.map((a: any) => a.id);

        await supabase
          .from('jobs')
          .update({ status: 'cancelled', error_message: 'Superseded by auto-block sync' })
          .eq('type', 'sync_blocked_websites')
          .eq('tenant_id', tenantId)
          .in('agent_id', agentIds)
          .in('status', ['pending', 'queued', 'delivered']);

        const jobsToCreate = agents.map((agent: any) => ({
          agent_id: agent.id,
          agent_name: agent.agent_name,
          tenant_id: tenantId,
          type: 'sync_blocked_websites',
          status: 'queued',
          priority: 1,
          approved: true,
          payload: {
            blocked_domains: blockedDomains,
            action: 'sync',
            apply_to_hosts: true,
            flush_dns: true,
            source: 'auto_block_threats',
            timestamp: new Date().toISOString(),
          },
        }));

        const { data: createdJobs } = await supabase.from('jobs').insert(jobsToCreate).select('id');
        syncResult.jobs_created = createdJobs?.length || 0;
      }
    } catch (syncErr) {
      logger.error(`[${requestId}] Sync error (non-fatal)`, syncErr as Error);
    }

    await supabase.from('system_alerts').insert({
      tenant_id: tenantId,
      alert_type: 'security',
      severity: 'high',
      title: 'Bloqueio Automático de Ameaças',
      message: `${blockedCount} domínio(s)/IP(s) perigosos foram bloqueados automaticamente e sincronizados com ${syncResult.jobs_created} agente(s).`,
      details: {
        blocked_items: toBlock.map((n: any) => n.node_value),
        jobs_created: syncResult.jobs_created,
      },
    });
  }

  return {
    success: true,
    blocked: blockedCount,
    already_blocked: dangerousNodes.length - toBlock.length,
    synced_agents: syncResult.jobs_created,
    blocked_items: toBlock.map((n: any) => ({
      value: n.node_value,
      type: n.node_type,
      risk_score: n.risk_score,
    })),
  };
}, {
  methods: ['POST'],
});
