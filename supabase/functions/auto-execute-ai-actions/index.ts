/**
 * Auto Execute AI Actions - Edge Function
 * 
 * Executa automaticamente ações de IA de baixo risco que não requerem aprovação manual.
 * 
 * Fluxo:
 * 1. Busca insights recentes que geraram ações pendentes
 * 2. Verifica whitelist e rate limits
 * 3. Executa ações de baixo risco automaticamente
 * 4. Registra execuções no audit log
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'

interface ExecutionResult {
  actions_processed: number
  actions_executed: number
  actions_skipped: number
  errors: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  
  console.log(`[${requestId}] auto-execute-ai-actions started`)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Buscar ações pendentes que não requerem aprovação
    const { data: pendingActions, error: actionsError } = await supabase
      .from('ai_actions')
      .select(`
        id,
        tenant_id,
        action_type,
        action_payload,
        insight_id,
        ai_insights(confidence_score, insight_type)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50)

    if (actionsError) {
      throw actionsError
    }

    if (!pendingActions || pendingActions.length === 0) {
      console.log(`[${requestId}] No pending actions found`)
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No pending actions',
          actions_processed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[${requestId}] Found ${pendingActions.length} pending actions`)

    // Buscar configurações de ações
    const { data: actionConfigs } = await supabase
      .from('ai_action_configs')
      .select('action_type, is_enabled, requires_approval, risk_level, max_executions_per_day')

    const configMap = new Map(actionConfigs?.map(c => [c.action_type, c]) || [])

    const result: ExecutionResult = {
      actions_processed: 0,
      actions_executed: 0,
      actions_skipped: 0,
      errors: []
    }

    for (const action of pendingActions) {
      result.actions_processed++
      
      const config = configMap.get(action.action_type)
      
      // Skip se não está na whitelist ou está desabilitado
      if (!config || !config.is_enabled) {
        console.log(`[${requestId}] Skipping ${action.id}: action type ${action.action_type} not enabled`)
        result.actions_skipped++
        continue
      }

      // Skip se requer aprovação manual
      if (config.requires_approval) {
        console.log(`[${requestId}] Skipping ${action.id}: requires manual approval`)
        result.actions_skipped++
        continue
      }

      // Skip se é alto risco
      if (config.risk_level === 'high') {
        console.log(`[${requestId}] Skipping ${action.id}: high risk action`)
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
        console.log(`[${requestId}] Skipping ${action.id}: rate limit exceeded`)
        result.actions_skipped++
        continue
      }

      // Executar ação automaticamente
      try {
        let executionResult: any = {}
        
        switch (action.action_type) {
          case 'create_system_alert': {
            const payload = action.action_payload as any
            // Mapear para tipos de alerta válidos
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
              .single()

            if (alertError) throw alertError
            executionResult = { alert_id: alert.id }
            break
          }

          case 'suggest_agent_restart':
          case 'suggest_config_change':
          case 'suggest_job_cleanup': {
            // Sugestões são apenas registradas, não executam ação real
            executionResult = {
              suggestion_recorded: true,
              action_type: action.action_type,
              payload: action.action_payload
            }
            break
          }

          default:
            console.log(`[${requestId}] Action type ${action.action_type} not auto-executable`)
            result.actions_skipped++
            continue
        }

        // Atualizar status da ação
        await supabase
          .from('ai_actions')
          .update({
            status: 'executed',
            executed_at: new Date().toISOString(),
            result: executionResult
          })
          .eq('id', action.id)

        // Registrar execução
        await supabase
          .from('ai_action_executions')
          .insert({
            action_id: action.id,
            tenant_id: action.tenant_id,
            execution_status: 'executed',
            execution_result: executionResult,
            executed_at: new Date().toISOString()
          })

        console.log(`[${requestId}] Auto-executed action ${action.id}`)
        result.actions_executed++

      } catch (execError: any) {
        console.error(`[${requestId}] Failed to execute action ${action.id}:`, execError)
        result.errors.push(`${action.id}: ${execError.message}`)
        
        // Marcar como falhou
        await supabase
          .from('ai_actions')
          .update({
            status: 'failed',
            error_message: execError.message
          })
          .eq('id', action.id)
      }
    }

    const duration = Date.now() - startTime
    console.log(`[${requestId}] Completed in ${duration}ms:`, result)

    return new Response(
      JSON.stringify({
        success: true,
        request_id: requestId,
        duration_ms: duration,
        ...result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[${requestId}] Error after ${duration}ms:`, error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        request_id: requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
