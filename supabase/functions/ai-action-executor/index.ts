import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger, loggerWithContext } from '../_shared/logger.ts';
import {
  DiagnosticJobPayloadSchema,
  SystemAlertPayloadSchema,
  SuggestAgentRestartPayloadSchema,
  SuggestConfigChangePayloadSchema,
  SuggestJobCleanupPayloadSchema,
  DeleteOldDataPayloadSchema,
  QuarantineAgentPayloadSchema,
  IsolateAgentPayloadSchema,
  RevokeTokenPayloadSchema,
  DisableUserPayloadSchema,
  BlockIpPayloadSchema,
  IncludeFirewallRulePayloadSchema,
  RestartServicePayloadSchema,
  AcknowledgeAlertPayloadSchema,
  CleanupStuckJobsPayloadSchema,
} from '../_shared/validation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = loggerWithContext(requestId);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Verificar autenticacao do usuario
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action_id } = await req.json();
    
    if (!action_id) {
      throw new Error('action_id is required');
    }

    log.info('Processing action', { action_id, user_id: user.id });

    // 1. Buscar acao
    const { data: action, error: actionError } = await supabase
      .from('ai_actions')
      .select('*, ai_insights(*)')
      .eq('id', action_id)
      .single();

    if (actionError || !action) {
      throw new Error('Action not found');
    }

    // 2. Verificar se usuario e admin do tenant (use maybeSingle for users with multiple roles)
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', action.tenant_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roleError || !userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      throw new Error('Forbidden: Only admins can execute actions');
    }

    // 3. Verificar se acao esta na whitelist
    const { data: actionConfig, error: configError } = await supabase
      .from('ai_action_configs')
      .select('*')
      .eq('action_type', action.action_type)
      .maybeSingle();

    if (configError || !actionConfig) {
      throw new Error(`Action type ${action.action_type} not found in whitelist`);
    }

    if (!actionConfig.is_enabled) {
      throw new Error(`Action type ${action.action_type} is disabled`);
    }

    // 4. Verificar se requer aprovacao
    if (actionConfig.requires_approval && action.status !== 'pending') {
      throw new Error('Action already processed');
    }

    // 5. Verificar rate limit
    const { data: canExecute, error: rateLimitError } = await supabase
      .rpc('check_action_rate_limit', {
        p_action_type: action.action_type,
        p_tenant_id: action.tenant_id
      });

    if (rateLimitError || !canExecute) {
      throw new Error('Rate limit exceeded for this action type');
    }

    // 6. Verificar safe mode
    const { data: safeMode } = await supabase
      .from('tenant_features')
      .select('enabled')
      .eq('tenant_id', action.tenant_id)
      .eq('feature_key', 'ai_safe_mode')
      .maybeSingle();

    if (safeMode?.enabled && actionConfig.risk_level === 'high') {
      throw new Error('Safe mode blocks high-risk actions');
    }

    // 7. Executar acao baseada no tipo
    let executionResult: any = {};
    let executionStatus = 'executed';
    let errorMessage = null;

    try {
      switch (action.action_type) {
        case 'create_diagnostic_job': {
          const payload = DiagnosticJobPayloadSchema.parse(action.action_payload);
          const { data: job, error: jobError } = await supabase
            .from('jobs')
            .insert({
              tenant_id: action.tenant_id,
              agent_name: payload.agent_name,
              type: 'diagnostic',
              status: 'queued',
              approved: true,
              payload: {
                diagnostic_type: payload.diagnostic_type,
                priority: payload.priority,
                reason: 'AI-suggested diagnostic',
                insight_id: action.insight_id,
                checks: ['heartbeat', 'metrics', 'jobs', 'token'],
                ...(payload.metadata ?? {}),
              },
            })
            .select()
            .maybeSingle();

          if (jobError) throw jobError;
          executionResult = { job_id: job?.id, agent_name: payload.agent_name };
          break;
        }

        case 'create_system_alert': {
          const payload = SystemAlertPayloadSchema.parse(action.action_payload);
          const { data: alert, error: alertError } = await supabase
            .from('system_alerts')
            .insert({
              tenant_id: action.tenant_id,
              alert_type: payload.alert_type,
              severity: payload.severity,
              title: payload.message.slice(0, 80),
              message: payload.message,
              details: {
                insight_id: action.insight_id,
                ai_confidence: action.ai_insights?.confidence_score,
                source: 'ai-action-executor',
                ...(payload.metadata ?? {}),
              },
            })
            .select()
            .maybeSingle();

          if (alertError) throw alertError;
          executionResult = { alert_id: alert?.id };
          break;
        }

        case 'suggest_agent_restart': {
          const payload = SuggestAgentRestartPayloadSchema.parse(action.action_payload);
          executionResult = {
            suggestion_type: 'agent_restart',
            agent_name: payload.agent_name,
            reason: payload.reason,
            urgency: payload.urgency,
            note: 'Suggestion recorded. Manual action required.',
          };
          break;
        }

        case 'suggest_config_change': {
          const payload = SuggestConfigChangePayloadSchema.parse(action.action_payload);
          executionResult = {
            suggestion_type: 'config_change',
            agent_name: payload.agent_name,
            config_key: payload.config_key,
            suggested_value: payload.suggested_value,
            reason: payload.reason,
            note: 'Suggestion recorded. Manual action required.',
          };
          break;
        }

        case 'suggest_job_cleanup': {
          const payload = SuggestJobCleanupPayloadSchema.parse(action.action_payload);
          executionResult = {
            suggestion_type: 'job_cleanup',
            agent_name: payload.agent_name,
            job_status: payload.job_status,
            older_than_days: payload.older_than_days,
            reason: payload.reason,
            note: 'Suggestion recorded. Manual action required.',
          };
          break;
        }

        // ========== NOVOS ACTION TYPES (FASE 3) ==========

        case 'delete_old_data': {
          const payload = DeleteOldDataPayloadSchema.parse(action.action_payload);
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - payload.older_than_days);
          
          let deletedCount = 0;
          const tables: string[] = [];

          if (payload.data_type === 'jobs' || payload.data_type === 'all') {
            if (!payload.dry_run) {
              let query = supabase
                .from('jobs')
                .delete()
                .eq('tenant_id', action.tenant_id)
                .lt('created_at', cutoffDate.toISOString());

              if (payload.job_status !== 'all') {
                query = query.eq('status', payload.job_status);
              }

              const { data: deletedJobs } = await query.select('id');
              deletedCount += deletedJobs?.length || 0;
            }
            tables.push('jobs');
          }

          if (payload.data_type === 'alerts' || payload.data_type === 'all') {
            if (!payload.dry_run) {
              const { data: deletedAlerts } = await supabase
                .from('system_alerts')
                .delete()
                .eq('tenant_id', action.tenant_id)
                .lt('created_at', cutoffDate.toISOString())
                .eq('acknowledged', true)
                .select('id');
              deletedCount += deletedAlerts?.length || 0;
            }
            tables.push('system_alerts');
          }

          executionResult = {
            action: 'delete_old_data',
            tables_affected: tables,
            cutoff_date: cutoffDate.toISOString(),
            deleted_count: deletedCount,
            dry_run: payload.dry_run,
            reason: payload.reason,
          };
          break;
        }

        case 'quarantine_agent': {
          const payload = QuarantineAgentPayloadSchema.parse(action.action_payload);
          
          // Buscar agente
          const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('id, agent_name, is_isolated')
            .eq('tenant_id', action.tenant_id)
            .eq('agent_name', payload.agent_name)
            .maybeSingle();

          if (agentError || !agent) throw new Error(`Agent ${payload.agent_name} not found`);

          // Marcar agente como isolado
          const { error: updateError } = await supabase
            .from('agents')
            .update({
              is_isolated: true,
              isolated_at: new Date().toISOString(),
              isolation_reason: payload.reason,
            })
            .eq('id', agent.id);

          if (updateError) throw updateError;

          // Criar alerta se necessario
          if (payload.notify_admin) {
            await supabase.from('system_alerts').insert({
              tenant_id: action.tenant_id,
              alert_type: 'warning',
              severity: 'high',
              title: `Agente ${payload.agent_name} foi colocado em quarentena`,
              message: payload.reason,
              details: { agent_id: agent.id, source: 'ai-action-executor' },
            });
          }

          executionResult = {
            action: 'quarantine_agent',
            agent_id: agent.id,
            agent_name: payload.agent_name,
            quarantined: true,
            reason: payload.reason,
          };
          break;
        }

        case 'isolate_agent': {
          const payload = IsolateAgentPayloadSchema.parse(action.action_payload);
          
          const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('id, agent_name')
            .eq('tenant_id', action.tenant_id)
            .eq('agent_name', payload.agent_name)
            .maybeSingle();

          if (agentError || !agent) throw new Error(`Agent ${payload.agent_name} not found`);

          // Update agent isolation state
          const { error: updateError } = await supabase
            .from('agents')
            .update({
              is_isolated: true,
              isolated_at: new Date().toISOString(),
              isolation_reason: `[${payload.isolation_level.toUpperCase()}] ${payload.reason}`,
            })
            .eq('id', agent.id);

          if (updateError) throw updateError;

          // Create isolation job if needed
          if (payload.isolation_level !== 'soft') {
            await supabase.from('jobs').insert({
              tenant_id: action.tenant_id,
              agent_name: payload.agent_name,
              type: 'config',
              status: 'queued',
              approved: true,
              payload: {
                action: 'isolate_network',
                level: payload.isolation_level,
                allow_management: payload.allow_management,
                duration_hours: payload.duration_hours,
              },
            });
          }

          executionResult = {
            action: 'isolate_agent',
            agent_id: agent.id,
            agent_name: payload.agent_name,
            isolation_level: payload.isolation_level,
            isolated: true,
          };
          break;
        }

        case 'revoke_token': {
          const payload = RevokeTokenPayloadSchema.parse(action.action_payload);
          
          const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('id, agent_name')
            .eq('tenant_id', action.tenant_id)
            .eq('agent_name', payload.agent_name)
            .maybeSingle();

          if (agentError || !agent) throw new Error(`Agent ${payload.agent_name} not found`);

          // Revoke all active tokens
          const { data: revokedTokens, error: revokeError } = await supabase
            .from('agent_tokens')
            .update({ is_active: false })
            .eq('agent_id', agent.id)
            .eq('is_active', true)
            .select('id');

          if (revokeError) throw revokeError;
          const tokenCount = revokedTokens?.length || 0;

          executionResult = {
            action: 'revoke_token',
            agent_id: agent.id,
            agent_name: payload.agent_name,
            tokens_revoked: tokenCount,
            force_reenrollment: payload.force_reenrollment,
            reason: payload.reason,
          };
          break;
        }

        case 'disable_user': {
          const payload = DisableUserPayloadSchema.parse(action.action_payload);
          
          // This is a suggestion - we don't actually disable users directly
          // The admin must do this manually for security reasons
          executionResult = {
            action: 'disable_user',
            user_email: payload.user_email,
            reason: payload.reason,
            duration_hours: payload.duration_hours,
            note: 'User disable is a manual action. This has been logged for admin review.',
            requires_manual_action: true,
          };

          // Log security event
          await supabase.from('security_logs').insert({
            tenant_id: action.tenant_id,
            user_id: user.id,
            ip_address: req.headers.get('x-forwarded-for') || 'unknown',
            endpoint: '/functions/v1/ai-action-executor',
            attack_type: 'ai_disable_user_request',
            severity: 'high',
            blocked: false,
            user_agent: req.headers.get('user-agent') || 'unknown',
            details: { target_email: payload.user_email, reason: payload.reason },
          });
          break;
        }

        case 'block_ip': {
          const payload = BlockIpPayloadSchema.parse(action.action_payload);
          
          // Create a job to block the IP
          const jobPayload: any = {
            ip_address: payload.ip_address,
            duration_hours: payload.duration_hours,
            scope: payload.scope,
            reason: payload.reason,
          };

          if (payload.agent_name) {
            const { data: agent } = await supabase
              .from('agents')
              .select('id')
              .eq('tenant_id', action.tenant_id)
              .eq('agent_name', payload.agent_name)
              .maybeSingle();
            
            if (agent) {
              jobPayload.agent_id = agent.id;
            }
          }

          const { data: job, error: jobError } = await supabase
            .from('jobs')
            .insert({
              tenant_id: action.tenant_id,
              agent_name: payload.agent_name || 'all',
              type: 'config',
              status: 'queued',
              approved: true,
              payload: { action: 'block_ip', ...jobPayload },
            })
            .select()
            .maybeSingle();

          if (jobError) throw jobError;

          executionResult = {
            action: 'block_ip',
            job_id: job.id,
            ip_address: payload.ip_address,
            scope: payload.scope,
            duration_hours: payload.duration_hours,
          };
          break;
        }

        case 'include_firewall_rule': {
          const payload = IncludeFirewallRulePayloadSchema.parse(action.action_payload);
          
          const { data: job, error: jobError } = await supabase
            .from('jobs')
            .insert({
              tenant_id: action.tenant_id,
              agent_name: payload.agent_name,
              type: 'fix_firewall',
              status: 'queued',
              approved: true,
              payload: {
                rule_type: payload.rule_type,
                protocol: payload.protocol,
                port: payload.port,
                port_range: payload.port_range,
                ip_address: payload.ip_address,
                direction: payload.direction,
                reason: payload.reason,
              },
            })
            .select()
            .maybeSingle();

          if (jobError) throw jobError;

          executionResult = {
            action: 'include_firewall_rule',
            job_id: job.id,
            agent_name: payload.agent_name,
            rule_type: payload.rule_type,
            protocol: payload.protocol,
            direction: payload.direction,
          };
          break;
        }

        case 'restart_service': {
          const payload = RestartServicePayloadSchema.parse(action.action_payload);
          
          const { data: job, error: jobError } = await supabase
            .from('jobs')
            .insert({
              tenant_id: action.tenant_id,
              agent_name: payload.agent_name,
              type: 'restart_service',
              status: 'queued',
              approved: true,
              payload: {
                service_name: payload.service_name,
                force: payload.force,
                timeout_seconds: payload.timeout_seconds,
                reason: payload.reason,
              },
            })
            .select()
            .maybeSingle();

          if (jobError) throw jobError;

          executionResult = {
            action: 'restart_service',
            job_id: job.id,
            agent_name: payload.agent_name,
            service_name: payload.service_name,
          };
          break;
        }

        case 'acknowledge_alerts': {
          const payload = AcknowledgeAlertPayloadSchema.parse(action.action_payload);
          
          let query = supabase
            .from('system_alerts')
            .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
            .eq('tenant_id', action.tenant_id)
            .eq('acknowledged', false);

          if (!payload.acknowledge_all && payload.alert_ids) {
            query = query.in('id', payload.alert_ids);
          }

          const { data: acknowledgedAlerts, error: ackError } = await query.select('id');

          if (ackError) throw ackError;

          executionResult = {
            action: 'acknowledge_alerts',
            acknowledged_count: acknowledgedAlerts?.length || 0,
            all_alerts: payload.acknowledge_all,
            reason: payload.reason,
          };
          break;
        }

        case 'cleanup_stuck_jobs': {
          const payload = CleanupStuckJobsPayloadSchema.parse(action.action_payload);
          const cutoffDate = new Date();
          cutoffDate.setHours(cutoffDate.getHours() - payload.older_than_hours);

          if (!payload.dry_run) {
            let query = supabase
              .from('jobs')
              .update({ status: 'failed', completed_at: new Date().toISOString() })
              .eq('tenant_id', action.tenant_id)
              .in('status', ['pending', 'in_progress'])
              .lt('created_at', cutoffDate.toISOString());

            if (payload.agent_name) {
              query = query.eq('agent_name', payload.agent_name);
            }

            if (payload.job_types && payload.job_types.length > 0) {
              query = query.in('type', payload.job_types);
            }

            const { data: cleanedJobs, error: cleanupError } = await query.select('id');
            if (cleanupError) throw cleanupError;
            
            executionResult = {
              action: 'cleanup_stuck_jobs',
              jobs_cleaned: cleanedJobs?.length || 0,
              cutoff_hours: payload.older_than_hours,
              agent_filter: payload.agent_name || 'all',
              dry_run: false,
            };
          } else {
            executionResult = {
              action: 'cleanup_stuck_jobs',
              cutoff_hours: payload.older_than_hours,
              agent_filter: payload.agent_name || 'all',
              dry_run: true,
              note: 'Dry run - no changes made',
            };
          }
          break;
        }

        default:
          throw new Error(`Action type ${action.action_type} not implemented`);
      }
    } catch (execError: any) {
      log.error('Execution failed: ' + execError.message, { action_type: action.action_type, error: execError.message });
      executionStatus = 'failed';
      errorMessage = execError.message;
      executionResult = { error: execError.message };
    }

    // 8. Registrar execucao no audit log
    const { error: execLogError } = await supabase
      .from('ai_action_executions')
      .insert({
        action_id: action.id,
        tenant_id: action.tenant_id,
        executed_by: user.id,
        execution_status: executionStatus,
        execution_result: executionResult,
        error_message: errorMessage,
        executed_at: new Date().toISOString()
      });

    if (execLogError) {
      log.error('Failed to log execution', execLogError);
    }

    // 9. Atualizar status da acao
    const { error: updateError } = await supabase
      .from('ai_actions')
      .update({
        status: executionStatus,
        executed_by: user.id,
        executed_at: new Date().toISOString(),
        result: executionResult
      })
      .eq('id', action.id);

    if (updateError) {
      log.error('Failed to update action', updateError);
    }

    log.success('Action executed', { action_id, status: executionStatus });

    // 10. Security logging: registrar acao de IA executada
    if (executionStatus === 'executed') {
      const { error: securityLogError } = await supabase
        .from('security_logs')
        .insert({
          tenant_id: action.tenant_id,
          user_id: user.id,
          ip_address: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown',
          endpoint: '/functions/v1/ai-action-executor',
          attack_type: 'ai_action_executed',
          severity: actionConfig.risk_level === 'high' ? 'high' : 'info',
          blocked: false,
          user_agent: req.headers.get('user-agent') || 'unknown',
          details: {
            action_id: action.id,
            action_type: action.action_type,
            executed_by: user.id,
            insight_id: action.insight_id,
            risk_level: actionConfig.risk_level,
            result_summary: executionResult,
          },
        });

      if (securityLogError) {
        log.error('Failed to log security event', securityLogError);
      }
    }

    return new Response(
      JSON.stringify({
        success: executionStatus === 'executed',
        action_id: action.id,
        execution_status: executionStatus,
        result: executionResult,
        error: errorMessage
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logger.error('AI action executor error', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.toString()
      }),
      { 
        status: error.message.includes('Unauthorized') || error.message.includes('Forbidden') ? 403 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});