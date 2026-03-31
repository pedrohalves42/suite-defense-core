/**
 * Auto Remediate - Migrated to serveTenant middleware
 * Auth: JWT (admin UI) or internal (serveTenant handles both via skipTenantValidation)
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

type ActionType = 'kill_process' | 'firewall_block' | 'patch_apply' | 'quarantine_file' | 'restart_service' | 'enable_antivirus' | 'enable_firewall' | 'block_usb_device' | 'suggest_patch' | 'force_windows_update';

const ROLLBACK_MAP: Partial<Record<ActionType, ActionType>> = {
  enable_firewall: 'enable_firewall',
  enable_antivirus: 'enable_antivirus',
  kill_process: 'restart_service',
  block_usb_device: 'block_usb_device',
};

const RemediationSchema = z.object({
  agent_id: z.string().uuid(),
  action_type: z.enum([
    'kill_process', 'firewall_block', 'patch_apply', 'quarantine_file',
    'restart_service', 'enable_antivirus', 'enable_firewall',
    'block_usb_device', 'suggest_patch', 'force_windows_update',
  ]),
  trigger_source: z.string().min(1),
  trigger_details: z.record(z.unknown()).default({}),
  requires_approval: z.boolean().default(false),
});

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;

  // Validate input
  const parsed = RemediationSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { agent_id, action_type, trigger_source, trigger_details, requires_approval } = parsed.data;

  // Resolve tenant: use ctx.tenantId if available, otherwise derive from agent
  let resolvedTenantId = tenantId;

  // Get agent info — filter by tenant if we have one
  let agentQuery = supabase
    .from('agents').select('id, agent_name, tenant_id, status')
    .eq('id', agent_id);

  if (resolvedTenantId) {
    agentQuery = agentQuery.eq('tenant_id', resolvedTenantId);
  }

  const { data: agent, error: agentErr } = await agentQuery.single();

  if (agentErr || !agent) {
    return new Response(
      JSON.stringify({ error: 'Agent not found or access denied' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // For internal calls without tenant context, use agent's tenant
  if (!resolvedTenantId) {
    resolvedTenantId = agent.tenant_id;
  }

  // Verify tenant match
  if (resolvedTenantId !== agent.tenant_id) {
    logger.warn(`[SECURITY] Tenant mismatch: user tenant ${resolvedTenantId} vs agent tenant ${agent.tenant_id}`);
    return new Response(
      JSON.stringify({ error: 'Access denied: agent belongs to different tenant' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Blast Radius Check
  try {
    const { data: blastCheck, error: blastError } = await supabase.rpc('check_blast_radius' as never, {
      p_tenant_id: resolvedTenantId,
      p_action_type: action_type,
      p_severity: trigger_details.severity || 'medium',
    });

    if (!blastError && blastCheck && !blastCheck.allowed) {
      logger.warn(`[auto-remediate] Blast radius exceeded for ${action_type}: ${blastCheck.affected_percent}%`);

      await supabase.from('auto_remediation_actions').insert({
        tenant_id: resolvedTenantId,
        agent_id,
        agent_name: agent.agent_name,
        action_type,
        trigger_source,
        trigger_details: { ...trigger_details, blast_radius_blocked: true },
        requires_approval: false,
        status: 'failed',
        error_message: `Blast radius exceeded: ${blastCheck.affected_percent?.toFixed(1)}% of fleet affected`,
        executed_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({
        success: false,
        error: 'BLAST_RADIUS_EXCEEDED',
        affected_percent: blastCheck.affected_percent,
        message: `Remediacao bloqueada: ${blastCheck.affected_percent?.toFixed(1)}% da frota ja esta sendo remediada. Limite: 10%.`,
      }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (blastErr) {
    logger.error('[auto-remediate] Blast radius check failed - BLOCKING (fail-closed)', { error: blastErr instanceof Error ? blastErr.message : String(blastErr) });
    return new Response(JSON.stringify({
      success: false,
      error: 'BLAST_RADIUS_UNAVAILABLE',
      message: 'Blast radius check unavailable - remediation blocked for safety',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  // Global Circuit Breaker
  try {
    const { data: globalBreaker } = await supabase.rpc('check_global_circuit_breaker' as never, {
      p_tenant_id: resolvedTenantId,
      p_max_impact_percent: 30,
      p_window_minutes: 10,
    });

    if (globalBreaker && !globalBreaker.allowed) {
      logger.warn(`[auto-remediate] Global circuit breaker tripped for tenant ${resolvedTenantId}`);
      return new Response(JSON.stringify({
        success: false,
        error: 'CIRCUIT_BREAKER_OPEN',
        message: 'Circuit breaker aberto: muitas remediacoes nos ultimos 10 minutos. Aguarde o cooldown.',
      }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    logger.error('[auto-remediate] Circuit breaker check failed - BLOCKING (fail-closed)', { error: err instanceof Error ? err.message : String(err) });
    return new Response(JSON.stringify({
      success: false,
      error: 'CIRCUIT_BREAKER_UNAVAILABLE',
      message: 'Circuit breaker indisponivel. Remediacao bloqueada por seguranca.',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  // Create remediation action record
  const { data: action, error: actionErr } = await supabase
    .from('auto_remediation_actions')
    .insert({
      tenant_id: resolvedTenantId,
      agent_id,
      agent_name: agent.agent_name,
      action_type,
      trigger_source,
      trigger_details,
      requires_approval,
      status: requires_approval ? 'pending' : 'executing',
      executed_at: requires_approval ? null : new Date().toISOString(),
    })
    .select('id')
    .single();

  if (actionErr) throw new Error(`Failed to create action: ${actionErr.message}`);

  // If requires approval, stop here
  if (requires_approval) {
    await supabase.from('system_alerts').insert({
      tenant_id: resolvedTenantId,
      agent_id,
      alert_type: 'remediation_approval',
      severity: 'medium',
      title: 'Aprovacao de Remediacao Necessaria',
      message: `Acao "${action_type}" no agente "${agent.agent_name}" aguarda aprovacao`,
      details: { action_id: action?.id, action_type, trigger_source, trigger_details },
    });

    return {
      success: true,
      action_id: action?.id,
      status: 'pending_approval',
      message: 'Action requires approval before execution',
    };
  }

  // Execute remediation via job
  const jobPayload = buildJobPayload(action_type, trigger_details);

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      agent_id,
      agent_name: agent.agent_name,
      tenant_id: resolvedTenantId,
      type: jobPayload.jobType,
      status: 'pending',
      payload: {
        ...jobPayload.payload,
        remediation_action_id: action?.id,
        rollback_supported: !!ROLLBACK_MAP[action_type],
      },
      priority: 1,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();

  // Update action with job reference
  await supabase.from('auto_remediation_actions').update({
    result: { job_id: job?.id, rollback_supported: !!ROLLBACK_MAP[action_type] },
    status: job ? 'executing' : 'failed',
    error_message: jobErr?.message,
  }).eq('id', action?.id);

  // Post-remediation notification
  await supabase.from('system_alerts').insert({
    tenant_id: resolvedTenantId,
    agent_id,
    alert_type: 'auto_remediation',
    severity: 'high',
    title: 'Auto-Remediacao Executada',
    message: `Acao "${action_type}" executada no agente "${agent.agent_name}". ${ROLLBACK_MAP[action_type] ? 'Rollback disponivel em caso de falha.' : ''}`,
    details: {
      action_id: action?.id,
      job_id: job?.id,
      action_type,
      trigger_source,
      rollback_supported: !!ROLLBACK_MAP[action_type],
    },
  });

  // Audit
  await createAuditLog({
    supabase,
    tenantId: resolvedTenantId!,
    action: 'auto_remediate',
    resourceType: 'auto_remediation_actions',
    resourceId: action?.id || '',
    details: { action_type, agent_id, trigger_source, job_id: job?.id, blast_radius_checked: true },
    request: req,
    success: true,
  });

  // Domain event
  await supabase.from('domain_events').insert({
    aggregate_id: agent_id,
    aggregate_type: 'agent',
    event_type: 'AutoRemediationExecuted',
    payload: { action_id: action?.id, action_type, trigger_source, job_id: job?.id },
    occurred_on: new Date().toISOString(),
    tenant_id: resolvedTenantId,
  });

  // Dispatch browser notification
  try {
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    await supabase.functions.invoke('notification-router', {
      body: {
        action: 'dispatch',
        payload: {
          tenant_id: resolvedTenantId,
          type: 'remediation_executed',
          title: `[JOB] Remediacao: ${action_type}`,
          message: `Acao "${action_type}" executada no agente "${agent.agent_name}"`,
          severity: 'high',
          metadata: { action_id: action?.id, job_id: job?.id },
        },
      },
      headers: { 'X-Internal-Secret': internalSecret || '' },
    });
  } catch (err) {
    logger.warn('[auto-remediate] Notification dispatch failed (non-fatal)', err);
  }

  return {
    success: true,
    action_id: action?.id,
    job_id: job?.id,
    status: 'executing',
    action_type,
    rollback_supported: !!ROLLBACK_MAP[action_type],
  };
}, {
  methods: ['POST'],
  skipTenantValidation: true,
  rateLimit: { maxRequests: 10, windowMinutes: 1 },
});

function buildJobPayload(actionType: ActionType, details: Record<string, unknown>) {
  switch (actionType) {
    case 'kill_process':
      return { jobType: 'service_health_check', payload: { action: 'kill_process', process_name: details.process_name, process_id: details.process_id, reason: details.reason || 'auto_remediation' } };
    case 'firewall_block':
      return { jobType: 'service_health_check', payload: { action: 'firewall_block', ip_address: details.ip_address, port: details.port, direction: details.direction || 'inbound', reason: details.reason || 'auto_remediation' } };
    case 'patch_apply':
      return { jobType: 'service_health_check', payload: { action: 'apply_security_patch', cve_id: details.cve_id, patch_method: details.patch_method || 'automatic' } };
    case 'quarantine_file':
      return { jobType: 'service_health_check', payload: { action: 'quarantine_file', file_path: details.file_path, file_hash: details.file_hash, reason: details.reason || 'auto_remediation' } };
    case 'restart_service':
      return { jobType: 'service_health_check', payload: { action: 'restart_service', service_name: details.service_name, reason: details.reason || 'auto_remediation' } };
    case 'enable_antivirus':
      return { jobType: 'service_health_check', payload: { action: 'enable_antivirus', service_targets: details.service_targets || ['WinDefend', 'SecurityHealthService'], reason: 'antivirus_inactive_auto_remediation' } };
    case 'enable_firewall':
      return { jobType: 'service_health_check', payload: { action: 'enable_firewall', targets: details.targets || ['DomainProfile', 'PrivateProfile', 'PublicProfile'], reason: 'firewall_disabled_auto_remediation' } };
    case 'block_usb_device':
      return { jobType: 'service_health_check', payload: { action: 'block_usb_device', device_id: details.device_id, revoke_driver: details.revoke_driver || true, reason: details.reason || 'unauthorized_usb_auto_block' } };
    case 'suggest_patch':
      return { jobType: 'service_health_check', payload: { action: 'suggest_patch', vuln_ids: details.vuln_ids, auto_apply: details.auto_apply || false, reason: 'vulnerable_software_auto_patch' } };
    case 'force_windows_update':
      return { jobType: 'service_health_check', payload: { action: 'force_windows_update', scan_only: details.scan_only || false, install_optional: details.install_optional || false, reboot_if_needed: details.reboot_if_needed || false, reason: details.reason || 'forced_windows_update_remediation' } };
  }
}
