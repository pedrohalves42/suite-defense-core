import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { sanitizeForAI, sanitizeObjectForAI, anonymizeAgentName } from "../_shared/ai-sanitizer.ts";
import { withCircuitBreaker, executeWithTimeout } from "../_shared/ai-circuit-breaker.ts";
import { createMetricsLogger, extractTokenUsage, AIInferenceMetrics } from "../_shared/ai-metrics.ts";
import { persistAIMetrics } from "../_shared/ai-metrics-persistence.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const AI_MODEL = 'openai/gpt-5-mini';
const AI_TIMEOUT_MS = 15000; // 15 seconds for network analysis
const metricsLogger = createMetricsLogger('analyze-network-anomalies', AI_MODEL);

interface AnalysisRequest {
  agentName?: string;
  timeRangeHours?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Nao autenticado' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
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
      console.error('Error fetching agents:', agentsError);
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
      console.error('Error fetching jobs:', jobsError);
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
      console.warn('[analyze-network-anomalies] Sanitization warnings:', warnings);
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
      console.warn('[analyze-network-anomalies] Prompt injection blocked:', promptSanitizeResult.blockedPatterns);
    }
    const aiPrompt = promptSanitizeResult.sanitized;

    if (!LOVABLE_API_KEY) {
      console.warn('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ 
          error: 'IA nao configurada',
          rawData: analysisContext 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Start metrics tracking
    const metricsStartTime = metricsLogger.logStart();

    // Use circuit breaker with timeout
    const aiResult = await withCircuitBreaker(
      async () => {
        return executeWithTimeout(async () => {
          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: AI_MODEL,
              messages: [
                {
                  role: 'system',
                  content: 'Voce e um especialista em seguranca de rede e deteccao de anomalias.'
                },
                {
                  role: 'user',
                  content: aiPrompt
                }
              ],
              max_completion_tokens: 2000,
            }),
          });

          if (!response.ok) {
            throw new Error(`AI API error: ${response.status}`);
          }

          return response.json();
        }, AI_TIMEOUT_MS);
      },
      { 
        timeoutMs: AI_TIMEOUT_MS,
        fallbackResponse: null 
      }
    );

    // Handle circuit breaker result
    if (!aiResult.success || !aiResult.data) {
      metricsLogger.logFailure(metricsStartTime, aiResult.error || 'Unknown error', undefined, aiResult.usedFallback);
      console.error('[analyze-network-anomalies] AI call failed:', aiResult.error);
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao analisar dados com IA - servico temporariamente indisponivel',
          rawData: analysisContext,
          fallback: true
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const aiData = aiResult.data;
    const analysis = aiData.choices?.[0]?.message?.content;
    const tokenUsage = extractTokenUsage(aiData);

    // Log success metrics and persist to database
    metricsLogger.logSuccess(metricsStartTime, undefined, tokenUsage);
    
    // Persist metrics to DB for dashboard
    const successMetrics: AIInferenceMetrics = {
      timestamp: new Date().toISOString(),
      function_name: 'analyze-network-anomalies',
      model: AI_MODEL,
      latency_ms: Date.now() - metricsStartTime,
      success: true,
      tokens_prompt: tokenUsage.prompt,
      tokens_completion: tokenUsage.completion,
      tokens_total: tokenUsage.total,
    };
    await persistAIMetrics(successMetrics);

    console.log('[analyze-network-anomalies] Analysis completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        analysis: analysis,
        rawData: analysisContext,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in analyze-network-anomalies:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
