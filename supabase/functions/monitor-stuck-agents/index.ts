/**
 * Monitor Stuck Agents
 * 
 * Monitora agentes em estado 'pending' sem heartbeat ha mais de 10 minutos
 * e cria alertas no sistema para investigacao.
 * 
 * Executa: A cada 10 minutos (cron)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StuckAgent {
  id: string;
  agent_name: string;
  status: string;
  enrolled_at: string;
  minutes_since_enrolled: number;
  tenant_id: string;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logger.info(`[${requestId}] Starting stuck agents monitoring`);
    const startedAt = Date.now();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar agentes stuck: pending + sem heartbeat + mais de 10 min
    const { data: stuckAgents, error: queryError } = await supabase
      .from('agents')
      .select('id, agent_name, status, enrolled_at, tenant_id, last_heartbeat')
      .eq('status', 'pending')
      .is('last_heartbeat', null)
      .lt('enrolled_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    if (queryError) {
      logger.error(`[${requestId}] Query error: ${queryError.message}`);
      throw queryError;
    }

    if (!stuckAgents || stuckAgents.length === 0) {
      logger.info(`[${requestId}] No stuck agents found ?`);
      return new Response(
        JSON.stringify({
          success: true,
          stuck_agents: 0,
          message: 'No stuck agents detected',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    logger.warn(`[${requestId}] Found ${stuckAgents.length} stuck agent(s)`);

    // Criar alertas no sistema para cada agente stuck
    const alerts = [];
    for (const agent of stuckAgents) {
      const minutesSinceEnrolled = Math.floor(
        (Date.now() - new Date(agent.enrolled_at).getTime()) / 1000 / 60
      );

      const alert = {
        tenant_id: agent.tenant_id,
        severity: minutesSinceEnrolled > 60 ? 'high' : 'medium',
        type: 'stuck_agent',
        message: `Agent '${agent.agent_name}' stuck in pending state for ${minutesSinceEnrolled} minutes without heartbeat`,
        metadata: {
          agent_id: agent.id,
          agent_name: agent.agent_name,
          enrolled_at: agent.enrolled_at,
          minutes_stuck: minutesSinceEnrolled,
          detected_at: new Date().toISOString(),
        },
      };

      alerts.push(alert);

      // Criar alerta no sistema
      const { error: alertError } = await supabase
        .from('system_alerts')
        .insert(alert);

      if (alertError) {
        logger.error(`[${requestId}] Failed to create alert for ${agent.agent_name}: ${alertError.message}`);
      } else {
        logger.info(`[${requestId}] Alert created for stuck agent: ${agent.agent_name}`);
      }
    }

    // Log de security para auditoria
    await supabase.from('security_logs').insert({
      event_type: 'stuck_agents_detected',
      severity: 'warning',
      details: {
        count: stuckAgents.length,
        agents: stuckAgents.map(a => ({
          id: a.id,
          name: a.agent_name,
          tenant_id: a.tenant_id,
        })),
      },
    });

    logger.info(`[${requestId}] Monitoring completed: ${stuckAgents.length} stuck agent(s) detected`);

    const result = {
      success: true,
      stuck_agents: stuckAgents.length,
      alerts_created: alerts.length,
      agents: stuckAgents.map(a => ({
        id: a.id,
        name: a.agent_name,
        minutes_stuck: Math.floor(
          (Date.now() - new Date(a.enrolled_at).getTime()) / 1000 / 60
        ),
      })),
      timestamp: new Date().toISOString(),
    };

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'monitor-stuck-agents',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: result,
      p_processed_count: stuckAgents.length,
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        p_job_key: 'monitor-stuck-agents',
        p_success: false,
        p_duration_ms: 0,
        p_error: errorMessage,
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (e) { console.warn('[monitor-stuck-agents] Failed to log job run:', e); }

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
