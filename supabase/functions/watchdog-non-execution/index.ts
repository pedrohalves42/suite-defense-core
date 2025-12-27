/**
 * Watchdog Non-Execution Detection
 * 
 * Detecta agentes que estão "online" (heartbeat OK) mas não estão
 * pegando ou executando jobs. Cria alertas para investigação.
 * 
 * Regras de detecção:
 * - not_polling_jobs: Heartbeat OK, mas +3 jobs queued há +1h
 * - not_executing_jobs: Jobs delivered, mas sem finish há +30min
 * - execution_stale: Última execução há +4h com jobs pendentes
 * 
 * Executa: A cada 15 minutos (cron)
 * 
 * IMPORTANTE: Esta função APENAS alerta. NÃO toma ações destrutivas.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgentExecutionHealth {
  agent_id: string;
  agent_name: string;
  tenant_id: string;
  status: string;
  last_heartbeat: string | null;
  agent_mode: string | null;
  minutes_since_heartbeat: number | null;
  last_execution_at: string | null;
  minutes_since_execution: number | null;
  stale_queued_jobs: number;
  stale_delivered_jobs: number;
  pending_jobs: number;
  health_status: string;
  severity: string;
  health_description: string;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logger.info(`[${requestId}] Starting watchdog non-execution detection`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar agentes com problemas de execução
    const { data: unhealthyAgents, error: queryError } = await supabase
      .from('v_agent_execution_health')
      .select('*')
      .neq('health_status', 'healthy')
      .neq('health_status', 'offline') // Offline já é tratado por outro monitor
      .neq('health_status', 'never_connected'); // Nunca conectou não é problema de execução

    if (queryError) {
      logger.error(`[${requestId}] Query error: ${queryError.message}`);
      throw queryError;
    }

    if (!unhealthyAgents || unhealthyAgents.length === 0) {
      logger.info(`[${requestId}] No execution problems detected`);
      return new Response(
        JSON.stringify({
          success: true,
          problems_detected: 0,
          message: 'All agents executing normally',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    logger.warn(`[${requestId}] Found ${unhealthyAgents.length} agent(s) with execution problems`);

    // Agrupar por tipo de problema para logging
    const problemsByType = unhealthyAgents.reduce((acc, agent) => {
      const status = agent.health_status as string;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    logger.info(`[${requestId}] Problems by type: ${JSON.stringify(problemsByType)}`);

    // Criar alertas para cada agente problemático
    const alertsCreated = [];
    const alertsSkipped = [];

    for (const agent of unhealthyAgents as AgentExecutionHealth[]) {
      // Verificar se já existe alerta recente (últimas 2 horas) para evitar spam
      const { data: existingAlert } = await supabase
        .from('system_alerts')
        .select('id')
        .eq('agent_id', agent.agent_id)
        .eq('alert_type', 'non_execution_detected')
        .eq('resolved', false)
        .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .maybeSingle();

      if (existingAlert) {
        alertsSkipped.push(agent.agent_name);
        logger.debug(`[${requestId}] Skipping duplicate alert for ${agent.agent_name}`);
        continue;
      }

      // Criar alerta
      const alertData = {
        tenant_id: agent.tenant_id,
        agent_id: agent.agent_id,
        alert_type: 'non_execution_detected',
        severity: agent.severity as 'low' | 'medium' | 'high' | 'critical',
        title: `Problema de execução: ${agent.agent_name}`,
        message: agent.health_description,
        resolved: false,
        details: {
          health_status: agent.health_status,
          minutes_since_heartbeat: agent.minutes_since_heartbeat,
          minutes_since_execution: agent.minutes_since_execution,
          stale_queued_jobs: agent.stale_queued_jobs,
          stale_delivered_jobs: agent.stale_delivered_jobs,
          pending_jobs: agent.pending_jobs,
          agent_mode: agent.agent_mode,
          detected_at: new Date().toISOString(),
          watchdog_version: '1.0.0',
        },
      };

      const { error: alertError } = await supabase
        .from('system_alerts')
        .insert(alertData);

      if (alertError) {
        logger.error(`[${requestId}] Failed to create alert for ${agent.agent_name}: ${alertError.message}`);
      } else {
        alertsCreated.push({
          agent_name: agent.agent_name,
          health_status: agent.health_status,
          severity: agent.severity,
        });
        logger.info(`[${requestId}] Alert created for ${agent.agent_name}: ${agent.health_status}`);
      }
    }

    // Log de segurança para auditoria
    if (alertsCreated.length > 0) {
      await supabase.from('security_logs').insert({
        event_type: 'watchdog_non_execution',
        severity: 'info',
        details: {
          request_id: requestId,
          total_problems: unhealthyAgents.length,
          alerts_created: alertsCreated.length,
          alerts_skipped: alertsSkipped.length,
          problems_by_type: problemsByType,
          agents_alerted: alertsCreated.map(a => a.agent_name),
        },
      });
    }

    logger.info(`[${requestId}] Watchdog completed: ${alertsCreated.length} alerts created, ${alertsSkipped.length} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        problems_detected: unhealthyAgents.length,
        alerts_created: alertsCreated.length,
        alerts_skipped: alertsSkipped.length,
        problems_by_type: problemsByType,
        agents: alertsCreated,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Fatal error: ${errorMessage}`);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        requestId,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
