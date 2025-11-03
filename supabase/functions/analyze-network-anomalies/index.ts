import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

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

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
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

    // Coletar dados dos jobs
    let jobsQuery = supabaseAdmin
      .from('jobs')
      .select('agent_name, type, status, created_at, completed_at')
      .gte('created_at', startTime);

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

    // Preparar contexto para análise da IA
    const analysisContext = {
      timeRange: `${timeRangeHours} horas`,
      totalAgents: agents?.length || 0,
      totalJobs: jobs?.length || 0,
      agents: agents,
      jobs: jobs,
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

    // Chamar Lovable AI para análise
    const aiPrompt = `Você é um especialista em segurança de rede e análise de comportamento de sistemas.

Analise os seguintes dados de uma rede de segurança de endpoints (CyberShield) e identifique possíveis anomalias, problemas ou padrões suspeitos:

${JSON.stringify(analysisContext, null, 2)}

Forneça uma análise detalhada incluindo:
1. **Resumo Executivo**: Visão geral do estado da rede
2. **Anomalias Detectadas**: Liste qualquer comportamento anormal ou suspeito
3. **Padrões Identificados**: Tendências nos dados
4. **Alertas Críticos**: Problemas que requerem atenção imediata
5. **Recomendações**: Ações sugeridas para melhorar a segurança

Seja específico e técnico, focando em segurança cibernética.`;

    if (!LOVABLE_API_KEY) {
      console.warn('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ 
          error: 'IA não configurada',
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
            content: 'Você é um especialista em segurança de rede e detecção de anomalias.'
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
