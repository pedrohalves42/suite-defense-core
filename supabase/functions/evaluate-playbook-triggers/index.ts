import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TriggerEvent {
  tenant_id: string;
  trigger_type: 'agent_offline' | 'dns_blocked' | 'job_failed' | 'integrity_low' | 'manual';
  agent_id?: string;
  context?: Record<string, unknown>;
}

interface PlaybookAction {
  id: string;
  order_index: number;
  action_type: string;
  label: string;
  description: string;
  action_payload: Record<string, unknown>;
  risk_level: string;
}

interface RiskAnalysis {
  risk_score: number;
  threshold: number;
  should_auto_execute: boolean;
  has_destructive_actions: boolean;
  require_approval: boolean;
  is_enabled: boolean;
  decision_reason: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: TriggerEvent = await req.json();
    const { tenant_id, trigger_type, agent_id, context = {} } = body;

    if (!tenant_id || !trigger_type) {
      return new Response(JSON.stringify({ 
        error: 'tenant_id and trigger_type are required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[evaluate-playbook-triggers] Evaluating ${trigger_type} for tenant ${tenant_id}`);

    // Buscar playbooks ativos que match o trigger
    const { data: playbooks, error: pbError } = await supabase
      .from('playbooks')
      .select(`
        *,
        actions:playbook_actions(*)
      `)
      .eq('trigger_type', trigger_type)
      .eq('is_enabled', true)
      .or(`tenant_id.eq.${tenant_id},is_system.eq.true`)
      .order('is_system', { ascending: true }); // Tenant-specific primeiro

    if (pbError) {
      console.error('[evaluate-playbook-triggers] Error fetching playbooks:', pbError);
      throw pbError;
    }

    if (!playbooks || playbooks.length === 0) {
      console.log(`[evaluate-playbook-triggers] No active playbooks for ${trigger_type}`);
      return new Response(JSON.stringify({ 
        triggered: false,
        reason: 'No active playbooks for this trigger type',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Usar o primeiro playbook (tenant-specific tem prioridade)
    const playbook = playbooks[0];
    const cooldownMinutes = playbook.cooldown_minutes || 60;

    // ✅ ANTI-LOOP: Usar função robusta do banco
    const { data: hasRecentExec } = await supabase.rpc('has_recent_playbook_execution', {
      p_playbook_id: playbook.id,
      p_tenant_id: tenant_id,
      p_agent_id: agent_id || null,
      p_cooldown_minutes: cooldownMinutes
    });

    if (hasRecentExec) {
      console.log(`[evaluate-playbook-triggers] Cooldown active for playbook ${playbook.id} (${cooldownMinutes}min)`);
      return new Response(JSON.stringify({
        triggered: false,
        reason: 'Cooldown active - recent execution exists',
        cooldown_minutes: cooldownMinutes,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Avaliar condições do trigger
    const conditions = playbook.trigger_conditions || {};
    const conditionsMet = evaluateConditions(trigger_type, conditions, context);

    if (!conditionsMet) {
      console.log(`[evaluate-playbook-triggers] Conditions not met for playbook ${playbook.id}`);
      return new Response(JSON.stringify({
        triggered: false,
        reason: 'Trigger conditions not met',
        conditions,
        context,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ✅ FASE 2: Motor de Risco - Calcular risk score via RPC
    const { data: riskData, error: riskError } = await supabase.rpc('should_auto_execute_playbook', {
      p_playbook_id: playbook.id,
      p_event_type: trigger_type,
      p_context: context
    });

    const riskAnalysis: RiskAnalysis = riskError ? {
      risk_score: 0.5,
      threshold: 0.8,
      should_auto_execute: false,
      has_destructive_actions: false,
      require_approval: playbook.require_approval,
      is_enabled: playbook.is_enabled,
      decision_reason: 'risk_calculation_failed'
    } : riskData as RiskAnalysis;

    console.log(`[evaluate-playbook-triggers] Risk analysis: score=${riskAnalysis.risk_score}, auto_execute=${riskAnalysis.should_auto_execute}, reason=${riskAnalysis.decision_reason}`);

    // Buscar informações do agente se fornecido
    let agentInfo = null;
    if (agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('agent_name, hostname, os_type, status, last_heartbeat')
        .eq('id', agent_id)
        .single();
      agentInfo = agent;
    }

    // ✅ ENTERPRISE: Criar snapshot imutável do playbook
    const playbookSnapshot = {
      id: playbook.id,
      name: playbook.name,
      description: playbook.description,
      severity: playbook.severity,
      trigger_type: playbook.trigger_type,
      trigger_conditions: playbook.trigger_conditions,
      version: playbook.version,
      require_approval: playbook.require_approval,
      cooldown_minutes: cooldownMinutes,
      snapshot_created_at: new Date().toISOString(),
    };

    // ✅ ENTERPRISE: Criar snapshot imutável das ações
    const actionsSnapshot = (playbook.actions as PlaybookAction[] || [])
      .sort((a, b) => a.order_index - b.order_index)
      .map((action) => ({
        id: action.id,
        order_index: action.order_index,
        action_type: action.action_type,
        label: action.label,
        description: action.description,
        action_payload: action.action_payload,
        risk_level: action.risk_level,
      }));

    // Determinar status inicial e se deve auto-executar
    const shouldAutoExecute = riskAnalysis.should_auto_execute;
    const triggeredBy = shouldAutoExecute ? 'risk_engine' : 'trigger';

    // Criar execução pendente COM SNAPSHOTS e dados de risco
    const { data: execution, error: execError } = await supabase
      .from('playbook_executions')
      .insert({
        playbook_id: playbook.id,
        tenant_id,
        agent_id: agent_id || null,
        trigger_source: trigger_type,
        trigger_context: {
          ...context,
          agent_info: agentInfo,
          evaluated_at: new Date().toISOString(),
          risk_analysis: riskAnalysis, // ✅ Incluir análise de risco no contexto
        },
        // ✅ IMUTÁVEL: Snapshots congelados no momento do trigger
        playbook_snapshot: playbookSnapshot,
        actions_snapshot: actionsSnapshot,
        status: shouldAutoExecute ? 'in_progress' : 'pending',
        // ✅ FASE 2: Novos campos de rastreio
        auto_executed: shouldAutoExecute,
        risk_score: riskAnalysis.risk_score,
        triggered_by: triggeredBy,
      })
      .select('id')
      .single();

    if (execError) {
      console.error('[evaluate-playbook-triggers] Error creating execution:', execError);
      throw execError;
    }

    console.log(`[evaluate-playbook-triggers] Created execution ${execution.id} with immutable snapshots (v${playbook.version}), auto_executed=${shouldAutoExecute}, risk_score=${riskAnalysis.risk_score}`);

    // Se deve auto-executar (baseado no motor de risco), executar automaticamente
    if (shouldAutoExecute) {
      console.log(`[evaluate-playbook-triggers] Risk-based auto-execution: ${playbook.name} (score: ${riskAnalysis.risk_score}, threshold: ${riskAnalysis.threshold})`);
      
      try {
        const executeUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/execute-playbook-action`;
        await fetch(executeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ execution_id: execution.id }),
        });
      } catch (autoExecError) {
        console.error('[evaluate-playbook-triggers] Auto-execute error:', autoExecError);
      }
    }

    // Log de segurança com informações de risco
    await supabase.from('security_logs').insert({
      tenant_id,
      ip_address: 'system',
      endpoint: 'playbook/trigger',
      attack_type: 'playbook_triggered',
      severity: playbook.severity === 'critical' ? 'critical' : 'medium',
      blocked: false,
      details: {
        playbook_id: playbook.id,
        playbook_name: playbook.name,
        playbook_version: playbook.version,
        execution_id: execution.id,
        trigger_type,
        agent_id,
        require_approval: playbook.require_approval,
        snapshots_created: true,
        // ✅ FASE 2: Adicionar dados de risco ao log
        risk_analysis: {
          risk_score: riskAnalysis.risk_score,
          threshold: riskAnalysis.threshold,
          decision_reason: riskAnalysis.decision_reason,
          has_destructive_actions: riskAnalysis.has_destructive_actions,
        },
        auto_executed: shouldAutoExecute,
        triggered_by: triggeredBy,
      },
    });

    return new Response(JSON.stringify({
      triggered: true,
      execution_id: execution.id,
      playbook: {
        id: playbook.id,
        name: playbook.name,
        version: playbook.version,
        severity: playbook.severity,
        require_approval: playbook.require_approval,
        actions_count: actionsSnapshot.length,
      },
      agent_info: agentInfo,
      snapshots_created: true,
      // ✅ FASE 2: Incluir dados de risco na resposta
      risk_analysis: riskAnalysis,
      auto_executed: shouldAutoExecute,
      triggered_by: triggeredBy,
      execution_time_ms: Date.now() - startTime,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[evaluate-playbook-triggers] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function evaluateConditions(
  triggerType: string,
  conditions: Record<string, unknown>,
  context: Record<string, unknown>
): boolean {
  switch (triggerType) {
    case 'agent_offline': {
      const hoursThreshold = (conditions.hours_threshold as number) || 24;
      const hoursOffline = (context.hours_offline as number) || 0;
      return hoursOffline >= hoursThreshold;
    }

    case 'dns_blocked': {
      const minBlocked = (conditions.min_blocked_requests as number) || 10;
      const blockedCount = (context.blocked_requests as number) || 0;
      return blockedCount >= minBlocked;
    }

    case 'job_failed': {
      const minFailures = (conditions.min_failures as number) || 3;
      const failureCount = (context.failure_count as number) || 0;
      const criticalTypes = (conditions.critical_job_types as string[]) || [];
      const jobType = context.job_type as string;
      
      if (criticalTypes.length > 0 && jobType) {
        return failureCount >= minFailures && criticalTypes.includes(jobType);
      }
      return failureCount >= minFailures;
    }

    case 'integrity_low': {
      const threshold = (conditions.integrity_threshold as number) || 80;
      const currentScore = (context.integrity_score as number) || 100;
      return currentScore < threshold;
    }

    case 'manual':
      return true; // Manual triggers always pass

    default:
      return true; // Unknown triggers pass by default
  }
}
