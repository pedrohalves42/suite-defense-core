/**
 * Watchdog Non-Execution Detection
 * 
 * Detecta agentes que estao "online" (heartbeat OK) mas nao estao
 * pegando ou executando jobs. Cria alertas para investigacao.
 * 
 * Regras de deteccao:
 * - not_polling_jobs: Heartbeat OK, mas +3 jobs queued ha +1h
 * - not_executing_jobs: Jobs delivered, mas sem finish ha +30min
 * - execution_stale: Ultima execucao ha +4h com jobs pendentes
 * 
 * Executa: A cada 15 minutos (cron)
 * 
 * IMPORTANTE: Esta funcao APENAS alerta. NAO toma acoes destrutivas.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { logger } from '../_shared/logger.ts';
import { shouldProcessAlertsForTenant } from '../_shared/business-hours.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

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
  const origin = req.headers.get("origin");
  const requestId = crypto.randomUUID();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  // V-1148: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  try {
    logger.info(`[${requestId}] Starting watchdog non-execution detection`);
    const startedAt = Date.now();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar agentes com problemas de execucao
    const { data: unhealthyAgents, error: queryError } = await supabase
      .from('v_agent_execution_health')
      .select('*')
      .neq('health_status', 'healthy')
      .neq('health_status', 'offline') // Offline ja e tratado por outro monitor
      .neq('health_status', 'never_connected'); // Nunca conectou nao e problema de execucao

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
          headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
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

    // Criar alertas para cada agente problematico
    const alertsCreated = [];
    const alertsSkipped = [];
    const skippedDueToBusinessHours = [];

    // Cache de verificacao de horario por tenant
    const tenantBusinessHoursCache: Record<string, { shouldProcess: boolean; reason: string }> = {};

    // V-8003 FIX: Batch dedup check ? fetch all recent alerts at once instead of N+1
    const agentIds = (unhealthyAgents as AgentExecutionHealth[]).map(a => a.agent_id).filter(Boolean);
    const { data: recentAlerts } = await supabase
      .from('system_alerts')
      .select('agent_id')
      .in('agent_id', agentIds)
      .eq('alert_type', 'non_execution_detected')
      .eq('resolved', false)
      .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    
    const agentsWithRecentAlerts = new Set((recentAlerts || []).map(a => a.agent_id));

    for (const agent of unhealthyAgents as AgentExecutionHealth[]) {
      // Business hours check (cached per tenant)
      if (!tenantBusinessHoursCache[agent.tenant_id]) {
        tenantBusinessHoursCache[agent.tenant_id] = await shouldProcessAlertsForTenant(supabase, agent.tenant_id);
      }
      
      const { shouldProcess, reason } = tenantBusinessHoursCache[agent.tenant_id];
      
      if (!shouldProcess) {
        skippedDueToBusinessHours.push(agent.agent_name);
        logger.debug(`[${requestId}] Skipping ${agent.agent_name} - ${reason}`);
        continue;
      }

      // V-8003 FIX: Use pre-fetched set instead of per-agent query
      if (agentsWithRecentAlerts.has(agent.agent_id)) {
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
        title: `Problema de execucao: ${agent.agent_name}`,
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

    if (skippedDueToBusinessHours.length > 0) {
      logger.info(`[${requestId}] Skipped ${skippedDueToBusinessHours.length} agents due to business hours`);
    }

    // V-8005 FIX: Log security events per-tenant (each tenant gets their own audit trail)
    const alertsByTenant = new Map<string, typeof alertsCreated>();
    for (const alert of alertsCreated) {
      const tid = (unhealthyAgents as AgentExecutionHealth[]).find(a => a.agent_name === alert.agent_name)?.tenant_id;
      if (tid) {
        if (!alertsByTenant.has(tid)) alertsByTenant.set(tid, []);
        alertsByTenant.get(tid)!.push(alert);
      }
    }

    if (alertsByTenant.size > 0) {
      const secLogs = [...alertsByTenant.entries()].map(([tid, alerts]) => ({
        tenant_id: tid,
        event_type: 'watchdog_non_execution',
        severity: 'info',
        details: {
          request_id: requestId,
          alerts_created: alerts.length,
          agents_alerted: alerts.map(a => a.agent_name),
        },
      }));
      await supabase.from('security_logs').insert(secLogs);
    }

    logger.info(`[${requestId}] Watchdog completed: ${alertsCreated.length} alerts created, ${alertsSkipped.length} skipped, ${skippedDueToBusinessHours.length} outside business hours`);

    const result = {
      success: true,
      problems_detected: unhealthyAgents.length,
      alerts_created: alertsCreated.length,
      alerts_skipped: alertsSkipped.length,
      skipped_outside_business_hours: skippedDueToBusinessHours.length,
      problems_by_type: problemsByType,
      agents: alertsCreated,
      timestamp: new Date().toISOString(),
    };

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'watchdog-non-execution',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: result,
      p_processed_count: unhealthyAgents.length,
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Fatal error: ${errorMessage}`);

    // Log error observability
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'watchdog-non-execution',
        p_success: false,
        p_duration_ms: 0,
        p_error: errorMessage,
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (e) { logger.warn('[watchdog-non-execution] Failed to log job run:', e); }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        requestId,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
