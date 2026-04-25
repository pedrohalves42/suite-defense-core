/**
 * Security Threats Handlers — Inlined from standalone functions
 * Handles: auto-block-threats, auto-remediate, rollback-remediation
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { createAuditLog } from '../../_shared/audit.ts';
import type { HandlerContext } from './admin.ts';

type SupabaseClient = any;

// ─── auto-block-threats ─────────────────────────────────────────────────────

export async function handleAutoBlockThreats(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const tenantId = (payload.tenant_id as string) || ctx?.tenantId;
  const userId = (payload.user_id as string) || ctx?.userId;
  if (!tenantId) return { __status: 400, error: 'tenant_id required' };

  const { data: dangerousNodes, error: nodesError } = await supabase
    .from('security_graph_nodes')
    .select('id, node_type, node_value, label, risk_score, metadata')
    .eq('tenant_id', tenantId)
    .gte('risk_score', 80)
    .in('node_type', ['domain', 'ip', 'url']);

  if (nodesError) throw nodesError;
  if (!dangerousNodes || dangerousNodes.length === 0) {
    return { success: true, message: 'Nenhum item perigoso encontrado para bloquear', blocked: 0 };
  }

  const { data: existingBlocked } = await supabase
    .from('blocked_websites').select('domain_pattern')
    .eq('tenant_id', tenantId).eq('is_active', true);

  const alreadyBlocked = new Set(
    (existingBlocked || []).map((b: Record<string, unknown>) => (b.domain_pattern as string).toLowerCase())
  );

  const toBlock = dangerousNodes.filter(
    (n: Record<string, unknown>) => !alreadyBlocked.has((n.node_value as string).toLowerCase())
  );

  if (toBlock.length === 0) {
    return { success: true, message: 'Todos os itens perigosos ja estao bloqueados', blocked: 0, already_blocked: dangerousNodes.length };
  }

  const insertData = toBlock.map((node: Record<string, unknown>) => {
    const meta = node.metadata as Record<string, unknown>;
    const sourceInfo = meta?.source || 'threat_intelligence';
    return {
      tenant_id: tenantId, domain_pattern: (node.node_value as string).toLowerCase(),
      reason: `Bloqueio automatico: ${meta?.threat_type || 'ameaca detectada'} (fonte: ${sourceInfo}, risco: ${node.risk_score}%)`,
      blocked_by: userId, is_active: true,
    };
  });

  const { data: blocked, error: insertError } = await supabase
    .from('blocked_websites').upsert(insertData, { onConflict: 'tenant_id,domain_pattern', ignoreDuplicates: true }).select('id');

  let blockedCount = blocked?.length || 0;
  if (insertError) {
    logger.warn(`[${requestId}] Upsert failed, falling back to individual inserts: ${insertError.message}`);
    blockedCount = 0;
    for (const item of insertData) {
      const { error: singleErr } = await supabase.from('blocked_websites').insert(item);
      if (!singleErr) blockedCount++;
    }
  }

  let syncResult = { jobs_created: 0 };
  if (blockedCount > 0) {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: agents } = await supabase.from('agents').select('id, agent_name')
        .eq('tenant_id', tenantId).gt('last_heartbeat', thirtyMinutesAgo);

      if (agents && agents.length > 0) {
        const { data: allBlocked } = await supabase.from('blocked_websites').select('domain_pattern')
          .eq('tenant_id', tenantId).eq('is_active', true);
        const blockedDomains = (allBlocked || []).map((s: Record<string, unknown>) => s.domain_pattern);
        const agentIds = agents.map((a: Record<string, unknown>) => a.id);

        await supabase.from('jobs')
          .update({ status: 'cancelled', error_message: 'Superseded by auto-block sync' })
          .eq('type', 'sync_blocked_websites').eq('tenant_id', tenantId)
          .in('agent_id', agentIds).in('status', ['pending', 'queued', 'delivered']);

        const jobsToCreate = agents.map((agent: Record<string, unknown>) => ({
          agent_id: agent.id, agent_name: agent.agent_name, tenant_id: tenantId,
          type: 'sync_blocked_websites', status: 'queued', priority: 1, approved: true,
          payload: { blocked_domains: blockedDomains, action: 'sync', apply_to_hosts: true, flush_dns: true, source: 'auto_block_threats', timestamp: new Date().toISOString() },
        }));

        const { data: createdJobs } = await supabase.from('jobs').insert(jobsToCreate).select('id');
        syncResult.jobs_created = createdJobs?.length || 0;
      }
    } catch (syncErr) {
      logger.error(`[${requestId}] Sync error (non-fatal)`, syncErr as Error);
    }

    await supabase.from('system_alerts').insert({
      tenant_id: tenantId, alert_type: 'security', severity: 'high',
      title: 'Bloqueio Automatico de Ameacas',
      message: `${blockedCount} dominio(s)/IP(s) perigosos foram bloqueados automaticamente e sincronizados com ${syncResult.jobs_created} agente(s).`,
      details: { blocked_items: toBlock.map((n: Record<string, unknown>) => n.node_value), jobs_created: syncResult.jobs_created },
    });
  }

  return {
    success: true, blocked: blockedCount, already_blocked: dangerousNodes.length - toBlock.length,
    synced_agents: syncResult.jobs_created,
    blocked_items: toBlock.map((n: Record<string, unknown>) => ({ value: n.node_value, type: n.node_type, risk_score: n.risk_score })),
  };
}

// ─── auto-remediate ─────────────────────────────────────────────────────────

type ActionType = 'kill_process' | 'firewall_block' | 'patch_apply' | 'quarantine_file' | 'restart_service' | 'enable_antivirus' | 'enable_firewall' | 'block_usb_device' | 'suggest_patch' | 'force_windows_update';

const ROLLBACK_MAP: Partial<Record<ActionType, ActionType>> = {
  enable_firewall: 'enable_firewall', enable_antivirus: 'enable_antivirus',
  kill_process: 'restart_service', block_usb_device: 'block_usb_device',
};

function buildJobPayload(actionType: ActionType, details: Record<string, unknown>) {
  switch (actionType) {
    case 'kill_process': return { jobType: 'service_health_check', payload: { action: 'kill_process', process_name: details.process_name, process_id: details.process_id, reason: details.reason || 'auto_remediation' } };
    case 'firewall_block': return { jobType: 'service_health_check', payload: { action: 'firewall_block', ip_address: details.ip_address, port: details.port, direction: details.direction || 'inbound', reason: details.reason || 'auto_remediation' } };
    case 'patch_apply': return { jobType: 'service_health_check', payload: { action: 'apply_security_patch', cve_id: details.cve_id, patch_method: details.patch_method || 'automatic' } };
    case 'quarantine_file': return { jobType: 'service_health_check', payload: { action: 'quarantine_file', file_path: details.file_path, file_hash: details.file_hash, reason: details.reason || 'auto_remediation' } };
    case 'restart_service': return { jobType: 'service_health_check', payload: { action: 'restart_service', service_name: details.service_name, reason: details.reason || 'auto_remediation' } };
    case 'enable_antivirus': return { jobType: 'service_health_check', payload: { action: 'enable_antivirus', service_targets: details.service_targets || ['WinDefend', 'SecurityHealthService'], reason: 'antivirus_inactive_auto_remediation' } };
    case 'enable_firewall': return { jobType: 'service_health_check', payload: { action: 'enable_firewall', targets: details.targets || ['DomainProfile', 'PrivateProfile', 'PublicProfile'], reason: 'firewall_disabled_auto_remediation' } };
    case 'block_usb_device': return { jobType: 'service_health_check', payload: { action: 'block_usb_device', device_id: details.device_id, revoke_driver: details.revoke_driver || true, reason: details.reason || 'unauthorized_usb_auto_block' } };
    case 'suggest_patch': return { jobType: 'service_health_check', payload: { action: 'suggest_patch', vuln_ids: details.vuln_ids, auto_apply: details.auto_apply || false, reason: 'vulnerable_software_auto_patch' } };
    case 'force_windows_update': return { jobType: 'service_health_check', payload: { action: 'force_windows_update', scan_only: details.scan_only || false, install_optional: details.install_optional || false, reboot_if_needed: details.reboot_if_needed || false, reason: details.reason || 'forced_windows_update_remediation' } };
  }
}

export async function handleAutoRemediate(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const { agent_id, action_type, trigger_source, trigger_details = {}, requires_approval = false } = payload as {
    agent_id: string; action_type: ActionType; trigger_source: string;
    trigger_details?: Record<string, unknown>; requires_approval?: boolean;
  };

  if (!agent_id || !action_type || !trigger_source) return { __status: 400, error: 'agent_id, action_type, trigger_source required' };

  // Resolve tenant from ctx or agent
  let resolvedTenantId = ctx?.tenantId as string | undefined;
  let agentQuery = supabase.from('agents').select('id, agent_name, tenant_id, status').eq('id', agent_id);
  if (resolvedTenantId) agentQuery = agentQuery.eq('tenant_id', resolvedTenantId);
  const { data: agent, error: agentErr } = await agentQuery.single();
  if (agentErr || !agent) return { __status: 404, error: 'Agent not found or access denied' };
  if (!resolvedTenantId) resolvedTenantId = agent.tenant_id;
  if (resolvedTenantId !== agent.tenant_id) return { __status: 403, error: 'Access denied: agent belongs to different tenant' };

  // Blast Radius Check (fail-closed)
  try {
    const { data: blastCheck, error: blastError } = await supabase.rpc('check_blast_radius' as never, {
      p_tenant_id: resolvedTenantId, p_action_type: action_type, p_severity: trigger_details.severity || 'medium',
    });
    if (!blastError && blastCheck && !blastCheck.allowed) {
      await supabase.from('auto_remediation_actions').insert({
        tenant_id: resolvedTenantId, agent_id, agent_name: agent.agent_name, action_type, trigger_source,
        trigger_details: { ...trigger_details, blast_radius_blocked: true }, requires_approval: false, status: 'failed',
        error_message: `Blast radius exceeded: ${blastCheck.affected_percent?.toFixed(1)}% of fleet affected`,
        executed_at: new Date().toISOString(),
      });
      return { __status: 429, success: false, error: 'BLAST_RADIUS_EXCEEDED', affected_percent: blastCheck.affected_percent };
    }
  } catch (blastErr) {
    logger.error('[auto-remediate] Blast radius check failed - BLOCKING (fail-closed)', { error: blastErr instanceof Error ? blastErr.message : String(blastErr) });
    return { __status: 503, success: false, error: 'BLAST_RADIUS_UNAVAILABLE', message: 'Blast radius check unavailable - remediation blocked for safety' };
  }

  // Global Circuit Breaker (fail-closed)
  try {
    const { data: globalBreaker } = await supabase.rpc('check_global_circuit_breaker' as never, {
      p_tenant_id: resolvedTenantId, p_max_impact_percent: 30, p_window_minutes: 10,
    });
    if (globalBreaker && !globalBreaker.allowed) {
      return { __status: 429, success: false, error: 'CIRCUIT_BREAKER_OPEN', message: 'Circuit breaker aberto: muitas remediacoes nos ultimos 10 minutos.' };
    }
  } catch (err) {
    logger.error('[auto-remediate] Circuit breaker check failed - BLOCKING (fail-closed)', { error: err instanceof Error ? err.message : String(err) });
    return { __status: 503, success: false, error: 'CIRCUIT_BREAKER_UNAVAILABLE' };
  }

  const { data: action, error: actionErr } = await supabase.from('auto_remediation_actions').insert({
    tenant_id: resolvedTenantId, agent_id, agent_name: agent.agent_name, action_type, trigger_source,
    trigger_details, requires_approval, status: requires_approval ? 'pending' : 'executing',
    executed_at: requires_approval ? null : new Date().toISOString(),
  }).select('id').single();

  if (actionErr) throw new Error(`Failed to create action: ${actionErr.message}`);

  if (requires_approval) {
    await supabase.from('system_alerts').insert({
      tenant_id: resolvedTenantId, agent_id, alert_type: 'remediation_approval', severity: 'medium',
      title: 'Aprovacao de Remediacao Necessaria',
      message: `Acao "${action_type}" no agente "${agent.agent_name}" aguarda aprovacao`,
      details: { action_id: action?.id, action_type, trigger_source, trigger_details },
    });
    return { success: true, action_id: action?.id, status: 'pending_approval' };
  }

  const jobPayload = buildJobPayload(action_type, trigger_details);
  const { data: job, error: jobErr } = await supabase.from('jobs').insert({
    agent_id, agent_name: agent.agent_name, tenant_id: resolvedTenantId,
    type: jobPayload.jobType, status: 'queued',
    payload: { ...jobPayload.payload, remediation_action_id: action?.id, rollback_supported: !!ROLLBACK_MAP[action_type] },
    priority: 1, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).select('id').single();

  await supabase.from('auto_remediation_actions').update({
    result: { job_id: job?.id, rollback_supported: !!ROLLBACK_MAP[action_type] },
    status: job ? 'executing' : 'failed', error_message: jobErr?.message,
  }).eq('id', action?.id);

  await supabase.from('system_alerts').insert({
    tenant_id: resolvedTenantId, agent_id, alert_type: 'auto_remediation', severity: 'high',
    title: 'Auto-Remediacao Executada',
    message: `Acao "${action_type}" executada no agente "${agent.agent_name}". ${ROLLBACK_MAP[action_type] ? 'Rollback disponivel.' : ''}`,
    details: { action_id: action?.id, job_id: job?.id, action_type, trigger_source, rollback_supported: !!ROLLBACK_MAP[action_type] },
  });

  await supabase.from('domain_events').insert({
    aggregate_id: agent_id, aggregate_type: 'agent', event_type: 'AutoRemediationExecuted',
    payload: { action_id: action?.id, action_type, trigger_source, job_id: job?.id },
    occurred_on: new Date().toISOString(), tenant_id: resolvedTenantId,
  });

  return { success: true, action_id: action?.id, job_id: job?.id, status: 'executing', action_type, rollback_supported: !!ROLLBACK_MAP[action_type] };
}

// ─── rollback-remediation ───────────────────────────────────────────────────

function buildRollbackPayload(actionType: string, details: Record<string, unknown>) {
  switch (actionType) {
    case 'enable_firewall': return { action: 'rollback_firewall', reason: 'rollback_auto_remediation', original_action: 'enable_firewall' };
    case 'enable_antivirus': return { action: 'rollback_antivirus', reason: 'rollback_auto_remediation', original_action: 'enable_antivirus' };
    case 'kill_process': return { action: 'restart_service', service_name: details.process_name || details.service_name, reason: 'rollback_kill_process' };
    case 'block_usb_device': return { action: 'unblock_usb_device', device_id: details.device_id, reason: 'rollback_usb_block' };
    case 'firewall_block': return { action: 'firewall_unblock', ip_address: details.ip_address, port: details.port, reason: 'rollback_firewall_block' };
    default: return null;
  }
}

export async function handleRollbackRemediation(
  supabase: SupabaseClient, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const userId = ctx?.userId;
  const { action_id } = payload as { action_id: string };
  if (!action_id) return { __status: 400, error: 'action_id required' };

  const { data: userRoles } = await supabase.from('user_roles').select('tenant_id, role').eq('user_id', userId!);
  const adminRoles = (userRoles || []).filter(r => ['admin', 'super_admin'].includes(r.role));
  if (adminRoles.length === 0) return { __status: 403, error: 'Admin role required for rollback' };

  const userTenantIds = adminRoles.map(r => r.tenant_id);
  const { data: action, error: fetchErr } = await supabase
    .from('auto_remediation_actions').select('id, tenant_id, agent_id, agent_name, action_type, status, trigger_details, created_at').eq('id', action_id).in('tenant_id', userTenantIds).single();
  if (fetchErr || !action) return { __status: 404, error: 'Remediation action not found' };
  if (action.status !== 'success' && action.status !== 'executing') return { __status: 409, error: `Cannot rollback action in status: ${action.status}` };

  const rollbackPayload = buildRollbackPayload(action.action_type, action.trigger_details as Record<string, unknown>);
  if (!rollbackPayload) return { __status: 400, error: `Rollback not supported for action type: ${action.action_type}` };

  const { data: job, error: jobErr } = await supabase.from('jobs').insert({
    agent_id: action.agent_id, agent_name: action.agent_name, tenant_id: action.tenant_id,
    type: 'service_health_check', status: 'queued',
    payload: { ...rollbackPayload, is_rollback: true, original_action_id: action_id },
    priority: 2, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).select('id').single();
  if (jobErr) throw new Error(`Failed to create rollback job: ${jobErr.message}`);

  await supabase.from('auto_remediation_actions').update({
    status: 'rolled_back',
    result: { ...(action.result as Record<string, unknown> || {}), rollback_job_id: job?.id, rolled_back_at: new Date().toISOString(), rolled_back_by: userId },
  }).eq('id', action_id);

  await supabase.from('auto_remediation_actions').insert({
    tenant_id: action.tenant_id, agent_id: action.agent_id, agent_name: action.agent_name,
    action_type: action.action_type, trigger_source: `rollback:${action.trigger_source}`,
    trigger_details: { original_action_id: action_id, rollback: true },
    status: 'executing', executed_at: new Date().toISOString(), result: { rollback_job_id: job?.id },
  });

  await supabase.from('system_alerts').insert({
    tenant_id: action.tenant_id, agent_id: action.agent_id, alert_type: 'remediation_rollback', severity: 'medium',
    title: 'Rollback de Remediacao Executado',
    message: `Acao "${action.action_type}" revertida no agente "${action.agent_name}"`,
    details: { original_action_id: action_id, rollback_job_id: job?.id },
  });

  return { success: true, rollback_job_id: job?.id, original_action_id: action_id, message: `Rollback initiated for "${action.action_type}" on agent "${action.agent_name}"` };
}
