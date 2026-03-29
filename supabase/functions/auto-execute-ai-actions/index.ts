/**
 * Auto Execute AI Actions - Edge Function
 * 
 * Executa automaticamente acoes de IA de baixo risco que nao requerem aprovacao manual.
 * ENTERPRISE: Usa resolve-action-policy como PONTO UNICO DE DECISAO.
 * 
 * Fluxo:
 * 1. Busca insights recentes que geraram acoes pendentes
 * 2. Consulta resolve-action-policy para cada acao
 * 3. Executa acoes de baixo risco automaticamente
 * 4. Registra execucoes no audit log
 * 5. Fecha ciclo atualizando status do insight
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts'
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts'
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

interface ExecutionResult {
  actions_processed: number
  actions_executed: number
  actions_skipped: number
  insights_resolved: number
  errors: string[]
}

interface PolicyResponse {
  execution_mode: 'auto' | 'approval' | 'disabled'
  source: 'tenant_policy' | 'default_mapping' | 'tenant_fallback'
  policy_details?: Record<string, any>
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) })
  }

  // V-1103: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req)
  if (authError) return authError

  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  
  logger.info(`[${requestId}] auto-execute-ai-actions started`)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // KILL SWITCH CHECK (ADR-FINAL) - Halt all automation if system is in halt_jobs mode
    const { data: systemMode } = await supabase.rpc('get_system_mode_safe')
    if (systemMode === 'halt_jobs') {
      logger.info(`[${requestId}] SYSTEM_HALTED: Kill switch active, skipping AI actions`)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SYSTEM_HALTED', 
          message: 'Kill switch is active. Set system_state.mode to normal to resume.' 
        }),
        { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    // Helper: Invocar resolve-action-policy (PONTO UNICO DE DECISAO)
    async function resolvePolicy(tenantId: string, insightType: string): Promise<PolicyResponse> {
      try {
        const response = await fetchWithTimeout(
          `${supabaseUrl}/functions/v1/resolve-action-policy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              tenant_id: tenantId,
              insight_type: insightType,
            }),
          }
        )
        
        if (!response.ok) {
          logger.error(`[${requestId}] Policy resolution failed: ${response.status}`)
          return { execution_mode: 'approval', source: 'tenant_fallback' }
        }
        
        return await response.json()
      } catch (err) {
        logger.error(`[${requestId}] Policy resolution error:`, err)
        return { execution_mode: 'approval', source: 'tenant_fallback' }
      }
    }

    // Buscar acoes pendentes que nao requerem aprovacao
    // P0 FIX: Buscar acoes de cada tenant separadamente para garantir balanceamento justo
    // Usa query que distribui acoes entre tenants (round-robin)
    const { data: pendingActionsRaw, error: actionsError } = await supabase
      .rpc('get_balanced_pending_actions', { p_limit: 50 })
    
    // Fallback para query direta se RPC nao existir
    let pendingActions = pendingActionsRaw
    if (actionsError || !pendingActionsRaw) {
      logger.info(`[${requestId}] Using fallback query (RPC not available)`)
      const { data, error } = await supabase
        .from('ai_actions')
        .select(`
          id,
          tenant_id,
          action_type,
          action_payload,
          insight_id,
          ai_insights(id, confidence_score, insight_type, status)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(50)
      
      if (error) throw error
      pendingActions = data
    }

    if (!pendingActions || pendingActions.length === 0) {
      logger.info(`[${requestId}] No pending actions found`)
      
      // Log job run even when no actions
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'auto-execute-ai-actions',
        p_success: true,
        p_duration_ms: Date.now() - startTime,
        p_result: { message: 'No pending actions' },
        p_processed_count: 0,
        p_job_source: 'cron'
      })
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No pending actions',
          actions_processed: 0 
        }),
        { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    logger.info(`[${requestId}] Found ${pendingActions.length} pending actions`)

    // Buscar configuracoes de acoes (whitelist)
    const { data: actionConfigs } = await supabase
      .from('ai_action_configs')
      .select('action_type, is_enabled, requires_approval, risk_level, max_executions_per_day')

    const configMap = new Map(actionConfigs?.map(c => [c.action_type, c]) || [])

    const result: ExecutionResult = {
      actions_processed: 0,
      actions_executed: 0,
      actions_skipped: 0,
      insights_resolved: 0,
      errors: []
    }

    for (const action of pendingActions) {
      result.actions_processed++
      
      const config = configMap.get(action.action_type)
      const insight = action.ai_insights as Record<string, unknown>
      
      // Skip se nao esta na whitelist ou esta desabilitado
      if (!config || !config.is_enabled) {
        logger.info(`[${requestId}] Skipping ${action.id}: action type ${action.action_type} not enabled`)
        result.actions_skipped++
        continue
      }

      // Skip se requer aprovacao manual (from ai_action_configs)
      if (config.requires_approval) {
        logger.info(`[${requestId}] Skipping ${action.id}: requires manual approval (config)`)
        result.actions_skipped++
        continue
      }

      // ENTERPRISE: Consultar Policy Engine centralizado
      const insightType = insight?.insight_type || ''
      const policy = await resolvePolicy(action.tenant_id, insightType)
      
      logger.info(`[${requestId}] Action ${action.id} policy: mode=${policy.execution_mode}, source=${policy.source}`)
      
      // Skip se tenant desabilitou este tipo de insight
      if (policy.execution_mode === 'disabled') {
        logger.info(`[${requestId}] Skipping ${action.id}: disabled by policy (source=${policy.source})`)
        result.actions_skipped++
        continue
      }
      
      // Skip se requer aprovacao (nao e auto)
      if (policy.execution_mode === 'approval') {
        logger.info(`[${requestId}] Skipping ${action.id}: requires approval (source=${policy.source})`)
        result.actions_skipped++
        continue
      }
      
      // So continua se execution_mode === 'auto'
      // Skip se e alto risco (protecao adicional)
      if (config.risk_level === 'high') {
        logger.info(`[${requestId}] Skipping ${action.id}: high risk action`)
        result.actions_skipped++
        continue
      }

      // [OK]  HUMAN-IN-THE-LOOP: Check if critical actions require human review
      const insightSeverity = insight?.severity || config.risk_level || 'medium'
      const { data: needsHumanReview } = await supabase.rpc('requires_human_review', {
        p_tenant_id: action.tenant_id,
        p_severity: insightSeverity,
        p_action_type: action.action_type,
      })

      if (needsHumanReview) {
        logger.info(`[${requestId}] HUMAN-IN-THE-LOOP: Action ${action.id} (severity=${insightSeverity}) requires human review, creating approval request`)
        
        // Create approval request instead of auto-executing
        await supabase.from('approval_requests').insert({
          tenant_id: action.tenant_id,
          action_type: action.action_type,
          action_payload: {
            ...(action.action_payload as Record<string, unknown>),
            insight_id: action.insight_id,
            original_severity: insightSeverity,
            human_review_reason: 'critical_severity_requires_approval',
          },
          requested_by: null, // System
          status: 'pending',
          required_approvers: 1,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })

        // Mark action as awaiting approval
        await supabase.from('ai_actions').update({
          status: 'awaiting_approval',
        }).eq('id', action.id)

        result.actions_skipped++
        continue
      }

      // Verificar rate limit
      const { data: canExecute } = await supabase
        .rpc('check_action_rate_limit', {
          p_action_type: action.action_type,
          p_tenant_id: action.tenant_id
        })

      if (!canExecute) {
        logger.info(`[${requestId}] Skipping ${action.id}: rate limit exceeded`)
        result.actions_skipped++
        continue
      }

      // CICLO FECHADO: Marcar insight como in_progress
      if (action.insight_id && insight) {
        await supabase
          .from('ai_insights')
          .update({ status: 'in_progress' })
          .eq('id', action.insight_id)
      }

      // Executar acao automaticamente
      try {
        let executionResult: Record<string, unknown> = {}
        
        switch (action.action_type) {
          case 'create_system_alert': {
            const payload = action.action_payload as Record<string, unknown>
            // Mapear para tipos de alerta validos
            const validAlertTypes = [
              'agent_offline', 'high_cpu', 'high_memory', 'high_disk', 
              'job_failed', 'security_threat', 'memory_warning',
              'ai_insight_alert', 'blocked_access_pattern', 'job_integrity_violation',
              'safe_mode_auto', 'agent_divergent', 'progressive_degradation'
            ]
            let alertType = payload.alert_type || 'ai_insight_alert'
            if (!validAlertTypes.includes(alertType)) {
              alertType = 'ai_insight_alert'
            }
            
            const { data: alert, error: alertError } = await supabase
              .from('system_alerts')
              .insert({
                tenant_id: action.tenant_id,
                alert_type: alertType,
                severity: payload.severity || 'info',
                title: (payload.title || payload.message || 'AI Alert').slice(0, 80),
                message: payload.message || payload.title || 'AI-generated alert',
                details: {
                  insight_id: action.insight_id,
                  auto_executed: true,
                  source: 'auto-execute-ai-actions',
                  original_payload: payload
                }
              })
              .select()
              .maybeSingle()

            if (alertError) throw alertError
            executionResult = { alert_id: alert?.id || 'created' }
            break
          }

          case 'cleanup_stuck_jobs': {
            // Execute the cleanup_stuck_jobs RPC function
            const { data: cleanupResult, error: cleanupError } = await supabase
              .rpc('cleanup_stuck_jobs')
            
            if (cleanupError) throw cleanupError
            
            executionResult = {
              action_executed: true,
              cleanup_result: cleanupResult,
              jobs_cleaned: cleanupResult?.[0]?.cleaned_count || 0
            }
            break
          }

          case 'suggest_agent_restart':
          case 'suggest_config_change':
          case 'suggest_job_cleanup': {
            // Sugestoes sao apenas registradas, nao executam acao real
            executionResult = {
              suggestion_recorded: true,
              action_type: action.action_type,
              payload: action.action_payload
            }
            break
          }

          default:
            logger.info(`[${requestId}] Action type ${action.action_type} not auto-executable`)
            result.actions_skipped++
            continue
        }

        // Atualizar status da acao COM policy_source para auditoria
        await supabase
          .from('ai_actions')
          .update({
            status: 'executed',
            executed_at: new Date().toISOString(),
            result: { 
              ...executionResult, 
              policy_source: policy.source,
              policy_mode: policy.execution_mode
            }
          })
          .eq('id', action.id)

        // Registrar execucao
        await supabase
          .from('ai_action_executions')
          .insert({
            action_id: action.id,
            tenant_id: action.tenant_id,
            execution_status: 'executed',
            execution_result: {
              ...executionResult,
              policy_source: policy.source
            },
            executed_at: new Date().toISOString()
          })

        // CICLO FECHADO: Marcar insight como resolved
        if (action.insight_id) {
          await supabase
            .from('ai_insights')
            .update({
              status: 'resolved',
              resolved_at: new Date().toISOString(),
              auto_action_executed: true
            })
            .eq('id', action.insight_id)
          
          result.insights_resolved++
          logger.info(`[${requestId}] Insight ${action.insight_id} marked as resolved (cycle closed)`)
        }

        logger.info(`[${requestId}] Auto-executed action ${action.id} (policy_source=${policy.source})`)
        result.actions_executed++

      } catch (execError: Record<string, unknown>) {
        logger.error(`[${requestId}] Failed to execute action ${action.id}:`, execError)
        result.errors.push(`${action.id}: ${execError.message}`)
        
        // Marcar acao como falhou
        await supabase
          .from('ai_actions')
          .update({
            status: 'failed',
            error_message: execError.message
          })
          .eq('id', action.id)

        // CICLO FECHADO: Marcar insight como failed
        if (action.insight_id) {
          await supabase
            .from('ai_insights')
            .update({
              status: 'failed'
            })
            .eq('id', action.insight_id)
        }
      }
    }

    const duration = Date.now() - startTime
    logger.info(`[${requestId}] Completed in ${duration}ms:`, result)

    // Log job run
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'auto-execute-ai-actions',
      p_success: true,
      p_duration_ms: duration,
      p_result: result,
      p_processed_count: result.actions_processed,
      p_job_source: 'cron'
    })

    return new Response(
      JSON.stringify({
        success: true,
        request_id: requestId,
        duration_ms: duration,
        ...result
      }),
      { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const duration = Date.now() - startTime
    logger.error(`[${requestId}] Error after ${duration}ms:`, error)
    
    // Log job run failure
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'auto-execute-ai-actions',
      p_success: false,
      p_duration_ms: duration,
      p_error: error instanceof Error ? error.message : 'Unknown error',
      p_processed_count: 0,
      p_job_source: 'cron'
    })
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        request_id: requestId
      }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }
})
