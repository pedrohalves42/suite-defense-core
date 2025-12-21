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

    // Verificar cooldown
    const { data: recentExecutions } = await supabase
      .from('playbook_executions')
      .select('id, triggered_at')
      .eq('playbook_id', playbook.id)
      .eq('tenant_id', tenant_id)
      .eq('agent_id', agent_id || null)
      .not('status', 'in', '("cancelled","ignored")')
      .gte('triggered_at', new Date(Date.now() - (playbook.cooldown_minutes || 60) * 60 * 1000).toISOString())
      .limit(1);

    if (recentExecutions && recentExecutions.length > 0) {
      console.log(`[evaluate-playbook-triggers] Cooldown active for playbook ${playbook.id}`);
      return new Response(JSON.stringify({
        triggered: false,
        reason: 'Cooldown active',
        cooldown_until: new Date(
          new Date(recentExecutions[0].triggered_at).getTime() + 
          (playbook.cooldown_minutes || 60) * 60 * 1000
        ).toISOString(),
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

    // Criar execução pendente
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
        },
        status: playbook.require_approval ? 'pending' : 'in_progress',
      })
      .select('id')
      .single();

    if (execError) {
      console.error('[evaluate-playbook-triggers] Error creating execution:', execError);
      throw execError;
    }

    console.log(`[evaluate-playbook-triggers] Created execution ${execution.id} for playbook ${playbook.name}`);

    // Se não requer aprovação, executar automaticamente
    if (!playbook.require_approval) {
      console.log(`[evaluate-playbook-triggers] Auto-executing playbook ${playbook.name}`);
      
      // Chamar execute-playbook-action via fetch interna
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

    // Log de segurança
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
        execution_id: execution.id,
        trigger_type,
        agent_id,
        require_approval: playbook.require_approval,
      },
    });

    return new Response(JSON.stringify({
      triggered: true,
      execution_id: execution.id,
      playbook: {
        id: playbook.id,
        name: playbook.name,
        severity: playbook.severity,
        require_approval: playbook.require_approval,
        actions_count: playbook.actions?.length || 0,
      },
      agent_info: agentInfo,
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
