import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { sanitizeForAI, sanitizeObjectForAI, anonymizeAgentName } from "../_shared/ai-sanitizer.ts";
import { callAISimple, type AICallResult } from "../_shared/ai-provider-helper.ts";
import { createMetricsLogger, extractTokenUsage, AIInferenceMetrics } from "../_shared/ai-metrics.ts";
import { persistAIMetrics } from "../_shared/ai-metrics-persistence.ts";
import { AIEvidence, buildEvidence, calculateConfidence, generateReasoningSummary, extractDataSources } from "../_shared/ai-evidence-types.ts";
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalysisRequest {
  agentName?: string;
  timeRangeHours?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1133: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  try {
    // Use SERVICE_ROLE_KEY for admin queries (required for cron execution without auth header)
    const authHeader = req.headers.get('Authorization');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      authHeader ? Deno.env.get('SUPABASE_ANON_KEY') ?? '' : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      authHeader ? {
        global: {
          headers: { Authorization: authHeader },
        },
      } : undefined
    );

    // Auth check: skip if called via cron (no auth header)
    if (authHeader) {
      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser();

      if (authError || !user) {
        logger.error('Authentication error:', authError);
        return new Response(
          JSON.stringify({ error: 'Nao autenticado' }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    } else {
      logger.info('[analyze-network-anomalies] Running in cron mode (no auth header)');
    }

    const { agentName, timeRangeHours = 24 }: AnalysisRequest = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const startTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();

    let agentsQuery = supabaseAdmin
      .from('agents')
      .select('agent_name, status, last_heartbeat, enrolled_at')
      .gte('last_heartbeat', startTime);

    if (agentName) {
      agentsQuery = agentsQuery.eq('agent_name', agentName);
    }

    const { data: agents, error: agentsError } = await agentsQuery;

    if (agentsError) {
      logger.error('Error fetching agents:', agentsError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar dados dos agentes' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let jobsQuery = supabaseAdmin
      .from('jobs')
      .select('agent_name, type, status, created_at, completed_at')
      .gte('created_at', startTime)
      .limit(1000);

    if (agentName) {
      jobsQuery = jobsQuery.eq('agent_name', agentName);
    }

    const { data: jobs, error: jobsError } = await jobsQuery;

    if (jobsError) {
      logger.error('Error fetching jobs:', jobsError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar dados dos jobs' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const anonymizedAgents = agents?.map(a => ({
      agent_id: anonymizeAgentName(a.agent_name),
      status: a.status,
      last_heartbeat: a.last_heartbeat,
      enrolled_at: a.enrolled_at,
    })) || [];
    
    const anonymizedJobs = jobs?.map(j => ({
      agent_id: anonymizeAgentName(j.agent_name),
      type: j.type,
      status: j.status,
      created_at: j.created_at,
      completed_at: j.completed_at,
    })) || [];

    const analysisContext = {
      timeRange: `${timeRangeHours} horas`,
      totalAgents: agents?.length || 0,
      totalJobs: jobs?.length || 0,
      agents: anonymizedAgents,
      jobs: anonymizedJobs.slice(0, 100),
      statistics: {
        jobsByStatus: jobs?.reduce((acc: Record<string, number>, job) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        }, {}),
        jobsByType: jobs?.reduce((acc: Record<string, number>, job) => {
          acc[job.type] = (acc[job.type] || 0) + 1;
          return acc;
        }, {}),
        agentsByStatus: agents?.reduce((acc: Record<string, number>, agent) => {
          acc[agent.status] = (acc[agent.status] || 0) + 1;
          return acc;
        }, {}),
      }
    };

    const { sanitized: sanitizedContext, warnings } = sanitizeObjectForAI(analysisContext);
    if (warnings.length > 0) {
      logger.warn('[analyze-network-anomalies] Sanitization warnings:', warnings);
    }

    const rawPrompt = `Voce e um especialista em seguranca de rede e analise de comportamento de sistemas.

Analise os seguintes dados de uma rede de seguranca de endpoints e identifique possiveis anomalias, problemas ou padroes suspeitos:

${JSON.stringify(sanitizedContext, null, 2)}

Forneca uma analise detalhada incluindo:
1. **Resumo Executivo**: Visao geral do estado da rede
2. **Anomalias Detectadas**: Liste qualquer comportamento anormal ou suspeito
3. **Padroes Identificados**: Tendencias nos dados
4. **Alertas Criticos**: Problemas que requerem atencao imediata
5. **Recomendacoes**: Acoes sugeridas para melhorar a seguranca

Seja especifico e tecnico, focando em seguranca cibernetica.`;

    const promptSanitizeResult = sanitizeForAI(rawPrompt);
    if (promptSanitizeResult.blocked) {
      logger.warn('[analyze-network-anomalies] Prompt injection blocked:', promptSanitizeResult.blockedPatterns);
    }
    const aiPrompt = promptSanitizeResult.sanitized;

    // Call AI using multi-provider system
    const aiResult = await callAISimple(
      'Voce e um especialista em seguranca de rede e deteccao de anomalias.',
      aiPrompt,
      {
        maxTokens: 2000,
        functionName: 'analyze-network-anomalies',
      }
    );

    // Handle AI call failure
    if (!aiResult.success) {
      logger.error('[analyze-network-anomalies] AI call failed:', aiResult.error);
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao analisar dados com IA - servico temporariamente indisponivel',
          rawData: analysisContext,
          fallback: true,
          provider: aiResult.provider,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const analysis = aiResult.content;
    logger.info(`[analyze-network-anomalies] Analysis completed via ${aiResult.provider} in ${aiResult.latencyMs}ms`);

    logger.info('[analyze-network-anomalies] Analysis completed successfully');

    // Build evidence array from analysis context
    const evidenceArray: AIEvidence[] = [];
    
    // Add agents evidence
    if (agents && agents.length > 0) {
      evidenceArray.push(buildEvidence(
        'Total de Agentes Analisados',
        'agents',
        agents.length,
        undefined,
        'info'
      ));
      
      const onlineAgents = agents.filter(a => a.status === 'online').length;
      const offlineAgents = agents.length - onlineAgents;
      
      if (offlineAgents > 0) {
        evidenceArray.push(buildEvidence(
          'Agentes Offline',
          'agents',
          offlineAgents,
          undefined,
          offlineAgents > agents.length * 0.3 ? 'critical' : 'warning'
        ));
      }
    }
    
    // Add jobs evidence
    if (jobs && jobs.length > 0) {
      const failedJobs = jobs.filter(j => j.status === 'failed').length;
      if (failedJobs > 0) {
        evidenceArray.push(buildEvidence(
          'Jobs com Falha',
          'jobs',
          failedJobs,
          undefined,
          failedJobs > 10 ? 'critical' : 'warning'
        ));
      }
      
      evidenceArray.push(buildEvidence(
        'Total de Jobs Analisados',
        'jobs',
        jobs.length,
        undefined,
        'info'
      ));
    }

    const data_sources = extractDataSources(evidenceArray);
    const confidence = calculateConfidence(evidenceArray, true);
    const reasoning_summary = generateReasoningSummary(
      evidenceArray,
      `análise de rede das últimas ${timeRangeHours} horas`,
      'Análise de comportamento de rede e detecção de anomalias realizada pela IA.'
    );

    return new Response(
      JSON.stringify({
        success: true,
        analysis: analysis,
        rawData: analysisContext,
        timestamp: new Date().toISOString(),
        // Evidence Pack - TOP 5% Global
        evidence: evidenceArray,
        data_sources,
        reasoning_summary,
        confidence,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in analyze-network-anomalies:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
