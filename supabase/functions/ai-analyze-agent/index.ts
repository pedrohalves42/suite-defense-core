/**
 * ai-analyze-agent → Migrated to serveTenant() (V-1097)
 * Previously had NO authentication at all.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { sanitizeForAI } from '../_shared/ai-sanitizer.ts';
import { callAIJson } from '../_shared/ai-provider-helper.ts';
import { AIEvidence, buildEvidence, calculateConfidence, generateReasoningSummary, extractDataSources } from '../_shared/ai-evidence-types.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const AnalyzeAgentSchema = z.object({
  agent: z.object({
    id: z.string().min(1),
    agent_name: z.string().min(1).max(255),
    os_type: z.string().max(100),
    hostname: z.string().max(255),
  }),
  context: z.object({
    metrics: z.object({
      cpu_usage_percent: z.number().nullable(),
      memory_usage_percent: z.number().nullable(),
      disk_usage_percent: z.number().nullable(),
      uptime_seconds: z.number().nullable(),
    }).nullable(),
    software: z.array(z.object({ name: z.string(), version: z.string(), publisher: z.string() })).max(500),
    vulnerabilities: z.array(z.object({ severity: z.string(), title: z.string() })).max(500),
    recentJobs: z.array(z.object({ type: z.string(), status: z.string(), created_at: z.string() })).max(100),
  }),
});

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
  evidence: AIEvidence[];
  data_sources: string[];
  reasoning_summary: string;
  confidence: number;
}

serveTenant(async (_req, ctx) => {
  const origin = _req.headers.get("origin");
  const { body } = ctx;
  const { agent, context }: { agent: Agent; context: AgentContext } = body;

  if (!agent || !context) {
    return new Response(
      JSON.stringify({ error: 'Agent and context are required' }),
      { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Build evidence from context data
  const evidence: AIEvidence[] = [];
  
  if (context.metrics) {
    if (context.metrics.cpu_usage_percent !== null) {
      evidence.push(buildEvidence('Uso de CPU', 'agent_system_metrics_partitioned', context.metrics.cpu_usage_percent, agent.id,
        context.metrics.cpu_usage_percent > 80 ? 'critical' : context.metrics.cpu_usage_percent > 60 ? 'warning' : 'info'));
    }
    if (context.metrics.memory_usage_percent !== null) {
      evidence.push(buildEvidence('Uso de Memoria', 'agent_system_metrics_partitioned', context.metrics.memory_usage_percent, agent.id,
        context.metrics.memory_usage_percent > 85 ? 'critical' : context.metrics.memory_usage_percent > 70 ? 'warning' : 'info'));
    }
    if (context.metrics.disk_usage_percent !== null) {
      evidence.push(buildEvidence('Uso de Disco', 'agent_system_metrics_partitioned', context.metrics.disk_usage_percent, agent.id,
        context.metrics.disk_usage_percent > 90 ? 'critical' : context.metrics.disk_usage_percent > 80 ? 'warning' : 'info'));
    }
  }

  const criticalVulns = context.vulnerabilities.filter(v => v.severity === 'critical' || v.severity === 'high');
  if (criticalVulns.length > 0) {
    evidence.push(buildEvidence('Vulnerabilidades Criticas/Altas', 'vulnerabilities', criticalVulns.length, agent.id, 'critical'));
  }
  if (context.software.length > 0) {
    evidence.push(buildEvidence('Softwares Instalados', 'software_inventory', context.software.length, agent.id, 'info'));
  }
  const failedJobs = context.recentJobs.filter(j => j.status === 'failed');
  if (failedJobs.length > 0) {
    evidence.push(buildEvidence('Jobs com Falha', 'jobs', failedJobs.length, agent.id, failedJobs.length > 3 ? 'critical' : 'warning'));
  }

  const rawContextSummary = buildContextSummary(agent, context);
  const sanitizeResult = sanitizeForAI(rawContextSummary);
  if (sanitizeResult.blocked) {
    logger.warn('[ai-analyze-agent] Prompt injection attempt blocked:', sanitizeResult.blockedPatterns);
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

  const { data: parsedAnalysis, result: aiResult } = await callAIJson<{
    healthScore?: number;
    suggestions?: AISuggestion[];
    insights?: string[];
    riskFactors?: string[];
  }>(systemPrompt, contextSummary, { maxTokens: 1024, functionName: 'ai-analyze-agent' });

  if (!aiResult.success || !parsedAnalysis) {
    logger.warn('[ai-analyze-agent] AI call failed, using basic analysis:', aiResult.error);
    const basicAnalysis = generateBasicAnalysis(context, evidence);
    return { ...basicAnalysis, aiProvider: aiResult.provider, aiError: aiResult.error };
  }

  const data_sources = extractDataSources(evidence);
  const confidence = calculateConfidence(evidence, true);
  const reasoning_summary = generateReasoningSummary(evidence,
    `analise do agente ${agent.hostname || agent.agent_name}`,
    'Analise de IA aplicada para avaliacao de saude e recomendacoes de seguranca.');

  return {
    healthScore: Math.min(100, Math.max(0, parsedAnalysis.healthScore || 50)),
    suggestions: (parsedAnalysis.suggestions || []).slice(0, 5),
    insights: (parsedAnalysis.insights || []).slice(0, 5),
    riskFactors: (parsedAnalysis.riskFactors || []).slice(0, 5),
    evidence, data_sources, reasoning_summary, confidence,
  };
});

function buildContextSummary(agent: Agent, context: AgentContext): string {
  const metrics = context.metrics;
  const vulnCount = context.vulnerabilities.length;
  const critVulns = context.vulnerabilities.filter(v => v.severity === 'critical' || v.severity === 'high').length;
  const failed = context.recentJobs.filter(j => j.status === 'failed').length;
  const total = context.recentJobs.length;
  const displayName = agent.hostname || agent.agent_name || 'Computador';
  
  return `
Computador: ${displayName}
Sistema Operacional: ${agent.os_type}
Hostname: ${agent.hostname || 'Nao definido'}

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
- Criticas/Altas: ${critVulns}

JOBS RECENTES (ultimos 20):
- Total: ${total}
- Falhados: ${failed}
- Taxa de sucesso: ${total > 0 ? Math.round(((total - failed) / total) * 100) : 100}%

Analise este agente e sugira validacoes especificas baseadas no contexto.
`;
}

function generateBasicAnalysis(context: AgentContext, evidence: AIEvidence[]): AIAnalysis {
  const suggestions: AISuggestion[] = [];
  const insights: string[] = [];
  const riskFactors: string[] = [];
  let healthScore = 100;

  const metrics = context.metrics;
  if (metrics?.cpu_usage_percent && metrics.cpu_usage_percent > 80) {
    healthScore -= 15;
    riskFactors.push('Uso de CPU elevado pode indicar processo malicioso ou sobrecarga');
    suggestions.push({ jobType: 'light_vuln_scan', priority: 'high', reason: 'CPU alto - verificar processos suspeitos', confidence: 85 });
  }
  if (metrics?.memory_usage_percent && metrics.memory_usage_percent > 85) {
    healthScore -= 10;
    riskFactors.push('Uso de memoria elevado');
    insights.push('Considere verificar processos consumindo muita memoria');
  }
  if (metrics?.disk_usage_percent && metrics.disk_usage_percent > 90) {
    healthScore -= 15;
    riskFactors.push('Disco quase cheio - risco de falhas');
    insights.push('Espaco em disco critico, libere espaco urgentemente');
  }
  const critVulns = context.vulnerabilities.filter(v => v.severity === 'critical' || v.severity === 'high').length;
  if (critVulns > 0) {
    healthScore -= critVulns * 5;
    riskFactors.push(`${critVulns} vulnerabilidades criticas/altas detectadas`);
    suggestions.push({ jobType: 'light_vuln_scan', priority: 'high', reason: `${critVulns} vulnerabilidades precisam de atencao`, confidence: 90 });
  }
  if (context.software.length === 0) {
    suggestions.push({ jobType: 'software_inventory_collect', priority: 'medium', reason: 'Inventario de software nao coletado', confidence: 95 });
  }
  const failed = context.recentJobs.filter(j => j.status === 'failed').length;
  if (failed > 3) { healthScore -= 10; riskFactors.push('Alta taxa de falha em jobs recentes'); }
  if (suggestions.length === 0) {
    suggestions.push({ jobType: 'collect_antivirus_status', priority: 'low', reason: 'Verificacao de rotina do antivirus', confidence: 70 });
    suggestions.push({ jobType: 'collect_network_info', priority: 'low', reason: 'Coletar informacoes de rede para diagnostico', confidence: 75 });
  }
  if (insights.length === 0) { insights.push('Sistema operando dentro dos parametros normais'); }

  return {
    healthScore: Math.max(0, healthScore), suggestions, insights, riskFactors, evidence,
    data_sources: extractDataSources(evidence),
    reasoning_summary: generateReasoningSummary(evidence, 'analise basica de metricas do sistema', undefined),
    confidence: calculateConfidence(evidence, false),
  };
}
