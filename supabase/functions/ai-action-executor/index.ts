import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import {
  DiagnosticJobPayloadSchema,
  SystemAlertPayloadSchema,
  SuggestAgentRestartPayloadSchema,
  SuggestConfigChangePayloadSchema,
} from '../_shared/validation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Verificar autenticação do usuário
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action_id } = await req.json();
    
    if (!action_id) {
      throw new Error('action_id is required');
    }

    console.log(`[ai-action-executor] Processing action ${action_id} for user ${user.id}`);

    // 1. Buscar ação
    const { data: action, error: actionError } = await supabase
      .from('ai_actions')
      .select('*, ai_insights(*)')
      .eq('id', action_id)
      .single();

    if (actionError || !action) {
      throw new Error('Action not found');
    }

    // 2. Verificar se usuário é admin do tenant
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', action.tenant_id)
      .single();

    if (roleError || !userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      throw new Error('Forbidden: Only admins can execute actions');
    }

    // 3. Verificar se ação está na whitelist
    const { data: actionConfig, error: configError } = await supabase
      .from('ai_action_configs')
      .select('*')
      .eq('action_type', action.action_type)
      .single();

    if (configError || !actionConfig) {
      throw new Error(`Action type ${action.action_type} not found in whitelist`);
    }

    if (!actionConfig.is_enabled) {
      throw new Error(`Action type ${action.action_type} is disabled`);
    }

    // 4. Verificar se requer aprovação
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
      .single();

    if (safeMode?.enabled && actionConfig.risk_level === 'high') {
      throw new Error('Safe mode blocks high-risk actions');
    }

    // 7. Executar ação baseada no tipo
    let executionResult: any = {};
    let executionStatus = 'executed';
    let errorMessage = null;

    try {
      switch (action.action_type) {
        case 'create_diagnostic_job': {
          // Validar payload com Zod
          const payload = DiagnosticJobPayloadSchema.parse(action.action_payload);

          const { data: job, error: jobError } = await supabase
            .from('jobs')
            .insert({
              tenant_id: action.tenant_id,
              agent_name: payload.agent_name,
              type: 'diagnostic',
              status: 'pending',
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
            .single();

          if (jobError) throw jobError;
          executionResult = { job_id: job.id, agent_name: payload.agent_name };
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
            .single();

          if (alertError) throw alertError;
          executionResult = { alert_id: alert.id };
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
          // Manter case existente sem validação específica por enquanto
          executionResult = {
            suggestion_type: action.action_type,
            payload: action.action_payload,
            note: 'Suggestion recorded. Manual action required.'
          };
          break;
        }

        default:
          throw new Error(`Action type ${action.action_type} not implemented`);
      }
    } catch (execError: any) {
      console.error(`[ai-action-executor] Execution failed:`, execError);
      executionStatus = 'failed';
      errorMessage = execError.message;
      executionResult = { error: execError.message };
    }

    // 8. Registrar execução no audit log
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
      console.error('[ai-action-executor] Failed to log execution:', execLogError);
    }

    // 9. Atualizar status da ação
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
      console.error('[ai-action-executor] Failed to update action:', updateError);
    }

    console.log(`[ai-action-executor] Action ${action_id} executed with status: ${executionStatus}`);

    // 10. Security logging: registrar ação de IA executada
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
        console.error('[ai-action-executor] Failed to log security event:', securityLogError);
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
    console.error('[ai-action-executor] Error:', error);
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
