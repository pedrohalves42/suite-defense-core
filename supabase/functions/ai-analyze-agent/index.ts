import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sanitizeForAI, sanitizeObjectForAI, anonymizeAgentName, validateAIResponse } from "../_shared/ai-sanitizer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgentContext {
  metrics: {
    cpu_usage_percent: number | null;
    memory_usage_percent: number | null;
    disk_usage_percent: number | null;
    uptime_seconds: number | null;
  } | null;
  software: { name: string; version: string; publisher: string }[];
  vulnerabilities: { severity: string; title: string }[];
  recentJobs: { type: string; status: string; created_at: string }[];
}

interface Agent {
  id: string;
  agent_name: string;
  os_type: string;
  hostname: string;
}

interface AISuggestion {
  jobType: string;
  priority: 'low' | 'medium' | 'high';
  reason: string;
  confidence: number;
}

interface AIAnalysis {
  healthScore: number;
  suggestions: AISuggestion[];
  insights: string[];
  riskFactors: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agent, context }: { agent: Agent; context: AgentContext } = await req.json();

    if (!agent || !context) {
      return new Response(
        JSON.stringify({ error: 'Agent and context are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      // Return a basic analysis without AI
      return new Response(
        JSON.stringify(generateBasicAnalysis(context)),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build context summary for AI with sanitization
    const rawContextSummary = buildContextSummary(agent, context);
    const sanitizeResult = sanitizeForAI(rawContextSummary);
    
    if (sanitizeResult.blocked) {
      console.warn('[ai-analyze-agent] Prompt injection attempt blocked:', sanitizeResult.blockedPatterns);
    }
    
    const contextSummary = sanitizeResult.sanitized;

    const systemPrompt = `Voce e um especialista em seguranca de sistemas e monitoramento de agentes. 
Analise o contexto do agente e forneca:
1. Um score de saude (0-100)
2. Sugestoes de jobs de validacao especificos
3. Insights sobre o estado do sistema
4. Fatores de risco identificados

Jobs disponiveis:
- software_inventory_collect: Coleta lista de software instalado
- light_vuln_scan: Scan de vulnerabilidades leve
- collect_antivirus_status: Verifica status do antivirus
- collect_web_activity: Coleta atividade web recente
- collect_network_info: Coleta informacoes de rede
- update_agent: Atualiza o agente para ultima versao

Responda APENAS com JSON valido no formato:
{
  "healthScore": number,
  "suggestions": [{"jobType": string, "priority": "low"|"medium"|"high", "reason": string, "confidence": number}],
  "insights": [string],
  "riskFactors": [string]
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextSummary }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error('AI API error:', response.status, await response.text());
      return new Response(
        JSON.stringify(generateBasicAnalysis(context)),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify(generateBasicAnalysis(context)),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse AI response
    let analysis: AIAnalysis;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      analysis = generateBasicAnalysis(context);
    }

    // Validate and sanitize response
    analysis = {
      healthScore: Math.min(100, Math.max(0, analysis.healthScore || 50)),
      suggestions: (analysis.suggestions || []).slice(0, 5),
      insights: (analysis.insights || []).slice(0, 5),
      riskFactors: (analysis.riskFactors || []).slice(0, 5),
    };

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-analyze-agent:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildContextSummary(agent: Agent, context: AgentContext): string {
  const metrics = context.metrics;
  const vulnCount = context.vulnerabilities.length;
  const criticalVulns = context.vulnerabilities.filter(v => v.severity === 'critical' || v.severity === 'high').length;
  const failedJobs = context.recentJobs.filter(j => j.status === 'failed').length;
  const totalJobs = context.recentJobs.length;
  
  // Anonimizar dados sensíveis antes de enviar à IA
  const anonAgentName = anonymizeAgentName(agent.agent_name);
  const anonHostname = anonymizeAgentName(agent.hostname || 'unknown');
  
  return `
Agente: ${anonAgentName}
Sistema Operacional: ${agent.os_type}
Hostname: ${anonHostname}

METRICAS DE SISTEMA:
- CPU: ${metrics?.cpu_usage_percent ?? 'N/A'}%
- RAM: ${metrics?.memory_usage_percent ?? 'N/A'}%
- Disco: ${metrics?.disk_usage_percent ?? 'N/A'}%
- Uptime: ${metrics?.uptime_seconds ? Math.round(metrics.uptime_seconds / 3600) + 'h' : 'N/A'}

SOFTWARE:
- Total instalado: ${context.software.length} programas
- Softwares detectados: ${context.software.slice(0, 10).map(s => s.name).join(', ')}

VULNERABILIDADES:
- Total: ${vulnCount}
- Criticas/Altas: ${criticalVulns}

JOBS RECENTES (ultimos 20):
- Total: ${totalJobs}
- Falhados: ${failedJobs}
- Taxa de sucesso: ${totalJobs > 0 ? Math.round(((totalJobs - failedJobs) / totalJobs) * 100) : 100}%

Analise este agente e sugira validacoes especificas baseadas no contexto.
`;
}

function generateBasicAnalysis(context: AgentContext): AIAnalysis {
  const suggestions: AISuggestion[] = [];
  const insights: string[] = [];
  const riskFactors: string[] = [];
  let healthScore = 100;

  const metrics = context.metrics;

  // CPU analysis
  if (metrics?.cpu_usage_percent && metrics.cpu_usage_percent > 80) {
    healthScore -= 15;
    riskFactors.push('Uso de CPU elevado pode indicar processo malicioso ou sobrecarga');
    suggestions.push({
      jobType: 'light_vuln_scan',
      priority: 'high',
      reason: 'CPU alto - verificar processos suspeitos',
      confidence: 85,
    });
  }

  // Memory analysis
  if (metrics?.memory_usage_percent && metrics.memory_usage_percent > 85) {
    healthScore -= 10;
    riskFactors.push('Uso de memoria elevado');
    insights.push('Considere verificar processos consumindo muita memoria');
  }

  // Disk analysis
  if (metrics?.disk_usage_percent && metrics.disk_usage_percent > 90) {
    healthScore -= 15;
    riskFactors.push('Disco quase cheio - risco de falhas');
    insights.push('Espaco em disco critico, libere espaco urgentemente');
  }

  // Vulnerabilities
  const criticalVulns = context.vulnerabilities.filter(v => 
    v.severity === 'critical' || v.severity === 'high'
  ).length;
  
  if (criticalVulns > 0) {
    healthScore -= criticalVulns * 5;
    riskFactors.push(`${criticalVulns} vulnerabilidades criticas/altas detectadas`);
    suggestions.push({
      jobType: 'light_vuln_scan',
      priority: 'high',
      reason: `${criticalVulns} vulnerabilidades precisam de atencao`,
      confidence: 90,
    });
  }

  // Software inventory
  if (context.software.length === 0) {
    suggestions.push({
      jobType: 'software_inventory_collect',
      priority: 'medium',
      reason: 'Inventario de software nao coletado',
      confidence: 95,
    });
  }

  // Job failures
  const failedJobs = context.recentJobs.filter(j => j.status === 'failed').length;
  if (failedJobs > 3) {
    healthScore -= 10;
    riskFactors.push('Alta taxa de falha em jobs recentes');
  }

  // Default suggestions
  if (suggestions.length === 0) {
    suggestions.push({
      jobType: 'collect_antivirus_status',
      priority: 'low',
      reason: 'Verificacao de rotina do antivirus',
      confidence: 70,
    });
    suggestions.push({
      jobType: 'collect_network_info',
      priority: 'low',
      reason: 'Coletar informacoes de rede para diagnostico',
      confidence: 75,
    });
  }

  if (insights.length === 0) {
    insights.push('Sistema operando dentro dos parametros normais');
  }

  return {
    healthScore: Math.max(0, healthScore),
    suggestions,
    insights,
    riskFactors,
  };
}
