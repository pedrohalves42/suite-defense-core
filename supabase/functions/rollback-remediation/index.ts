import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { handleException } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Rollback a remediation action by creating an inverse job.
 * POST /rollback-remediation
 * Body: { action_id: string }
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const jwtHeader = req.headers.get('Authorization');
    if (!jwtHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: jwtHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // V-3013 FIX: Get ALL tenant roles, then validate against action's tenant
    const { data: userRoles } = await supabase
      .from('user_roles').select('tenant_id, role').eq('user_id', user.id);

    // V-3013 FIX: Check if user has admin role in ANY tenant first
    const adminRoles = (userRoles || []).filter(r => ['admin', 'super_admin'].includes(r.role));
    if (adminRoles.length === 0) {
      return new Response(JSON.stringify({ error: 'Admin role required for rollback' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action_id } = await req.json();
    if (!action_id) {
      return new Response(JSON.stringify({ error: 'action_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // V-3013 FIX: Get the action first, then verify user has admin access to THAT tenant
    const userTenantIds = adminRoles.map(r => r.tenant_id);
    
    // Fetch original action ? filter by user's accessible tenants
    const { data: action, error: fetchErr } = await supabase
      .from('auto_remediation_actions')
      .select('*')
      .eq('id', action_id)
      .in('tenant_id', userTenantIds)
      .single();

    if (fetchErr || !action) {
      return new Response(JSON.stringify({ error: 'Remediation action not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action.status !== 'success' && action.status !== 'executing') {
      return new Response(JSON.stringify({ error: `Cannot rollback action in status: ${action.status}` }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build rollback payload
    const rollbackPayload = buildRollbackPayload(action.action_type, action.trigger_details as Record<string, unknown>);
    if (!rollbackPayload) {
      return new Response(JSON.stringify({ error: `Rollback not supported for action type: ${action.action_type}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create rollback job
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .insert({
        agent_id: action.agent_id,
        agent_name: action.agent_name,
        tenant_id: action.tenant_id,
        type: 'service_health_check',
        status: 'pending',
        payload: {
          ...rollbackPayload,
          is_rollback: true,
          original_action_id: action_id,
        },
        priority: 2, // High priority for rollbacks
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();

    if (jobErr) throw new Error(`Failed to create rollback job: ${jobErr.message}`);

    // Update original action status
    await supabase.from('auto_remediation_actions').update({
      status: 'rolled_back',
      result: {
        ...(action.result as Record<string, unknown> || {}),
        rollback_job_id: job?.id,
        rolled_back_at: new Date().toISOString(),
        rolled_back_by: user.id,
      },
    }).eq('id', action_id);

    // Create rollback remediation record
    await supabase.from('auto_remediation_actions').insert({
      tenant_id: action.tenant_id,
      agent_id: action.agent_id,
      agent_name: action.agent_name,
      action_type: action.action_type,
      trigger_source: `rollback:${action.trigger_source}`,
      trigger_details: { original_action_id: action_id, rollback: true },
      status: 'executing',
      executed_at: new Date().toISOString(),
      result: { rollback_job_id: job?.id },
    });

    // Alert
    await supabase.from('system_alerts').insert({
      tenant_id: action.tenant_id,
      agent_id: action.agent_id,
      alert_type: 'remediation_rollback',
      severity: 'medium',
      title: 'Rollback de Remediacao Executado',
      message: `Acao "${action.action_type}" revertida no agente "${action.agent_name}"`,
      details: { original_action_id: action_id, rollback_job_id: job?.id },
    });

    await createAuditLog({
      supabase,
      tenantId: action.tenant_id,
      userId: user.id,
      action: 'remediation_rollback',
      resourceType: 'auto_remediation_actions',
      resourceId: action_id,
      details: { action_type: action.action_type, rollback_job_id: job?.id },
      request: req,
      success: true,
    });

    return new Response(JSON.stringify({
      success: true,
      rollback_job_id: job?.id,
      original_action_id: action_id,
      message: `Rollback initiated for "${action.action_type}" on agent "${action.agent_name}"`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return handleException(error, requestId, 'rollback-remediation');
  }
});

function buildRollbackPayload(actionType: string, details: Record<string, unknown>) {
  switch (actionType) {
    case 'enable_firewall':
      // Rollback: document that firewall was re-disabled (rare but possible)
      return {
        action: 'rollback_firewall',
        reason: 'rollback_auto_remediation',
        original_action: 'enable_firewall',
      };
    case 'enable_antivirus':
      return {
        action: 'rollback_antivirus',
        reason: 'rollback_auto_remediation',
        original_action: 'enable_antivirus',
      };
    case 'kill_process':
      return {
        action: 'restart_service',
        service_name: details.process_name || details.service_name,
        reason: 'rollback_kill_process',
      };
    case 'block_usb_device':
      return {
        action: 'unblock_usb_device',
        device_id: details.device_id,
        reason: 'rollback_usb_block',
      };
    case 'firewall_block':
      return {
        action: 'firewall_unblock',
        ip_address: details.ip_address,
        port: details.port,
        reason: 'rollback_firewall_block',
      };
    default:
      return null;
  }
}
