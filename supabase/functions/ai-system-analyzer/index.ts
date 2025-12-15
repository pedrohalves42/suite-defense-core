import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { sanitizeForAI, anonymizeAgentName } from '../_shared/ai-sanitizer.ts';
import { withCircuitBreaker, executeWithTimeout } from '../_shared/ai-circuit-breaker.ts';
import { createMetricsLogger, extractTokenUsage, AIInferenceMetrics } from '../_shared/ai-metrics.ts';
import { persistAIMetrics } from '../_shared/ai-metrics-persistence.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AI_MODEL = 'google/gemini-2.5-flash';
const AI_TIMEOUT_MS = 15000; // 15 seconds

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

// Helper: Verificar se tenant tem feature AI habilitada e quota disponivel
async function checkTenantAIEligibility(
  supabase: any,
  tenantId: string
): Promise<{ eligible: boolean; reason?: string }> {
  // 1. Verificar subscription ativa ou trial valido
  const { data: subscription, error: subError } = await supabase
    .from('tenant_subscriptions')
    .select('status, trial_end')
    .eq('tenant_id', tenantId)
    .single();

  if (subError || !subscription) {
    return { eligible: false, reason: 'no_subscription' };
  }

  const sub = subscription as { status: string; trial_end: string | null };
  const isActiveSubscription = sub.status === 'active';
  const isValidTrial = sub.status === 'trialing' && 
    sub.trial_end && 
    new Date(sub.trial_end) > new Date();

  if (!isActiveSubscription && !isValidTrial) {
    return { eligible: false, reason: 'subscription_inactive_or_trial_expired' };
  }

  // 2. Verificar se feature ai_insights esta habilitada
  const { data: feature, error: featureError } = await supabase
    .from('tenant_features')
    .select('enabled, quota_limit, quota_used')
    .eq('tenant_id', tenantId)
    .eq('feature_key', 'ai_insights')
    .single();

  // Se feature nao existe, permitir por padrao (backward compatibility)
  if (featureError || !feature) {
    return { eligible: true, reason: 'feature_not_configured_allowing_default' };
  }

  const feat = feature as { enabled: boolean; quota_limit: number | null; quota_used: number };

  // 3. Verificar se feature esta habilitada
  if (!feat.enabled) {
    return { eligible: false, reason: 'feature_disabled' };
  }

  // 4. Verificar quota (se configurada)
  if (feat.quota_limit !== null && feat.quota_used >= feat.quota_limit) {
    return { eligible: false, reason: 'quota_exceeded' };
  }

  return { eligible: true };
}

