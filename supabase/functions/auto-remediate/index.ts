import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { handleException } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { logger } from '../_shared/logger.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type ActionType = 'kill_process' | 'firewall_block' | 'patch_apply' | 'quarantine_file' | 'restart_service' | 'enable_antivirus' | 'enable_firewall' | 'block_usb_device' | 'suggest_patch' | 'force_windows_update';

// Map action types to their rollback counterparts
const ROLLBACK_MAP: Partial<Record<ActionType, ActionType>> = {
  enable_firewall: 'enable_firewall', // re-run with different params
  enable_antivirus: 'enable_antivirus',
  kill_process: 'restart_service',
  block_usb_device: 'block_usb_device', // unblock
};

interface RemediationRequest {
  agent_id: string;
  action_type: ActionType;
  trigger_source: string;
  trigger_details: Record<string, unknown>;
  requires_approval?: boolean;
}

Deno.serve(async (req: Request) => {
  // Auth guard: reject unauthenticated calls
  const authError = await assertInternalCaller(req);
  if (authError) return authError;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    // Auth: internal secret or JWT
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('X-Internal-Secret');
    const jwtHeader = req.headers.get('Authorization');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let tenantId: string | null = null;
    let userId: string | null = null;

    if (authHeader && authHeader === internalSecret) {
      // Internal call ? tenant_id comes from body
    } else if (jwtHeader) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: jwtHeader } },
      });
      const { data: { user }, error } = await userClient.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
      const { data: role } = await supabase
        .from('user_roles').select('tenant_id').eq('user_id', user.id).limit(1).maybeSingle();
      tenantId = role?.tenant_id;
    } else {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RemediationRequest = await req.json();
    const { agent_id, action_type, trigger_source, trigger_details, requires_approval = false } = body;

    if (!agent_id || !action_type || !trigger_source) {
      return new Response(JSON.stringify({ error: 'agent_id, action_type, and trigger_source are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get agent info ? V-3001 FIX: Always filter by tenant to prevent cross-tenant access
    let agentQuery = supabase
      .from('agents').select('id, agent_name, tenant_id, status')
      .eq('id', agent_id);
    
    // If we know the tenant (JWT user), enforce it
    if (tenantId) {
      agentQuery = agentQuery.eq('tenant_id', tenantId);
    }
    
    const { data: agent, error: agentErr } = await agentQuery.single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: 'Agent not found or access denied' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // V-3001 FIX: For internal calls, use agent's tenant_id; for user calls, verify match
    if (tenantId && tenantId !== agent.tenant_id) {
      logger.warn(`[SECURITY] Tenant mismatch: user tenant ${tenantId} vs agent tenant ${agent.tenant_id}`);
      return new Response(JSON.stringify({ error: 'Access denied: agent belongs to different tenant' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    tenantId = tenantId || agent.tenant_id;

    // ???????????????????????????????????????????????????????
    // SPRINT 13: Blast Radius Check (max 10% fleet simultaneous)
    // ???????????????????????????????????????????????????????
    try {
      const { data: blastCheck, error: blastError } = await supabase.rpc('check_blast_radius' as never, {
        p_tenant_id: tenantId,
        p_action_type: action_type,
        p_severity: trigger_details.severity || 'medium',
      });

      if (!blastError && blastCheck && !blastCheck.allowed) {
        logger.warn(`[auto-remediate] Blast radius exceeded for ${action_type}: ${blastCheck.affected_percent}%`);

        // Record blocked action
        await supabase.from('auto_remediation_actions').insert({
          tenant_id: tenantId,
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
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch (blastErr) {
      // Fail-open: if blast radius check fails, proceed with remediation
      logger.warn(`[auto-remediate] Blast radius check failed (fail-open): ${blastErr}`);
    }

    // ???????????????????????????????????????????????????????
    // SPRINT 13: Global Circuit Breaker
    // ???????????????????????????????????????????????????????
    try {
      const { data: globalBreaker } = await supabase.rpc('check_global_circuit_breaker' as never, {
        p_tenant_id: tenantId,
        p_max_impact_percent: 30,
        p_window_minutes: 10,
      });

      if (globalBreaker && !globalBreaker.allowed) {
        logger.warn(`[auto-remediate] Global circuit breaker tripped for tenant ${tenantId}`);
        return new Response(JSON.stringify({
          success: false,
          error: 'CIRCUIT_BREAKER_OPEN',
          message: 'Circuit breaker aberto: muitas remediacoes nos ultimos 10 minutos. Aguarde o cooldown.',
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch {
      // Fail-open
    }

    // Create remediation action record
    const { data: action, error: actionErr } = await supabase
      .from('auto_remediation_actions')
      .insert({
        tenant_id: tenantId,
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
        tenant_id: tenantId,
        agent_id,
        alert_type: 'remediation_approval',
        severity: 'medium',
        title: 'Aprovacao de Remediacao Necessaria',
        message: `Acao "${action_type}" no agente "${agent.agent_name}" aguarda aprovacao`,
        details: { action_id: action?.id, action_type, trigger_source, trigger_details },
      });

      return new Response(JSON.stringify({
        success: true,
        action_id: action?.id,
        status: 'pending_approval',
        message: 'Action requires approval before execution',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Execute remediation via job
    const jobPayload = buildJobPayload(action_type, trigger_details);

    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .insert({
        agent_id,
        agent_name: agent.agent_name,
        tenant_id: tenantId,
        type: jobPayload.jobType,
        status: 'pending',
        payload: {
          ...jobPayload.payload,
          remediation_action_id: action?.id, // Link job to remediation action for rollback tracking
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

    // ???????????????????????????????????????????????????????
    // SPRINT 13: Post-remediation notification
    // ???????????????????????????????????????????????????????
    await supabase.from('system_alerts').insert({
      tenant_id: tenantId,
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
      tenantId: tenantId!,
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
      tenant_id: tenantId,
    });

    // ???????????????????????????????????????????????????????
    // SPRINT 13: Dispatch browser notification via dispatch-notification
    // ???????????????????????????????????????????????????????
    try {
      await supabase.functions.invoke('notification-router', {
        body: {
          action: 'dispatch',
          payload: {
            tenant_id: tenantId,
            type: 'remediation_executed',
            title: `[JOB]  Remediacao: ${action_type}`,
            message: `Acao "${action_type}" executada no agente "${agent.agent_name}"`,
            severity: 'high',
            metadata: { action_id: action?.id, job_id: job?.id },
          },
        },
        headers: { 'X-Internal-Secret': internalSecret || '' },
      });
    } catch {
      // Non-fatal: notification dispatch failure shouldn't block remediation
    }

    return new Response(JSON.stringify({
      success: true,
      action_id: action?.id,
      job_id: job?.id,
      status: 'executing',
      action_type,
      rollback_supported: !!ROLLBACK_MAP[action_type],
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return handleException(error, requestId, 'auto-remediate');
  }
});

function buildJobPayload(actionType: ActionType, details: Record<string, unknown>) {
  switch (actionType) {
    case 'kill_process':
      return {
        jobType: 'service_health_check',
        payload: {
          action: 'kill_process',
          process_name: details.process_name,
          process_id: details.process_id,
          reason: details.reason || 'auto_remediation',
        },
      };
    case 'firewall_block':
      return {
        jobType: 'service_health_check',
        payload: {
          action: 'firewall_block',
          ip_address: details.ip_address,
          port: details.port,
          direction: details.direction || 'inbound',
          reason: details.reason || 'auto_remediation',
        },
      };
    case 'patch_apply':
      return {
        jobType: 'service_health_check',
        payload: {
          action: 'apply_security_patch',
          cve_id: details.cve_id,
          patch_method: details.patch_method || 'automatic',
        },
      };
    case 'quarantine_file':
      return {
        jobType: 'service_health_check',
        payload: {
          action: 'quarantine_file',
          file_path: details.file_path,
          file_hash: details.file_hash,
          reason: details.reason || 'auto_remediation',
        },
      };
    case 'restart_service':
      return {
        jobType: 'service_health_check',
        payload: {
          action: 'restart_service',
          service_name: details.service_name,
          reason: details.reason || 'auto_remediation',
        },
      };
    case 'enable_antivirus':
      return {
        jobType: 'service_health_check',
        payload: {
          action: 'enable_antivirus',
          service_targets: details.service_targets || ['WinDefend', 'SecurityHealthService'],
          reason: 'antivirus_inactive_auto_remediation',
        },
      };
    case 'enable_firewall':
      return {
        jobType: 'service_health_check',
        payload: {
          action: 'enable_firewall',
          targets: details.targets || ['DomainProfile', 'PrivateProfile', 'PublicProfile'],
          reason: 'firewall_disabled_auto_remediation',
        },
      };
    case 'block_usb_device':
      return {
        jobType: 'service_health_check',
        payload: {
          action: 'block_usb_device',
          device_id: details.device_id,
          revoke_driver: details.revoke_driver || true,
          reason: details.reason || 'unauthorized_usb_auto_block',
        },
      };
    case 'suggest_patch':
      return {
        jobType: 'service_health_check',
        payload: {
          action: 'suggest_patch',
          vuln_ids: details.vuln_ids,
          auto_apply: details.auto_apply || false,
          reason: 'vulnerable_software_auto_patch',
        },
      };
    case 'force_windows_update':
      return {
        jobType: 'service_health_check',
        payload: {
          action: 'force_windows_update',
          scan_only: details.scan_only || false,
          install_optional: details.install_optional || false,
          reboot_if_needed: details.reboot_if_needed || false,
          reason: details.reason || 'forced_windows_update_remediation',
        },
      };
  }
}
