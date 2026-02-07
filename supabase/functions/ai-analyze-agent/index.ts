import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sanitizeForAI, sanitizeObjectForAI, anonymizeAgentName, validateAIResponse } from "../_shared/ai-sanitizer.ts";
import { callAI, callAIJson, type AIMessage } from "../_shared/ai-provider-helper.ts";
import { createMetricsLogger, extractTokenUsage, AIInferenceMetrics } from "../_shared/ai-metrics.ts";
import { persistAIMetrics } from "../_shared/ai-metrics-persistence.ts";
import { AIEvidence, buildEvidence, calculateConfidence, generateReasoningSummary, extractDataSources } from "../_shared/ai-evidence-types.ts";

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
  // Evidence Pack - TOP 5% Global
  evidence: AIEvidence[];
  data_sources: string[];
  reasoning_summary: string;
  confidence: number;
}

Deno.serve(async (req) => {
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

    // Build evidence from context data
    const evidence: AIEvidence[] = [];
    
    // Add metrics evidence
    if (context.metrics) {
      if (context.metrics.cpu_usage_percent !== null) {
        evidence.push(buildEvidence(
          'Uso de CPU',
          'agent_system_metrics_partitioned',
          context.metrics.cpu_usage_percent,
          agent.id,
          context.metrics.cpu_usage_percent > 80 ? 'critical' : context.metrics.cpu_usage_percent > 60 ? 'warning' : 'info'
        ));
      }
      if (context.metrics.memory_usage_percent !== null) {
        evidence.push(buildEvidence(
          'Uso de Memória',
          'agent_system_metrics_partitioned',
          context.metrics.memory_usage_percent,
          agent.id,
          context.metrics.memory_usage_percent > 85 ? 'critical' : context.metrics.memory_usage_percent > 70 ? 'warning' : 'info'
        ));
      }
      if (context.metrics.disk_usage_percent !== null) {
        evidence.push(buildEvidence(
          'Uso de Disco',
          'agent_system_metrics_partitioned',
          context.metrics.disk_usage_percent,
          agent.id,
          context.metrics.disk_usage_percent > 90 ? 'critical' : context.metrics.disk_usage_percent > 80 ? 'warning' : 'info'
        ));
      }
    }

    // Add vulnerabilities evidence
    const criticalVulns = context.vulnerabilities.filter(v => v.severity === 'critical' || v.severity === 'high');
    if (criticalVulns.length > 0) {
      evidence.push(buildEvidence(
        'Vulnerabilidades Críticas/Altas',
        'vulnerabilities',
        criticalVulns.length,
        agent.id,
        'critical'
      ));
    }

    // Add software inventory evidence
    if (context.software.length > 0) {
      evidence.push(buildEvidence(
        'Softwares Instalados',
        'software_inventory',
        context.software.length,
        agent.id,
        'info'
      ));
    }

    // Add job failure evidence
    const failedJobs = context.recentJobs.filter(j => j.status === 'failed');
    if (failedJobs.length > 0) {
      evidence.push(buildEvidence(
        'Jobs com Falha',
        'jobs',
        failedJobs.length,
        agent.id,
        failedJobs.length > 3 ? 'critical' : 'warning'
      ));
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

    // Call AI using multi-provider system
    const { data: parsedAnalysis, result: aiResult } = await callAIJson<{
      healthScore?: number;
      suggestions?: AISuggestion[];
      insights?: string[];
      riskFactors?: string[];
    }>(systemPrompt, contextSummary, {
      maxTokens: 1024,
      functionName: 'ai-analyze-agent',
    });

    // Handle AI call failure
    if (!aiResult.success || !parsedAnalysis) {
      console.warn('[ai-analyze-agent] AI call failed, using basic analysis:', aiResult.error);
      const basicAnalysis = generateBasicAnalysis(context, evidence);
      return new Response(
        JSON.stringify({ 
          ...basicAnalysis, 
          aiProvider: aiResult.provider,
          aiError: aiResult.error 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ai-analyze-agent] Analysis completed via ${aiResult.provider} in ${aiResult.latencyMs}ms`);

    if (!content) {
      const basicAnalysis = generateBasicAnalysis(context, evidence);
      return new Response(
        JSON.stringify(basicAnalysis),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse AI response
    let analysis: Partial<AIAnalysis>;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      const basicAnalysis = generateBasicAnalysis(context, evidence);
      return new Response(
        JSON.stringify(basicAnalysis),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build complete response with Evidence Pack
    const data_sources = extractDataSources(evidence);
    const confidence = calculateConfidence(evidence, true);
    const reasoning_summary = generateReasoningSummary(
      evidence,
      `análise do agente ${agent.hostname || agent.agent_name}`,
      'Análise de IA aplicada para avaliação de saúde e recomendações de segurança.'
    );

    const completeAnalysis: AIAnalysis = {
      healthScore: Math.min(100, Math.max(0, analysis.healthScore || 50)),
      suggestions: (analysis.suggestions || []).slice(0, 5),
      insights: (analysis.insights || []).slice(0, 5),
      riskFactors: (analysis.riskFactors || []).slice(0, 5),
      // Evidence Pack
      evidence,
      data_sources,
      reasoning_summary,
      confidence,
    };

    return new Response(
      JSON.stringify(completeAnalysis),
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
  
  const displayName = agent.hostname || agent.agent_name || 'Computador';
  
  return `
Computador: ${displayName}
Sistema Operacional: ${agent.os_type}
Hostname: ${agent.hostname || 'Não definido'}

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

function generateBasicAnalysis(context: AgentContext, evidence: AIEvidence[]): AIAnalysis {
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

  // Evidence Pack for basic analysis
  const data_sources = extractDataSources(evidence);
  const confidence = calculateConfidence(evidence, false);
  const reasoning_summary = generateReasoningSummary(
    evidence,
    'análise básica de métricas do sistema',
    undefined
  );

  return {
    healthScore: Math.max(0, healthScore),
    suggestions,
    insights,
    riskFactors,
    // Evidence Pack
    evidence,
    data_sources,
    reasoning_summary,
    confidence,
  };
}
