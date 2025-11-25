import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * FASE 4: Edge Function para push de updates automatico
 * 
 * Scheduled cron job que identifica agentes desatualizados e cria
 * jobs "update_agent" para forcar atualizacao em agentes criticos.
 * 
 * Execucao: A cada 6 horas via cron
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    logger.info('[process-agent-updates] Cron job started', { requestId });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar ultima versao de cada plataforma
    const { data: latestVersions, error: versionError } = await supabase
      .from('agent_versions')
      .select('platform, version')
      .eq('is_latest', true);

    if (versionError) {
      logger.error('[process-agent-updates] Failed to fetch latest versions', {
        requestId,
        error: versionError
      });
      throw versionError;
    }

    if (!latestVersions || latestVersions.length === 0) {
      logger.warn('[process-agent-updates] No latest versions found', { requestId });
      return new Response(
        JSON.stringify({ message: 'No latest versions registered' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalJobsCreated = 0;
    const results = [];

    for (const latest of latestVersions) {
      logger.info('[process-agent-updates] Processing platform', {
        requestId,
        platform: latest.platform,
        latestVersion: latest.version
      });

      // Buscar agentes desatualizados desta plataforma
      const { data: outdatedAgents, error: agentsError } = await supabase
        .from('agents')
        .select('id, agent_name, agent_version, tenant_id')
        .eq('status', 'active')
        .eq('os_type', latest.platform)
        .neq('agent_version', latest.version)
        .not('agent_version', 'is', null);

      if (agentsError) {
        logger.error('[process-agent-updates] Failed to fetch outdated agents', {
          requestId,
          platform: latest.platform,
          error: agentsError
        });
        continue;
      }

      if (!outdatedAgents || outdatedAgents.length === 0) {
        logger.info('[process-agent-updates] No outdated agents for platform', {
          requestId,
          platform: latest.platform
        });
        results.push({
          platform: latest.platform,
          outdated_count: 0,
          jobs_created: 0
        });
        continue;
      }

      logger.info('[process-agent-updates] Found outdated agents', {
        requestId,
        platform: latest.platform,
        count: outdatedAgents.length
      });

      // Criar job update_agent para cada agente desatualizado
      let jobsCreated = 0;
      for (const agent of outdatedAgents) {
        // Verificar se ja existe job update_agent pendente para este agente
        const { data: existingJobs } = await supabase
          .from('jobs')
          .select('id')
          .eq('agent_id', agent.id)
          .eq('type', 'update_agent')
          .in('status', ['pending', 'queued', 'delivered'])
          .limit(1);

        if (existingJobs && existingJobs.length > 0) {
          logger.info('[process-agent-updates] Update job already exists', {
            requestId,
            agentName: agent.agent_name
          });
          continue;
        }

        // Criar job update_agent
        const { error: jobError } = await supabase
          .from('jobs')
          .insert({
            agent_id: agent.id,
            agent_name: agent.agent_name,
            tenant_id: agent.tenant_id,
            type: 'update_agent',
            status: 'pending',
            approved: true,
            payload: {
              current_version: agent.agent_version,
              target_version: latest.version,
              platform: latest.platform,
              auto_triggered: true
            }
          });

        if (jobError) {
          logger.error('[process-agent-updates] Failed to create update job', {
            requestId,
            agentName: agent.agent_name,
            error: jobError
          });
          continue;
        }

        jobsCreated++;
        totalJobsCreated++;
        logger.info('[process-agent-updates] Update job created', {
          requestId,
          agentName: agent.agent_name,
          currentVersion: agent.agent_version,
          targetVersion: latest.version
        });
      }

      results.push({
        platform: latest.platform,
        outdated_count: outdatedAgents.length,
        jobs_created: jobsCreated
      });
    }

    logger.info('[process-agent-updates] Cron job completed', {
      requestId,
      totalJobsCreated,
      results
    });

    return new Response(
      JSON.stringify({
        success: true,
        total_jobs_created: totalJobsCreated,
        platforms: results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const err = error as Error;
    logger.error('[process-agent-updates] Internal error', {
      requestId,
      error: err.message,
      stack: err.stack
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: err.message,
        requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