// Helper: Incrementar uso de quota
async function incrementAIQuotaUsage(
  supabase: any,
  tenantId: string,
  insightsCount: number
): Promise<void> {
  try {
    // Update direto com SQL increment
    await supabase
      .from('tenant_features')
      .update({ quota_used: supabase.raw(`quota_used + ${insightsCount}`) })
      .eq('tenant_id', tenantId)
      .eq('feature_key', 'ai_insights');
  } catch (error) {
    // Quota tracking is best-effort, don't fail the analysis
    console.log(`[ai-system-analyzer] Could not increment quota for tenant ${tenantId}:`, error);
  }
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
    const skippedTenants: { id: string; name: string; reason: string }[] = [];

    for (const tenant of tenants) {
      try {
        // P0 FIX: Verificar elegibilidade do tenant antes de processar
        const eligibility = await checkTenantAIEligibility(supabase, tenant.id);
        
        if (!eligibility.eligible) {
          console.log(`[ai-system-analyzer] Skipping tenant ${tenant.name}: ${eligibility.reason}`);
          skippedTenants.push({ id: tenant.id, name: tenant.name, reason: eligibility.reason! });
          continue;
        }

        console.log(`[ai-system-analyzer] Analyzing tenant: ${tenant.name} (${tenant.id})`);

        // Coletar dados dos ultimos 7 dias para analise
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);

        // 0. Buscar agentes com hostnames amigáveis para usar em vez de agent_name técnico
        const { data: agentsList } = await supabase
          .from('agents')
          .select('id, agent_name, hostname, display_name')
          .eq('tenant_id', tenant.id);
        
        // Criar mapa de agent_id -> nome amigável (prioridade: display_name > hostname > agent_name)
        const agentFriendlyNames = new Map<string, string>();
        for (const agent of (agentsList || [])) {
          const friendlyName = agent.display_name || agent.hostname || agent.agent_name;
          agentFriendlyNames.set(agent.id, friendlyName);
        }

        // 1. Jobs problematicos
        const { data: problematicJobs } = await supabase
          .from('v_problematic_jobs')
          .select('*')
          .eq('tenant_id', tenant.id)
          .gte('created_at', cutoffDate.toISOString())
          .limit(100);

        // 2. Metricas de instalacao
        const { data: installationStats } = await supabase
          .from('installation_analytics')
          .select('*')
          .eq('tenant_id', tenant.id)
          .gte('created_at', cutoffDate.toISOString())
          .order('created_at', { ascending: false })
          .limit(500);

        // 3. Metricas de agentes
        const { data: agentMetrics } = await supabase
          .from('agent_system_metrics_partitioned')
          .select('*')
          .eq('tenant_id', tenant.id)
          .gte('collected_at', cutoffDate.toISOString())
          .order('collected_at', { ascending: false })
          .limit(500);
        
        // Enriquecer métricas com nomes amigáveis
        const enrichedAgentMetrics = (agentMetrics || []).map(metric => ({
          ...metric,
          friendly_name: agentFriendlyNames.get(metric.agent_id) || metric.agent_name || metric.agent_id.slice(0, 8)
        }));

        // 4. Alertas do sistema
        const { data: systemAlerts } = await supabase
          .from('system_alerts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .gte('created_at', cutoffDate.toISOString())
          .order('created_at', { ascending: false })
          .limit(100);

        // 5. Estatisticas de jobs
        const { data: jobStats } = await supabase
          .from('jobs')
          .select('status, type, created_at')
          .eq('tenant_id', tenant.id)
          .gte('created_at', cutoffDate.toISOString())
          .limit(1000); // [OK]  CRITICO: Previne DoS em escala (P0 fix)

        const analysisData: AnalysisData = {
          problematicJobs: problematicJobs || [],
          failurePatterns: installationStats?.filter(s => s.success === false) || [],
          agentMetrics: enrichedAgentMetrics || [],
          installationStats: installationStats || [],
          systemAlerts: systemAlerts || [],
        };

        // Se nao ha dados suficientes, pular este tenant
        const totalDataPoints = 
          analysisData.problematicJobs.length +
          analysisData.failurePatterns.length +
          analysisData.agentMetrics.length +
          analysisData.systemAlerts.length;

        if (totalDataPoints < 5) {
          console.log(`[ai-system-analyzer] Insufficient data for tenant ${tenant.name}, skipping`);
          continue;
        }

        // Chamar IA para analise
        const tenantInsights = await analyzeWithAI(tenant.id, tenant.name, analysisData, jobStats || []);
        
        // P0 FIX: Incrementar quota apos gerar insights
        if (tenantInsights.length > 0) {
          await incrementAIQuotaUsage(supabase, tenant.id, tenantInsights.length);
        }
        
        insights.push(...tenantInsights);

      } catch (tenantError) {
        console.error(`[ai-system-analyzer] Error analyzing tenant ${tenant.name}:`, tenantError);
        // Continuar com proximo tenant em caso de erro
        continue;
      }
    }

    // Salvar insights no banco
    if (insights.length > 0) {
      const { data: insertedInsights, error: insertError } = await supabase
        .from('ai_insights')
        .insert(insights)
        .select();

      if (insertError) {
        console.error('[ai-system-analyzer] Error saving insights:', insertError);
        throw insertError;
      }

      console.log(`[ai-system-analyzer] Successfully saved ${insights.length} insights`);

      // FASE 2: Gerar acoes sugeridas baseadas nos insights
      if (insertedInsights && insertedInsights.length > 0) {
        const suggestedActions = await generateSuggestedActions(insertedInsights);
        
        if (suggestedActions.length > 0) {
          const { error: actionError } = await supabase
            .from('ai_actions')
            .insert(suggestedActions);

          if (actionError) {
            console.error(`[ai-system-analyzer] Error inserting suggested actions:`, actionError);
          } else {
            console.log(`[ai-system-analyzer] Generated ${suggestedActions.length} suggested actions`);
          }
        }
      }
    } else {
      console.log('[ai-system-analyzer] No insights generated');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        insightsGenerated: insights.length,
        tenantsAnalyzed: tenants.length - skippedTenants.length,
        tenantsSkipped: skippedTenants.length,
        skippedDetails: skippedTenants.map(t => ({ name: t.name, reason: t.reason }))
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
    // Calcular estatisticas resumidas
    const failureRate = data.installationStats.length > 0
      ? (data.failurePatterns.length / data.installationStats.length) * 100
      : 0;

    // MELHORADO: Análise POR AGENTE em vez de médias globais
    // Usar nomes amigáveis (display_name > hostname > agent_name) diretamente
    const agentMetricsMap = new Map<string, { 
      cpu: number[]; 
      memory: number[]; 
      disk: number[];
      friendly_name: string;
    }>();
    
    for (const metric of data.agentMetrics) {
      const agentId = metric.agent_id;
      if (!agentMetricsMap.has(agentId)) {
        // Usar o friendly_name já enriquecido anteriormente
        const friendlyName = metric.friendly_name || metric.agent_name || agentId.slice(0, 8);
        agentMetricsMap.set(agentId, { 
          cpu: [], 
          memory: [], 
          disk: [],
          friendly_name: friendlyName
        });
      }
      const agentData = agentMetricsMap.get(agentId)!;
      if (metric.cpu_usage_percent != null) agentData.cpu.push(metric.cpu_usage_percent);
      if (metric.memory_usage_percent != null) agentData.memory.push(metric.memory_usage_percent);
      if (metric.disk_usage_percent != null) agentData.disk.push(metric.disk_usage_percent);
    }

    // Calcular médias e identificar outliers por agente
    // CORREÇÃO: Usar nomes amigáveis diretamente em vez de anonimizar
    const agentSummaries = Array.from(agentMetricsMap.entries()).map(([agentId, data]) => {
      const avgCpu = data.cpu.length > 0 ? data.cpu.reduce((a, b) => a + b, 0) / data.cpu.length : 0;
      const avgMemory = data.memory.length > 0 ? data.memory.reduce((a, b) => a + b, 0) / data.memory.length : 0;
      const avgDisk = data.disk.length > 0 ? data.disk.reduce((a, b) => a + b, 0) / data.disk.length : 0;
      const maxCpu = data.cpu.length > 0 ? Math.max(...data.cpu) : 0;
      const maxMemory = data.memory.length > 0 ? Math.max(...data.memory) : 0;
      const maxDisk = data.disk.length > 0 ? Math.max(...data.disk) : 0;
      
      return {
        agent_id: agentId,
        // Usar nome amigável diretamente (não anonimizado)
        agent_name: data.friendly_name,
        samples: data.cpu.length,
        avg_cpu: avgCpu,
        avg_memory: avgMemory,
        avg_disk: avgDisk,
        max_cpu: maxCpu,
        max_memory: maxMemory,
        max_disk: maxDisk,
        // Flags de problemas
        high_cpu: maxCpu > 90,
        high_memory: maxMemory > 85,
        critical_disk: maxDisk > 90,
      };
    });

    // Identificar agentes problemáticos
    const problematicAgents = agentSummaries.filter(a => a.high_cpu || a.high_memory || a.critical_disk);

    // Correlacionar alertas com agentes específicos usando nomes amigáveis
    const alertsByAgent = new Map<string, number>();
    for (const alert of data.systemAlerts) {
      if (alert.agent_id) {
        // Usar nome amigável do mapa de métricas ou fallback
        const agentData = agentMetricsMap.get(alert.agent_id);
        const friendlyName = agentData?.friendly_name || alert.agent_id.slice(0, 8);
        alertsByAgent.set(friendlyName, (alertsByAgent.get(friendlyName) || 0) + 1);
      } else {
        alertsByAgent.set('sistema', (alertsByAgent.get('sistema') || 0) + 1);
      }
    }

    const jobStatusCounts = jobStats.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Médias globais para contexto geral
    const avgCpuUsage = agentSummaries.length > 0
      ? agentSummaries.reduce((sum, a) => sum + a.avg_cpu, 0) / agentSummaries.length
      : 0;
    const avgMemoryUsage = agentSummaries.length > 0
      ? agentSummaries.reduce((sum, a) => sum + a.avg_memory, 0) / agentSummaries.length
      : 0;

    // Usar nome do tenant diretamente (não anonimizado)
    const displayTenantName = tenantName || 'Empresa';

    const rawPrompt = `Voce e um especialista em analise de sistemas de monitoramento de computadores. Analise os dados abaixo e identifique problemas, anomalias, e oportunidades de otimizacao.

**IMPORTANTE:** Analise CADA COMPUTADOR individualmente. Nao se deixe enganar por medias globais baixas - pode haver computadores especificos com problemas criticos.

**Dados da Empresa: ${displayTenantName}**

**Resumo Global (use apenas como contexto):**
- CPU media global: ${avgCpuUsage.toFixed(1)}%
- Memoria media global: ${avgMemoryUsage.toFixed(1)}%
- Total de agentes: ${agentSummaries.length}

**Analise POR AGENTE (PRIORIDADE):**
${agentSummaries.slice(0, 10).map(a => 
  `- ${a.agent_name}: CPU max=${a.max_cpu.toFixed(1)}% avg=${a.avg_cpu.toFixed(1)}%, Mem max=${a.max_memory.toFixed(1)}% avg=${a.avg_memory.toFixed(1)}%, Disco max=${a.max_disk.toFixed(1)}% (${a.samples} amostras)${a.high_cpu ? ' ⚠️CPU' : ''}${a.high_memory ? ' ⚠️MEM' : ''}${a.critical_disk ? ' 🔴DISCO' : ''}`
).join('\n')}

**Agentes Problematicos Identificados:** ${problematicAgents.length}
${problematicAgents.map(a => `- ${a.agent_name}: ${a.critical_disk ? 'DISCO CRITICO ' + a.max_disk.toFixed(1) + '%' : ''}${a.high_memory ? 'MEMORIA ALTA ' + a.max_memory.toFixed(1) + '%' : ''}${a.high_cpu ? 'CPU ALTA ' + a.max_cpu.toFixed(1) + '%' : ''}`).join('\n')}

**Alertas por Agente:**
${Array.from(alertsByAgent.entries()).slice(0, 5).map(([anonName, count]) => `- ${anonName}: ${count} alertas`).join('\n')}

**Metricas de Instalacao (ultimos 7 dias):**
- Total de tentativas: ${data.installationStats.length}
- Falhas: ${data.failurePatterns.length}
- Taxa de falha: ${failureRate.toFixed(1)}%

**Jobs Problematicos:**
- Total: ${data.problematicJobs.length}
- Status: ${JSON.stringify(jobStatusCounts)}

**Alertas do Sistema:**
- Total: ${data.systemAlerts.length}
- Criticos: ${data.systemAlerts.filter(a => a.severity === 'critical').length}

**Sua tarefa:**
1. Identifique ate 3 insights mais relevantes, PRIORIZANDO agentes especificos com problemas
2. Para cada insight, retorne um objeto JSON com:
   - insight_type: 'anomaly_detection', 'optimization', 'prediction', ou 'root_cause'
   - severity: 'info', 'warning', ou 'critical'
   - title: titulo curto e descritivo (INCLUA nome do agente se for problema especifico)
   - description: descricao detalhada do problema (2-3 frases)
   - recommendation: recomendacao clara de acao
   - confidence_score: valor entre 0.0 e 1.0

Responda APENAS com um array JSON valido de insights. Exemplo:
[
  {
    "insight_type": "root_cause",
    "severity": "critical",
    "title": "Disco critico no agente PC-Finance",
    "description": "O agente PC-Finance esta com 95.2% de uso de disco, gerando 18 alertas criticos nas ultimas 24h. Isso pode causar falha do sistema.",
    "recommendation": "Liberar espaco em disco imediatamente: limpar logs antigos, arquivos temporarios, e downloads.",
    "confidence_score": 0.95
  }
]`;

    // Sanitizar o prompt antes de enviar à IA
    const promptSanitizeResult = sanitizeForAI(rawPrompt);
    if (promptSanitizeResult.blocked) {
      console.warn('[ai-system-analyzer] Prompt injection blocked for tenant:', tenantId, promptSanitizeResult.blockedPatterns);
    }
    const prompt = promptSanitizeResult.sanitized;

    // Start metrics tracking
    const aiMetricsLogger = createMetricsLogger('ai-system-analyzer', AI_MODEL);
    const startTime = aiMetricsLogger.logStart(tenantId);

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
                  content: 'Voce e um especialista em analise de sistemas. Responda APENAS com JSON valido, sem texto adicional.' 
                },
                { role: 'user', content: prompt }
              ],
            }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              throw new Error('Rate limit exceeded');
            }
            if (response.status === 402) {
              throw new Error('Payment required - credits exhausted');
            }
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
      aiMetricsLogger.logFailure(startTime, aiResult.error || 'Unknown error', tenantId, aiResult.usedFallback);
      console.error('[ai-system-analyzer] AI call failed for tenant:', tenantId, aiResult.error);
      return [];
    }

    const aiResponse = aiResult.data;
    const content = aiResponse.choices?.[0]?.message?.content;
    const tokenUsage = extractTokenUsage(aiResponse);

    // Log success metrics and persist to database
    aiMetricsLogger.logSuccess(startTime, tenantId, tokenUsage);
    
    // Persist metrics to DB for dashboard
    const successMetrics: AIInferenceMetrics = {
      timestamp: new Date().toISOString(),
      function_name: 'ai-system-analyzer',
      model: AI_MODEL,
      latency_ms: Date.now() - startTime,
      success: true,
      tokens_prompt: tokenUsage.prompt,
      tokens_completion: tokenUsage.completion,
      tokens_total: tokenUsage.total,
      tenant_id: tenantId,
    };
    await persistAIMetrics(successMetrics);

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
    // CORREÇÃO: Não precisa traduzir pois usamos nomes amigáveis diretamente
    return parsedInsights.map((insight: any) => ({
      tenant_id: tenantId,
      insight_type: insight.insight_type,
      severity: insight.severity,
      title: insight.title || '',
      description: insight.description || '',
      evidence: {
        failureRate,
        avgCpuUsage,
        avgMemoryUsage,
        problematicJobsCount: data.problematicJobs.length,
        systemAlertsCount: data.systemAlerts.length,
        analysisDate: new Date().toISOString(),
      },
      recommendation: insight.recommendation || '',
      confidence_score: insight.confidence_score,
    }));

  } catch (error) {
    console.error('[ai-system-analyzer] Error in AI analysis:', error);
    return [];
  }
}

