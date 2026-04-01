/**
 * analyze-network-anomalies — Migrated to serveInternal middleware.
 * Cron/internal endpoint for AI-powered network anomaly analysis.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serveInternal } from '../_shared/serve-tenant.ts';
import { sanitizeForAI, sanitizeObjectForAI, anonymizeAgentName } from "../_shared/ai-sanitizer.ts";
import { callAISimple } from "../_shared/ai-provider-helper.ts";
import { AIEvidence, buildEvidence, calculateConfidence, generateReasoningSummary, extractDataSources } from "../_shared/ai-evidence-types.ts";
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const AnalysisRequestSchema = z.object({
  agentName: z.string().max(255).optional(),
  timeRangeHours: z.number().int().min(1).max(168).optional().default(24),
}).optional().default({});

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const parsed = AnalysisRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { agentName, timeRangeHours } = parsed.data ?? { timeRangeHours: 24 };
  const startTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();

  let agentsQuery = supabase
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
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let jobsQuery = supabase
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
      { status: 500, headers: { 'Content-Type': 'application/json' } }
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

  const aiResult = await callAISimple(
    'Voce e um especialista em seguranca de rede e deteccao de anomalias.',
    aiPrompt,
    { maxTokens: 2000, functionName: 'analyze-network-anomalies' }
  );

  if (!aiResult.success) {
    logger.error('[analyze-network-anomalies] AI call failed:', aiResult.error);
    return {
      error: 'Erro ao analisar dados com IA - servico temporariamente indisponivel',
      rawData: analysisContext,
      fallback: true,
      provider: aiResult.provider,
    };
  }

  const analysis = aiResult.content;
  logger.info(`[analyze-network-anomalies] Analysis completed via ${aiResult.provider} in ${aiResult.latencyMs}ms`);

  const evidenceArray: AIEvidence[] = [];
  
  if (agents && agents.length > 0) {
    evidenceArray.push(buildEvidence('Total de Agentes Analisados', 'agents', agents.length, undefined, 'info'));
    const offlineAgents = agents.length - agents.filter(a => a.status === 'online').length;
    if (offlineAgents > 0) {
      evidenceArray.push(buildEvidence('Agentes Offline', 'agents', offlineAgents, undefined, offlineAgents > agents.length * 0.3 ? 'critical' : 'warning'));
    }
  }
  
  if (jobs && jobs.length > 0) {
    const failedJobs = jobs.filter(j => j.status === 'failed').length;
    if (failedJobs > 0) {
      evidenceArray.push(buildEvidence('Jobs com Falha', 'jobs', failedJobs, undefined, failedJobs > 10 ? 'critical' : 'warning'));
    }
    evidenceArray.push(buildEvidence('Total de Jobs Analisados', 'jobs', jobs.length, undefined, 'info'));
  }

  return {
    success: true,
    analysis,
    rawData: analysisContext,
    timestamp: new Date().toISOString(),
    evidence: evidenceArray,
    data_sources: extractDataSources(evidenceArray),
    reasoning_summary: generateReasoningSummary(evidenceArray, `analise de rede das ultimas ${timeRangeHours} horas`, 'Analise de comportamento de rede e deteccao de anomalias realizada pela IA.'),
    confidence: calculateConfidence(evidenceArray, true),
  };
});
