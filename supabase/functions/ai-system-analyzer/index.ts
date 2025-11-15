import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface AnalysisData {
  problematicJobs: any[];
  failurePatterns: any[];
  agentMetrics: any[];
  installationStats: any[];
  systemAlerts: any[];
}

interface AIInsight {
  tenant_id: string;
  insight_type: 'anomaly_detection' | 'optimization' | 'prediction' | 'root_cause';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  evidence: any;
  recommendation: string;
  confidence_score: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log('[ai-system-analyzer] Starting analysis cycle...');

    // Buscar todos os tenants ativos
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name');

    if (tenantsError) {
      console.error('[ai-system-analyzer] Error fetching tenants:', tenantsError);
      throw tenantsError;
    }

    if (!tenants || tenants.length === 0) {
      console.log('[ai-system-analyzer] No tenants found, skipping analysis');
      return new Response(JSON.stringify({ message: 'No tenants to analyze' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`[ai-system-analyzer] Analyzing ${tenants.length} tenant(s)`);

    const insights: AIInsight[] = [];

    for (const tenant of tenants) {
      try {
        console.log(`[ai-system-analyzer] Analyzing tenant: ${tenant.name} (${tenant.id})`);

        // Coletar dados dos últimos 7 dias para análise
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);

        // 1. Jobs problemáticos
        const { data: problematicJobs } = await supabase
          .from('v_problematic_jobs')
          .select('*')
          .eq('tenant_id', tenant.id)
          .gte('created_at', cutoffDate.toISOString())
          .limit(100);

        // 2. Métricas de instalação
        const { data: installationStats } = await supabase
          .from('installation_analytics')
          .select('*')
          .eq('tenant_id', tenant.id)
          .gte('created_at', cutoffDate.toISOString())
          .order('created_at', { ascending: false })
          .limit(500);

        // 3. Métricas de agentes
        const { data: agentMetrics } = await supabase
          .from('agent_system_metrics')
          .select('*')
          .eq('tenant_id', tenant.id)
          .gte('collected_at', cutoffDate.toISOString())
          .order('collected_at', { ascending: false })
          .limit(500);

        // 4. Alertas do sistema
        const { data: systemAlerts } = await supabase
          .from('system_alerts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .gte('created_at', cutoffDate.toISOString())
          .order('created_at', { ascending: false })
          .limit(100);

        // 5. Estatísticas de jobs
        const { data: jobStats } = await supabase
          .from('jobs')
          .select('status, type, created_at')
          .eq('tenant_id', tenant.id)
          .gte('created_at', cutoffDate.toISOString());

        const analysisData: AnalysisData = {
          problematicJobs: problematicJobs || [],
          failurePatterns: installationStats?.filter(s => s.success === false) || [],
          agentMetrics: agentMetrics || [],
          installationStats: installationStats || [],
          systemAlerts: systemAlerts || [],
        };

        // Se não há dados suficientes, pular este tenant
        const totalDataPoints = 
          analysisData.problematicJobs.length +
          analysisData.failurePatterns.length +
          analysisData.agentMetrics.length +
          analysisData.systemAlerts.length;

        if (totalDataPoints < 5) {
          console.log(`[ai-system-analyzer] Insufficient data for tenant ${tenant.name}, skipping`);
          continue;
        }

        // Chamar IA para análise
        const tenantInsights = await analyzeWithAI(tenant.id, tenant.name, analysisData, jobStats || []);
        insights.push(...tenantInsights);

      } catch (tenantError) {
        console.error(`[ai-system-analyzer] Error analyzing tenant ${tenant.name}:`, tenantError);
        // Continuar com próximo tenant em caso de erro
        continue;
      }
    }

    // Salvar insights no banco
    if (insights.length > 0) {
      const { error: insertError } = await supabase
        .from('ai_insights')
        .insert(insights);

      if (insertError) {
        console.error('[ai-system-analyzer] Error saving insights:', insertError);
        throw insertError;
      }

      console.log(`[ai-system-analyzer] Successfully saved ${insights.length} insights`);
    } else {
      console.log('[ai-system-analyzer] No insights generated');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        insightsGenerated: insights.length,
        tenantsAnalyzed: tenants.length 
      }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[ai-system-analyzer] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function analyzeWithAI(
  tenantId: string, 
  tenantName: string, 
  data: AnalysisData,
  jobStats: any[]
): Promise<AIInsight[]> {
  if (!LOVABLE_API_KEY) {
    console.warn('[ai-system-analyzer] LOVABLE_API_KEY not configured, skipping AI analysis');
    return [];
  }

  try {
    // Calcular estatísticas resumidas
    const failureRate = data.installationStats.length > 0
      ? (data.failurePatterns.length / data.installationStats.length) * 100
      : 0;

    const avgCpuUsage = data.agentMetrics.length > 0
      ? data.agentMetrics.reduce((sum, m) => sum + (m.cpu_usage_percent || 0), 0) / data.agentMetrics.length
      : 0;

    const avgMemoryUsage = data.agentMetrics.length > 0
      ? data.agentMetrics.reduce((sum, m) => sum + (m.memory_usage_percent || 0), 0) / data.agentMetrics.length
      : 0;

    const jobStatusCounts = jobStats.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const prompt = `Você é um especialista em análise de sistemas de monitoramento de agentes. Analise os dados abaixo e identifique problemas, anomalias, e oportunidades de otimização.

**Dados do Tenant: ${tenantName}**

**Métricas de Instalação (últimos 7 dias):**
- Total de tentativas: ${data.installationStats.length}
- Falhas: ${data.failurePatterns.length}
- Taxa de falha: ${failureRate.toFixed(1)}%

**Jobs Problemáticos:**
- Total de jobs problemáticos: ${data.problematicJobs.length}
- Status dos jobs: ${JSON.stringify(jobStatusCounts)}

**Métricas de Performance dos Agentes:**
- Amostras coletadas: ${data.agentMetrics.length}
- CPU média: ${avgCpuUsage.toFixed(1)}%
- Memória média: ${avgMemoryUsage.toFixed(1)}%

**Alertas do Sistema:**
- Total de alertas: ${data.systemAlerts.length}
- Alertas críticos: ${data.systemAlerts.filter(a => a.severity === 'critical').length}

**Sua tarefa:**
1. Identifique até 3 insights mais relevantes
2. Para cada insight, retorne um objeto JSON com:
   - insight_type: 'anomaly_detection', 'optimization', 'prediction', ou 'root_cause'
   - severity: 'info', 'warning', ou 'critical'
   - title: título curto e descritivo
   - description: descrição detalhada do problema (2-3 frases)
   - recommendation: recomendação clara de ação
   - confidence_score: valor entre 0.0 e 1.0

Responda APENAS com um array JSON válido de insights. Exemplo:
[
  {
    "insight_type": "anomaly_detection",
    "severity": "warning",
    "title": "Taxa de falha acima do normal",
    "description": "A taxa de falha de instalação está 40% acima da baseline dos últimos 30 dias. Concentração de erros no horário noturno.",
    "recommendation": "Investigar conectividade de rede durante o período noturno e considerar aumentar timeout de instalação.",
    "confidence_score": 0.85
  }
]`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'Você é um especialista em análise de sistemas. Responda APENAS com JSON válido, sem texto adicional.' 
          },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 429) {
        console.error('[ai-system-analyzer] Rate limit exceeded, will retry next cycle');
        return [];
      }
      
      if (response.status === 402) {
        console.error('[ai-system-analyzer] Payment required - Lovable AI credits exhausted');
        return [];
      }
      
      console.error('[ai-system-analyzer] AI API error:', response.status, errorText);
      return [];
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      console.error('[ai-system-analyzer] No content in AI response');
      return [];
    }

    // Extrair JSON da resposta (pode vir com ```json ou sem)
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```\n?/g, '');
    }

    const parsedInsights = JSON.parse(jsonContent);

    if (!Array.isArray(parsedInsights)) {
      console.error('[ai-system-analyzer] AI response is not an array');
      return [];
    }

    // Mapear para formato do banco de dados
    return parsedInsights.map((insight: any) => ({
      tenant_id: tenantId,
      insight_type: insight.insight_type,
      severity: insight.severity,
      title: insight.title,
      description: insight.description,
      evidence: {
        failureRate,
        avgCpuUsage,
        avgMemoryUsage,
        problematicJobsCount: data.problematicJobs.length,
        systemAlertsCount: data.systemAlerts.length,
        analysisDate: new Date().toISOString(),
      },
      recommendation: insight.recommendation,
      confidence_score: insight.confidence_score,
    }));

  } catch (error) {
    console.error('[ai-system-analyzer] Error in AI analysis:', error);
    return [];
  }
}