// FASE 2: Funcao para gerar acoes sugeridas baseadas em insights
async function generateSuggestedActions(insights: any[]) {
  const actions: any[] = [];

  for (const insight of insights) {
    // So gerar acoes para insights de alta severidade ou criticos
    if (!['high', 'critical'].includes(insight.severity)) continue;

    // Determinar tipo de acao baseado no tipo de insight
    let actionType = null;
    let actionPayload: any = {};

    switch (insight.insight_type) {
      case 'agent_health':
      case 'performance_degradation': {
        // Sugerir diagnostico para agentes com problemas
        const agentName = insight.evidence?.agent_name;
        if (agentName) {
          actionType = 'create_diagnostic_job';
          actionPayload = {
            agent_name: agentName,
            reason: insight.description,
            diagnostic_type: 'health_check'
          };
        }
        break;
      }

      case 'failure_pattern':
      case 'anomaly': {
        // Criar alerta para padroes criticos
        actionType = 'create_system_alert';
        actionPayload = {
          title: `AI Alert: ${insight.title}`,
          message: insight.description,
          severity: insight.severity === 'critical' ? 'critical' : 'high',
          evidence: insight.evidence
        };
        break;
      }

      case 'resource_exhaustion': {
        // Sugerir restart ou limpeza
        const agentName = insight.evidence?.agent_name;
        if (agentName) {
          actionType = 'suggest_agent_restart';
          actionPayload = {
            agent_name: agentName,
            reason: insight.description,
            cpu_usage: insight.evidence?.cpu_usage,
            memory_usage: insight.evidence?.memory_usage
          };
        }
        break;
      }

      case 'stuck_jobs': {
        actionType = 'suggest_job_cleanup';
        actionPayload = {
          reason: insight.description,
          stuck_job_count: insight.evidence?.stuck_job_count,
          recommendation: insight.recommendation
        };
        break;
      }
    }

    // Se encontrou uma acao apropriada, adicionar a lista
    if (actionType) {
      actions.push({
        insight_id: insight.id,
        tenant_id: insight.tenant_id,
        action_type: actionType,
        action_payload: actionPayload,
        status: 'pending', // Sempre pending - requer aprovacao humana
      });
    }
  }

  return actions;
}

