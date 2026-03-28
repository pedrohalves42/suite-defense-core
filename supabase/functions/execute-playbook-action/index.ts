import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import {
  isProcessProtected,
  isServiceProtected
} from '../_shared/protected-targets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlaybookAction {
  id: string;
  order_index: number;
  action_type: string;
  label: string;
  description: string;
  action_payload: Record<string, unknown>;
  risk_level: string;
}

interface ExecuteRequest {
  execution_id: string;
  action_index?: number;
  notes?: string;
}

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;
  const startTime = Date.now();

  const { execution_id, action_index, notes } = body as ExecuteRequest;

  if (!execution_id) {
    return new Response(JSON.stringify({ error: 'execution_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  logger.info(`[execute-playbook-action] Executing ${execution_id}, action_index: ${action_index}`);

  // [OK]  V-11007: Role check ? user must be admin/super_admin/operator in this tenant
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role, tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .in('role', ['admin', 'super_admin', 'operator'])
    .limit(1)
    .maybeSingle();

  if (!userRole) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

    // Step 2: Fetch execution WITH tenant filter (serveTenant already validated tenant access)
    const { data: execution, error: execError } = await supabase
      .from('playbook_executions')
      .select('*')
      .eq('id', execution_id)
      .eq('tenant_id', tenantId)
      .single();

    if (execError || !execution) {
      logger.error('[execute-playbook-action] Execution not found:', execError);
      return new Response(JSON.stringify({ error: 'Execution not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar se execucao ja foi finalizada
    if (['completed', 'failed', 'cancelled', 'ignored'].includes(execution.status)) {
      return new Response(JSON.stringify({ 
        error: 'Execution already finalized',
        status: execution.status 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // V-11007: Tenant access already validated above (moved before execution fetch)

    // [OK]  ENTERPRISE: Usar acoes do SNAPSHOT IMUTAVEL (nao do playbook atual)
    const actionsSnapshot = execution.actions_snapshot as PlaybookAction[] || [];
    const playbookSnapshot = execution.playbook_snapshot as Record<string, unknown> || {};

    if (actionsSnapshot.length === 0) {
      return new Response(JSON.stringify({ error: 'No actions found in snapshot' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // [OK]  AJUSTE 3: Enforcement de execution_mode - bloquear acoes destrutivas em modo assistivo
    const executionMode = (playbookSnapshot.execution_mode as string) || 'assistive';
    const DESTRUCTIVE_ACTIONS = [
      'isolate_agent', 'isolate', 
      'uninstall_software', 
      'block_ip', 
      'kill_process', 
      'stop_service', 
      'disable_service',
      'revoke_token'
    ];

    // [OK]  SEMI_AUTOMATIC MODE: Verificar se ha approval_request aprovado antes de executar
    if (executionMode === 'semi_automatic') {
      const { data: approvalRequest, error: approvalError } = await supabase
        .from('approval_requests')
        .select('id, status, expires_at, approved_by, approved_at')
        .eq('playbook_execution_id', execution_id)
        .eq('status', 'approved')
        .single();

      if (approvalError || !approvalRequest) {
        // Check if there's a pending request
        const { data: pendingRequest } = await supabase
          .from('approval_requests')
          .select('id, status, expires_at')
          .eq('playbook_execution_id', execution_id)
          .eq('status', 'pending')
          .single();

        logger.info(`[execute-playbook-action] BLOCKED: Semi-automatic playbook requires approval`);
        
        await supabase.from('audit_logs').insert({
          user_id: userId,
          tenant_id: execution.tenant_id,
          action: 'blocked_semi_automatic_no_approval',
          resource_type: 'playbook_execution',
          resource_id: execution_id,
          success: false,
          details: {
            playbook_name: playbookSnapshot.name,
            playbook_version: playbookSnapshot.version,
            execution_mode: executionMode,
            reason: 'Semi-automatic playbook requires approval before execution',
            pending_request_id: pendingRequest?.id || null,
            pending_request_expires: pendingRequest?.expires_at || null,
          },
        });

        return new Response(JSON.stringify({ 
          error: 'Semi-automatic playbook requires approval before execution',
          execution_mode: executionMode,
          pending_approval: !!pendingRequest,
          pending_request_id: pendingRequest?.id || null,
          expires_at: pendingRequest?.expires_at || null,
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      logger.info(`[execute-playbook-action] Semi-automatic approval verified: ${approvalRequest.id}`);
    }

    if (executionMode === 'assistive') {
      const destructiveActions = actionsSnapshot.filter(a => 
        DESTRUCTIVE_ACTIONS.includes(a.action_type)
      );
      
      if (destructiveActions.length > 0) {
        logger.info(`[execute-playbook-action] BLOCKED: Destructive actions in assistive mode`);
        
        // Registrar tentativa bloqueada no audit log
        await supabase.from('audit_logs').insert({
          user_id: userId,
          tenant_id: execution.tenant_id,
          action: 'blocked_destructive_action',
          resource_type: 'playbook_execution',
          resource_id: execution_id,
          success: false,
          details: {
            playbook_name: playbookSnapshot.name,
            playbook_version: playbookSnapshot.version,
            execution_mode: executionMode,
            blocked_actions: destructiveActions.map(a => ({
              action_type: a.action_type,
              label: a.label,
            })),
            reason: 'Assistive mode does not allow destructive actions',
          },
        });

        return new Response(JSON.stringify({ 
          error: 'Cannot execute destructive actions in assistive mode',
          execution_mode: executionMode,
          blocked_actions: destructiveActions.map(a => ({
            action_type: a.action_type,
            label: a.label,
          })),
          allowed_modes: ['semi_automatic', 'automatic'],
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    logger.info(`[execute-playbook-action] Using immutable snapshot v${playbookSnapshot.version} with ${actionsSnapshot.length} actions (mode: ${executionMode})`);

    // Atualizar status para in_progress
    await supabase
      .from('playbook_executions')
      .update({
        status: 'in_progress',
        executed_by: userId,
        notes: notes || execution.notes,
      })
      .eq('id', execution_id);

    // Determinar quais acoes executar (ja ordenadas no snapshot)
    const actionsToExecute = action_index !== undefined 
      ? [actionsSnapshot[action_index]] 
      : actionsSnapshot;

    const actionResults: Array<{
      action_id: string;
      action_type: string;
      label: string;
      success: boolean;
      result?: Record<string, unknown>;
      error?: string;
      executed_at: string;
    }> = execution.actions_taken || [];

    const evidenceIds: string[] = execution.evidence_ids || [];

    // Executar cada acao do SNAPSHOT
    for (const action of actionsToExecute) {
      if (!action) continue;

      logger.info(`[execute-playbook-action] Executing action from snapshot: ${action.action_type} - ${action.label}`);
      
      try {
        const result = await executeAction(
          supabase,
          action,
          execution,
          userId!,
          playbookSnapshot
        );

        actionResults.push({
          action_id: action.id,
          action_type: action.action_type,
          label: action.label,
          success: true,
          result,
          executed_at: new Date().toISOString(),
        });

        // Se gerou evidencia, adicionar ao array
        if (result?.evidence_id) {
          evidenceIds.push(result.evidence_id as string);
        }

      } catch (actionError) {
        logger.error(`[execute-playbook-action] Action failed:`, actionError);
        
        actionResults.push({
          action_id: action.id,
          action_type: action.action_type,
          label: action.label,
          success: false,
          error: actionError instanceof Error ? actionError.message : 'Unknown error',
          executed_at: new Date().toISOString(),
        });
      }
    }

    // Determinar status final
    const allActionsExecuted = actionResults.length >= actionsSnapshot.length;
    const anyFailed = actionResults.some(r => !r.success);
    const finalStatus = allActionsExecuted 
      ? (anyFailed ? 'failed' : 'completed')
      : 'in_progress';

    // Atualizar execucao
    await supabase
      .from('playbook_executions')
      .update({
        status: finalStatus,
        actions_taken: actionResults,
        evidence_ids: evidenceIds,
        completed_at: allActionsExecuted ? new Date().toISOString() : null,
      })
      .eq('id', execution_id);

    // [OK]  ENTERPRISE: Criar audit log com referencia ao snapshot
    await supabase.from('audit_logs').insert({
      user_id: userId,
      tenant_id: execution.tenant_id,
      action: 'execute_playbook',
      resource_type: 'playbook_execution',
      resource_id: execution_id,
      success: !anyFailed,
      details: {
        playbook_name: playbookSnapshot.name,
        playbook_version: playbookSnapshot.version,
        actions_executed: actionResults.length,
        actions_succeeded: actionResults.filter(r => r.success).length,
        used_immutable_snapshot: true,
        execution_time_ms: Date.now() - startTime,
      },
    });

    logger.info(`[execute-playbook-action] Completed in ${Date.now() - startTime}ms (snapshot v${playbookSnapshot.version})`);

    return new Response(JSON.stringify({
      success: true,
      execution_id,
      status: finalStatus,
      playbook_version: playbookSnapshot.version,
      actions_executed: actionResults.length,
      results: actionResults,
      evidence_ids: evidenceIds,
      used_immutable_snapshot: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
});

async function executeAction(
  supabase: any,
  action: PlaybookAction,
  execution: Record<string, unknown>,
  userId: string,
  playbookSnapshot: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const payload = action.action_payload;
  const tenantId = execution.tenant_id as string;
  const agentId = execution.agent_id as string | null;
  const context = execution.trigger_context as Record<string, unknown> || {};

  switch (action.action_type) {
    case 'notify': {
      // Inserir na fila de notificacoes
      const { data: notification } = await supabase
        .from('notification_queue')
        .insert({
          tenant_id: tenantId,
          channel: (payload.channels as string[])?.[0] || 'email',
          recipient_type: 'admin',
          subject: `[CyberShield] Playbook: ${action.label}`,
          message: action.description || 'Acao de playbook executada',
          priority: 'high',
          metadata: {
            playbook_execution_id: execution.id,
            playbook_version: playbookSnapshot.version,
            action_id: action.id,
            agent_id: agentId,
            context,
          },
        })
        .select('id')
        .single();

      return { notification_id: notification?.id, channels: payload.channels };
    }

    case 'isolate': {
      // Criar job de isolamento
      if (!agentId) {
        throw new Error('Agent ID required for isolation');
      }

      // P-13006 FIX: Add tenant_id filter to prevent cross-tenant agent lookup
      const { data: agent } = await supabase
        .from('agents')
        .select('agent_name')
        .eq('id', agentId)
        .eq('tenant_id', tenantId)
        .single();

      const { data: job } = await supabase
        .from('jobs')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agent?.agent_name,
          type: 'network_isolate',
          status: 'queued',
          approved: true,
          payload: {
            isolation_level: payload.isolation_level || 'network',
            allow_cybershield: payload.allow_cybershield !== false,
            triggered_by: 'playbook',
            playbook_execution_id: execution.id,
            playbook_version: playbookSnapshot.version,
          },
        })
        .select('id')
        .single();

      // P-13007 FIX: Add tenant_id filter to status update to prevent cross-tenant state mutation
      await supabase
        .from('agents')
        .update({ status: 'isolated' })
        .eq('id', agentId)
        .eq('tenant_id', tenantId);

      return { job_id: job?.id, isolation_level: payload.isolation_level };
    }

    case 'generate_report': {
      // Criar entrada de evidencia
      const { data: evidence } = await supabase
        .from('agent_evidence_logs')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: (context.agent_info as Record<string, unknown>)?.agent_name || 'system',
          event_type: 'playbook_report_generated',
          event_data: {
            report_type: payload.report_type,
            action_label: action.label,
            execution_id: execution.id,
            playbook_version: playbookSnapshot.version,
            include_history: payload.include_history,
            include_domains: payload.include_domains,
            days_back: payload.days_back || 30,
          },
          evidence_hash: crypto.randomUUID(), // Placeholder - seria hash real
          severity: 'info',
        })
        .select('id')
        .single();

      return { 
        report_type: payload.report_type, 
        evidence_id: evidence?.id,
        scheduled: true,
      };
    }

    case 'create_job': {
      if (!agentId) {
        throw new Error('Agent ID required for job creation');
      }

      const { data: agent } = await supabase
        .from('agents')
        .select('agent_name')
        .eq('id', agentId)
        .single();

      const jobType = payload.job_type as string || 'diagnostic_full';

      const { data: job } = await supabase
        .from('jobs')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agent?.agent_name,
          type: jobType,
          status: 'queued',
          approved: true,
          payload: {
            verbose: payload.verbose === true,
            priority: payload.priority || 'normal',
            triggered_by: 'playbook',
            playbook_execution_id: execution.id,
            playbook_version: playbookSnapshot.version,
          },
        })
        .select('id')
        .single();

      return { job_id: job?.id, job_type: jobType };
    }

    case 'revoke_token': {
      if (!agentId) {
        throw new Error('Agent ID required for token revocation');
      }

      // Revogar todos os tokens do agente
      const { count } = await supabase
        .from('agent_tokens')
        .update({ is_active: false })
        .eq('agent_id', agentId)
        .eq('is_active', true);

      // Log de seguranca
      await supabase.from('security_logs').insert({
        tenant_id: tenantId,
        ip_address: 'system',
        endpoint: 'playbook/revoke_token',
        attack_type: 'token_revocation',
        severity: 'high',
        blocked: false,
        details: {
          agent_id: agentId,
          tokens_revoked: count || 0,
          triggered_by: 'playbook',
          execution_id: execution.id,
          playbook_version: playbookSnapshot.version,
        },
      });

      return { tokens_revoked: count || 0 };
    }

    case 'escalate': {
      // Criar alerta de sistema
      const { data: alert } = await supabase
        .from('system_alerts')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          alert_type: 'playbook_escalation',
          severity: 'high',
          message: `Escalacao de playbook: ${action.label}`,
          details: {
            playbook_execution_id: execution.id,
            playbook_version: playbookSnapshot.version,
            action_description: action.description,
            notify_roles: payload.notify_roles,
            create_incident: payload.create_incident,
            context,
          },
        })
        .select('id')
        .single();

      // Se criar incidente, inserir em security_events
      if (payload.create_incident) {
        await supabase.from('security_events').insert({
          tenant_id: tenantId,
          agent_id: agentId,
          severity: 'high',
          title: `Incidente: ${action.label}`,
          description: action.description,
          status: 'open',
          data: {
            playbook_execution_id: execution.id,
            playbook_version: playbookSnapshot.version,
            alert_id: alert?.id,
            context,
          },
        });
      }

      return { alert_id: alert?.id, incident_created: !!payload.create_incident };
    }

    // ====== FASE 1: Controle de Processos ======
    case 'kill_process': {
      if (!agentId) {
        throw new Error('Agent ID required for kill_process action');
      }

      // Verificar status do agente (warn se offline, mas nao bloquear)
      const { data: agent } = await supabase
        .from('agents')
        .select('agent_name, status, last_heartbeat')
        .eq('id', agentId)
        .single();

      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Log warning se agente pode estar offline
      if (agent.last_heartbeat) {
        const diffMs = Date.now() - new Date(agent.last_heartbeat).getTime();
        const diffMins = diffMs / (1000 * 60);
        if (diffMins > 5) {
          logger.warn(`[execute-playbook-action] Agent ${agentId} may be offline (last heartbeat: ${diffMins.toFixed(1)} min ago). Job will be queued.`);
        }
      }

      // Obter nome do processo do contexto ou payload
      const processName = (context.process_name as string) || 
                          (payload.process_name as string) || 
                          'unknown';

      // Usar funcao centralizada de protecao
      if (isProcessProtected(processName)) {
        throw new Error(`Protected process cannot be killed: ${processName}`);
      }

      const { data: job } = await supabase
        .from('jobs')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agent.agent_name,
          type: 'kill_process',
          status: 'queued',
          approved: true,
          payload: {
            process_name: processName,
            use_force: payload.use_force !== false,
            triggered_by: 'playbook',
            playbook_execution_id: execution.id,
            playbook_version: playbookSnapshot.version,
          },
        })
        .select('id')
        .single();

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: userId,
        tenant_id: tenantId,
        action: 'kill_process',
        resource_type: 'job',
        resource_id: job?.id,
        success: true,
        details: {
          agent_id: agentId,
          agent_status: agent.status,
          process_name: processName,
          triggered_by: 'playbook',
          playbook_execution_id: execution.id,
        },
      });

      logger.info(`[execute-playbook-action] Created kill_process job for ${processName}`);
      return { job_id: job?.id, process_name: processName };
    }

    case 'stop_service': {
      if (!agentId) {
        throw new Error('Agent ID required for stop_service action');
      }

      const { data: agent } = await supabase
        .from('agents')
        .select('agent_name, status, last_heartbeat')
        .eq('id', agentId)
        .single();

      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Log warning se agente pode estar offline
      if (agent.last_heartbeat) {
        const diffMs = Date.now() - new Date(agent.last_heartbeat).getTime();
        const diffMins = diffMs / (1000 * 60);
        if (diffMins > 5) {
          logger.warn(`[execute-playbook-action] Agent ${agentId} may be offline. Job will be queued.`);
        }
      }

      const serviceName = (context.service_name as string) || 
                          (payload.service_name as string) || 
                          'unknown';

      // Usar funcao centralizada de protecao
      if (isServiceProtected(serviceName)) {
        throw new Error(`Protected service cannot be stopped: ${serviceName}`);
      }

      const { data: job } = await supabase
        .from('jobs')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agent.agent_name,
          type: 'stop_service',
          status: 'queued',
          approved: true,
          payload: {
            service_name: serviceName,
            triggered_by: 'playbook',
            playbook_execution_id: execution.id,
            playbook_version: playbookSnapshot.version,
          },
        })
        .select('id')
        .single();

      await supabase.from('audit_logs').insert({
        user_id: userId,
        tenant_id: tenantId,
        action: 'stop_service',
        resource_type: 'job',
        resource_id: job?.id,
        success: true,
        details: {
          agent_id: agentId,
          agent_status: agent.status,
          service_name: serviceName,
          triggered_by: 'playbook',
          playbook_execution_id: execution.id,
        },
      });

      logger.info(`[execute-playbook-action] Created stop_service job for ${serviceName}`);
      return { job_id: job?.id, service_name: serviceName };
    }

    case 'disable_service': {
      if (!agentId) {
        throw new Error('Agent ID required for disable_service action');
      }

      const { data: agent } = await supabase
        .from('agents')
        .select('agent_name, status, last_heartbeat')
        .eq('id', agentId)
        .single();

      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Log warning se agente pode estar offline
      if (agent.last_heartbeat) {
        const diffMs = Date.now() - new Date(agent.last_heartbeat).getTime();
        const diffMins = diffMs / (1000 * 60);
        if (diffMins > 5) {
          logger.warn(`[execute-playbook-action] Agent ${agentId} may be offline. Job will be queued.`);
        }
      }

      const serviceName = (context.service_name as string) || 
                          (payload.service_name as string) || 
                          'unknown';

      // Usar funcao centralizada de protecao
      if (isServiceProtected(serviceName)) {
        throw new Error(`Protected service cannot be disabled: ${serviceName}`);
      }

      const { data: job } = await supabase
        .from('jobs')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agent.agent_name,
          type: 'disable_service',
          status: 'queued',
          approved: true,
          payload: {
            service_name: serviceName,
            triggered_by: 'playbook',
            playbook_execution_id: execution.id,
            playbook_version: playbookSnapshot.version,
          },
        })
        .select('id')
        .single();

      await supabase.from('audit_logs').insert({
        user_id: userId,
        tenant_id: tenantId,
        action: 'disable_service',
        resource_type: 'job',
        resource_id: job?.id,
        success: true,
        details: {
          agent_id: agentId,
          agent_status: agent.status,
          service_name: serviceName,
          triggered_by: 'playbook',
          playbook_execution_id: execution.id,
        },
      });

      logger.info(`[execute-playbook-action] Created disable_service job for ${serviceName}`);
      return { job_id: job?.id, service_name: serviceName };
    }

    case 'restart_service': {
      if (!agentId) {
        throw new Error('Agent ID required for restart_service action');
      }

      const { data: agent } = await supabase
        .from('agents')
        .select('agent_name, status, last_heartbeat')
        .eq('id', agentId)
        .single();

      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Log warning se agente pode estar offline
      if (agent.last_heartbeat) {
        const diffMs = Date.now() - new Date(agent.last_heartbeat).getTime();
        const diffMins = diffMs / (1000 * 60);
        if (diffMins > 5) {
          logger.warn(`[execute-playbook-action] Agent ${agentId} may be offline. Job will be queued.`);
        }
      }

      const serviceName = (context.service_name as string) || 
                          (payload.service_name as string) || 
                          'CyberShieldAgent';

      // Restart service NAO valida protecao - usado para reiniciar o proprio agente
      // Apenas log de warning para servicos criticos
      if (isServiceProtected(serviceName)) {
        logger.warn(`[execute-playbook-action] Warning: restarting protected service ${serviceName}`);
      }

      const { data: job } = await supabase
        .from('jobs')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          agent_name: agent.agent_name,
          type: 'restart_service',
          status: 'queued',
          approved: true,
          payload: {
            service_name: serviceName,
            triggered_by: 'playbook',
            playbook_execution_id: execution.id,
            playbook_version: playbookSnapshot.version,
          },
        })
        .select('id')
        .single();

      await supabase.from('audit_logs').insert({
        user_id: userId,
        tenant_id: tenantId,
        action: 'restart_service',
        resource_type: 'job',
        resource_id: job?.id,
        success: true,
        details: {
          agent_id: agentId,
          agent_status: agent.status,
          service_name: serviceName,
          triggered_by: 'playbook',
          playbook_execution_id: execution.id,
        },
      });

      logger.info(`[execute-playbook-action] Created restart_service job for ${serviceName}`);
      return { job_id: job?.id, service_name: serviceName };
    }

    default:
      throw new Error(`Unknown action type: ${action.action_type}`);
  }
}
