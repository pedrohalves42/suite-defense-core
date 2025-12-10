import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { sanitizeForAI, sanitizeObjectForAI, anonymizeAgentName } from "../_shared/ai-sanitizer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

interface AnalysisRequest {
  agentName?: string;
  timeRangeHours?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
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

    // Verificar autenticacao
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

    // Usar service role para consultar dados
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const startTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();

    // Coletar dados dos agentes
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

    // Coletar dados dos jobs (com limite para evitar DoS)
    let jobsQuery = supabaseAdmin
      .from('jobs')
      .select('agent_name, type, status, created_at, completed_at')
      .gte('created_at', startTime)
      .limit(1000); // P0 FIX: Protecao contra DoS com muitos jobs

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

    // Preparar contexto para analise da IA (com anonimização)
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
      jobs: anonymizedJobs.slice(0, 100), // Limitar para evitar prompts muito grandes
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

    // Sanitizar o contexto antes de enviar à IA
    const { sanitized: sanitizedContext, warnings } = sanitizeObjectForAI(analysisContext);
    if (warnings.length > 0) {
      console.warn('[analyze-network-anomalies] Sanitization warnings:', warnings);
    }

    // Chamar Lovable AI para analise
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

    // Sanitizar o prompt final
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

    const aiResponse = await fetch('https://api.lovable.app/v1/ai/completion', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
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

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao analisar dados com IA',
          rawData: analysisContext 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices[0].message.content;

    console.log('Network analysis completed successfully');

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
