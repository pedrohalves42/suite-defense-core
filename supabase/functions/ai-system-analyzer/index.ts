import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { sanitizeForAI, anonymizeAgentName } from '../_shared/ai-sanitizer.ts';
import { callAIJson, getAIProviderHealth, type AIMessage } from '../_shared/ai-provider-helper.ts';
import { createMetricsLogger, extractTokenUsage, AIInferenceMetrics } from '../_shared/ai-metrics.ts';
import { persistAIMetrics } from '../_shared/ai-metrics-persistence.ts';
import { AIEvidence, buildEvidence, calculateConfidence, generateReasoningSummary, extractDataSources } from '../_shared/ai-evidence-types.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface AnalysisData {
  problematicJobs: Array<Record<string, unknown>>;
  failurePatterns: Array<Record<string, unknown>>;
  agentMetrics: Array<Record<string, unknown>>;
  installationStats: Array<Record<string, unknown>>;
  systemAlerts: Array<Record<string, unknown>>;
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

// Helper: Incrementar uso de quota (safe from SQL injection)
async function incrementAIQuotaUsage(
  supabase: any,
  tenantId: string,
  insightsCount: number
): Promise<void> {
  try {
    // Validate insightsCount to ensure it's a safe integer
    if (!Number.isInteger(insightsCount) || insightsCount < 0 || insightsCount > 1000) {
      logger.info(`[ai-system-analyzer] Invalid insightsCount: ${insightsCount}`);
      return;
    }
    
    // Safe approach: SELECT current value, then UPDATE with calculated value
    const { data: current, error: selectError } = await supabase
      .from('tenant_features')
      .select('quota_used')
      .eq('tenant_id', tenantId)
      .eq('feature_key', 'ai_insights')
      .single();

    if (selectError || !current) {
      logger.info(`[ai-system-analyzer] Could not fetch quota for tenant ${tenantId}:`, selectError);
      return;
    }

    const newQuotaUsed = (current.quota_used || 0) + insightsCount;
    
    await supabase
      .from('tenant_features')
      .update({ quota_used: newQuotaUsed })
      .eq('tenant_id', tenantId)
      .eq('feature_key', 'ai_insights');
  } catch (error) {
    // Quota tracking is best-effort, don't fail the analysis
    logger.info(`[ai-system-analyzer] Could not increment quota for tenant ${tenantId}:`, error);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startedAt = Date.now();

  try {
    // KILL SWITCH CHECK (ADR-FINAL) - Halt all automation if system is in halt_jobs mode
    const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
    if (systemMode === 'halt_jobs') {
      logger.info('[ai-system-analyzer] SYSTEM_HALTED: Kill switch active, skipping analysis');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SYSTEM_HALTED', 
          message: 'Kill switch is active. Set system_state.mode to normal to resume.' 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[ai-system-analyzer] Starting analysis cycle...');

    // Buscar todos os tenants ativos
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name');

    if (tenantsError) {
      logger.error('[ai-system-analyzer] Error fetching tenants:', tenantsError);
      throw tenantsError;
    }

    if (!tenants || tenants.length === 0) {
      logger.info('[ai-system-analyzer] No tenants found, skipping analysis');
      return new Response(JSON.stringify({ message: 'No tenants to analyze' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    logger.info(`[ai-system-analyzer] Analyzing ${tenants.length} tenant(s)`);

    const insights: AIInsight[] = [];
    const skippedTenants: { id: string; name: string; reason: string }[] = [];

    for (const tenant of tenants) {
      try {
        // P0 FIX: Verificar elegibilidade do tenant antes de processar
        const eligibility = await checkTenantAIEligibility(supabase, tenant.id);
        
        if (!eligibility.eligible) {
          logger.info(`[ai-system-analyzer] Skipping tenant ${tenant.name}: ${eligibility.reason}`);
          skippedTenants.push({ id: tenant.id, name: tenant.name, reason: eligibility.reason! });
          continue;
        }

        logger.info(`[ai-system-analyzer] Analyzing tenant: ${tenant.name} (${tenant.id})`);

        // Coletar dados dos ultimos 7 dias para analise
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);

        // 0. Buscar agentes com hostnames amigaveis para usar em vez de agent_name tecnico
        const { data: agentsList } = await supabase
          .from('agents')
          .select('id, agent_name, hostname, display_name')
          .eq('tenant_id', tenant.id);
        
        // Criar mapa de agent_id -> nome amigavel (prioridade: display_name > hostname > agent_name)
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
        
        // Enriquecer metricas com nomes amigaveis
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
          logger.info(`[ai-system-analyzer] Insufficient data for tenant ${tenant.name}, skipping`);
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
        logger.error(`[ai-system-analyzer] Error analyzing tenant ${tenant.name}:`, tenantError);
        // Continuar com proximo tenant em caso de erro
        continue;
      }
    }

    // Deduplication: auto-resolve existing open insights with same title before inserting new ones
    if (insights.length > 0) {
      const newTitles = insights.map(i => i.title);
      const tenantIds = [...new Set(insights.map(i => i.tenant_id))];
      
      for (const tid of tenantIds) {
        const titlesForTenant = insights.filter(i => i.tenant_id === tid).map(i => i.title);
        const { error: dedupError } = await supabase
          .from('ai_insights')
          .update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
            resolution_method: 'manual_dismiss',
            final_outcome: 'no_action_required',
            acknowledged: true,
            acknowledged_at: new Date().toISOString(),
          })
          .eq('tenant_id', tid)
          .in('status', ['open', 'in_progress'])
          .in('title', titlesForTenant);
        
        if (dedupError) {
          logger.warn('[ai-system-analyzer] Dedup error:', dedupError.message);
        }
      }
    }

    // Salvar insights no banco
    if (insights.length > 0) {
      const { data: insertedInsights, error: insertError } = await supabase
        .from('ai_insights')
        .insert(insights)
        .select();

      if (insertError) {
        logger.error('[ai-system-analyzer] Error saving insights:', insertError);
        throw insertError;
      }

      logger.info(`[ai-system-analyzer] Successfully saved ${insights.length} insights (deduped old ones)`);

      // FASE 2: Gerar acoes sugeridas baseadas nos insights
      if (insertedInsights && insertedInsights.length > 0) {
        const suggestedActions = await generateSuggestedActions(insertedInsights);
        
        if (suggestedActions.length > 0) {
          const { error: actionError } = await supabase
            .from('ai_actions')
            .insert(suggestedActions);

          if (actionError) {
            logger.error(`[ai-system-analyzer] Error inserting suggested actions:`, actionError);
          } else {
            logger.info(`[ai-system-analyzer] Generated ${suggestedActions.length} suggested actions`);
          }
        }

        // FASE 2: Dispatch insights to ai-insight-dispatcher pipeline
        for (const insight of insertedInsights) {
          try {
            const dispatchResponse = await supabase.functions.invoke('ai-insight-dispatcher', {
              body: {
                insight: {
                  ...insight,
                  auto_action_mode: insight.severity === 'critical' ? 'auto_with_approval' : 'suggest',
                  recommended_actions: [],
                },
                source: 'ai-system-analyzer',
              },
            });
            
            if (dispatchResponse.error) {
              logger.warn(`[ai-system-analyzer] Dispatch failed for insight ${insight.id}:`, dispatchResponse.error);
            }
          } catch (dispatchErr) {
            logger.warn('[ai-system-analyzer] Insight dispatch error:', dispatchErr);
          }
        }
        logger.info(`[ai-system-analyzer] Dispatched ${insertedInsights.length} insights to pipeline`);
      }
    } else {
      logger.info('[ai-system-analyzer] No insights generated');
    }

    // ?? AUTO-RESOLVE: Close stale in_progress tasks (>48h without progress) ??
    try {
      const { data: resolvedTasks, error: resolveError } = await supabase
        .from('tasks')
        .update({
          status: 'resolved',
          closed_at: new Date().toISOString(),
          closure_reason: 'Auto-resolved: condicao normalizada ou tarefa sem progresso por 48h',
          updated_at: new Date().toISOString(),
        })
        .eq('status', 'in_progress')
        .lt('updated_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .select('id');

      if (resolveError) {
        logger.warn('[ai-system-analyzer] Auto-resolve tasks error:', resolveError.message);
      } else if (resolvedTasks && resolvedTasks.length > 0) {
        logger.info(`[ai-system-analyzer] Auto-resolved ${resolvedTasks.length} stale in_progress tasks`);
      }
    } catch (e) {
      logger.warn('[ai-system-analyzer] Auto-resolve tasks failed:', e);
    }

    const result = { 
      success: true, 
      insightsGenerated: insights.length,
      tenantsAnalyzed: tenants.length - skippedTenants.length,
      tenantsSkipped: skippedTenants.length,
      skippedDetails: skippedTenants.map(t => ({ name: t.name, reason: t.reason }))
    };

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'ai-system-analyzer',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: result,
      p_processed_count: insights.length,
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify(result), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    logger.error('[ai-system-analyzer] Fatal error:', error);
    
    // Log error observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'ai-system-analyzer',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (e) { logger.warn('[ai-system-analyzer] Failed to log job run:', e); }
    
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
  jobStats: Array<Record<string, unknown>>
): Promise<AIInsight[]> {
  // No API key check needed - multi-provider handles availability

  try {
    // Calcular estatisticas resumidas
    const failureRate = data.installationStats.length > 0
      ? (data.failurePatterns.length / data.installationStats.length) * 100
      : 0;

    // MELHORADO: Analise POR AGENTE em vez de medias globais
    // Usar nomes amigaveis (display_name > hostname > agent_name) diretamente
    const agentMetricsMap = new Map<string, { 
      cpu: number[]; 
      memory: number[]; 
      disk: number[];
      friendly_name: string;
    }>();
    
    for (const metric of data.agentMetrics) {
      const agentId = metric.agent_id;
      if (!agentMetricsMap.has(agentId)) {
        // Usar o friendly_name ja enriquecido anteriormente
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

    // Calcular medias e identificar outliers por agente
    // CORRECAO: Usar nomes amigaveis diretamente em vez de anonimizar
    const agentSummaries = Array.from(agentMetricsMap.entries()).map(([agentId, data]) => {
      const avgCpu = data.cpu.length > 0 ? data.cpu.reduce((a, b) => a + b, 0) / data.cpu.length : 0;
      const avgMemory = data.memory.length > 0 ? data.memory.reduce((a, b) => a + b, 0) / data.memory.length : 0;
      const avgDisk = data.disk.length > 0 ? data.disk.reduce((a, b) => a + b, 0) / data.disk.length : 0;
      const maxCpu = data.cpu.length > 0 ? Math.max(...data.cpu) : 0;
      const maxMemory = data.memory.length > 0 ? Math.max(...data.memory) : 0;
      const maxDisk = data.disk.length > 0 ? Math.max(...data.disk) : 0;
      
      return {
        agent_id: agentId,
        // Usar nome amigavel diretamente (nao anonimizado)
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

    // Identificar agentes problematicos
    const problematicAgents = agentSummaries.filter(a => a.high_cpu || a.high_memory || a.critical_disk);

    // Correlacionar alertas com agentes especificos usando nomes amigaveis
    const alertsByAgent = new Map<string, number>();
    for (const alert of data.systemAlerts) {
      if (alert.agent_id) {
        // Usar nome amigavel do mapa de metricas ou fallback
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

    // Medias globais para contexto geral
    const avgCpuUsage = agentSummaries.length > 0
      ? agentSummaries.reduce((sum, a) => sum + a.avg_cpu, 0) / agentSummaries.length
      : 0;
    const avgMemoryUsage = agentSummaries.length > 0
      ? agentSummaries.reduce((sum, a) => sum + a.avg_memory, 0) / agentSummaries.length
      : 0;

    // Usar nome do tenant diretamente (nao anonimizado)
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
  `- ${a.agent_name}: CPU max=${a.max_cpu.toFixed(1)}% avg=${a.avg_cpu.toFixed(1)}%, Mem max=${a.max_memory.toFixed(1)}% avg=${a.avg_memory.toFixed(1)}%, Disco max=${a.max_disk.toFixed(1)}% (${a.samples} amostras)${a.high_cpu ? ' [WARN] ?CPU' : ''}${a.high_memory ? ' [WARN] ?MEM' : ''}${a.critical_disk ? ' ?DISCO' : ''}`
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

    // Sanitizar o prompt antes de enviar a IA
    const promptSanitizeResult = sanitizeForAI(rawPrompt);
    if (promptSanitizeResult.blocked) {
      logger.warn('[ai-system-analyzer] Prompt injection blocked for tenant:', tenantId, promptSanitizeResult.blockedPatterns);
    }
    const prompt = promptSanitizeResult.sanitized;

    // Call AI using multi-provider system
    const systemPrompt = 'Voce e um especialista em analise de sistemas. Responda APENAS com JSON valido, sem texto adicional.';
    
    const { data: parsedInsights, result: aiResult } = await callAIJson<any[]>(
      systemPrompt,
      prompt,
      {
        maxTokens: 2048,
        functionName: 'ai-system-analyzer',
        tenantId,
      }
    );

    // Handle AI call failure
    if (!aiResult.success || !parsedInsights) {
      logger.error('[ai-system-analyzer] AI call failed for tenant:', tenantId, aiResult.error);
      return [];
    }

    logger.info(`[ai-system-analyzer] Analysis for ${tenantName} completed via ${aiResult.provider} in ${aiResult.latencyMs}ms`);

    if (!Array.isArray(parsedInsights)) {
      logger.error('[ai-system-analyzer] AI response is not an array');
      return [];
    }

    // Build evidence array from analysis data
    const evidenceArray: AIEvidence[] = [];
    
    // Add failure rate evidence
    if (failureRate > 0) {
      evidenceArray.push(buildEvidence(
        'Taxa de Falha de Instalacao',
        'installation_analytics',
        failureRate,
        undefined,
        failureRate > 10 ? 'critical' : failureRate > 5 ? 'warning' : 'info'
      ));
    }
    
    // Add CPU evidence
    if (avgCpuUsage > 0) {
      evidenceArray.push(buildEvidence(
        'Uso Medio de CPU',
        'agent_system_metrics_partitioned',
        avgCpuUsage,
        undefined,
        avgCpuUsage > 80 ? 'critical' : avgCpuUsage > 60 ? 'warning' : 'info'
      ));
    }
    
    // Add memory evidence
    if (avgMemoryUsage > 0) {
      evidenceArray.push(buildEvidence(
        'Uso Medio de Memoria',
        'agent_system_metrics_partitioned',
        avgMemoryUsage,
        undefined,
        avgMemoryUsage > 85 ? 'critical' : avgMemoryUsage > 70 ? 'warning' : 'info'
      ));
    }
    
    // Add problematic jobs evidence
    if (data.problematicJobs.length > 0) {
      evidenceArray.push(buildEvidence(
        'Jobs Problematicos',
        'v_problematic_jobs',
        data.problematicJobs.length,
        undefined,
        data.problematicJobs.length > 10 ? 'critical' : 'warning'
      ));
    }
    
    // Add system alerts evidence
    const criticalAlerts = data.systemAlerts.filter(a => a.severity === 'critical').length;
    if (criticalAlerts > 0) {
      evidenceArray.push(buildEvidence(
        'Alertas Criticos',
        'system_alerts',
        criticalAlerts,
        undefined,
        'critical'
      ));
    }
    
    // Add problematic agents evidence
    if (problematicAgents.length > 0) {
      for (const agent of problematicAgents.slice(0, 3)) {
        evidenceArray.push(buildEvidence(
          `Agente com Problema: ${agent.agent_name}`,
          'agent_system_metrics_partitioned',
          { cpu: agent.max_cpu, memory: agent.max_memory, disk: agent.max_disk },
          undefined,
          agent.critical_disk ? 'critical' : 'warning'
        ));
      }
    }

    const data_sources = extractDataSources(evidenceArray);
    const confidence = calculateConfidence(evidenceArray, true);
    const reasoning_summary = generateReasoningSummary(
      evidenceArray,
      `analise do tenant ${tenantName}`,
      'Correlacao automatica de metricas, jobs e alertas realizada pela IA.'
    );

    // Mapear para formato do banco de dados com Evidence Pack
    return parsedInsights.map((insight: Record<string, unknown>) => ({
      tenant_id: tenantId,
      insight_type: insight.insight_type,
      severity: insight.severity,
      title: insight.title || '',
      description: insight.description || '',
      evidence: {
        // Legacy format for backward compatibility
        failureRate,
        avgCpuUsage,
        avgMemoryUsage,
        problematicJobsCount: data.problematicJobs.length,
        systemAlertsCount: data.systemAlerts.length,
        analysisDate: new Date().toISOString(),
        // Evidence Pack - TOP 5% Global
        evidence_pack: evidenceArray,
        data_sources,
        reasoning_summary,
      },
      recommendation: insight.recommendation || '',
      confidence_score: insight.confidence_score || confidence,
    }));

  } catch (error) {
    logger.error('[ai-system-analyzer] Error in AI analysis:', error);
    return [];
  }
}

// FASE 2: Funcao para gerar acoes sugeridas baseadas em insights
async function generateSuggestedActions(insights: Array<Record<string, unknown>>) {
  const actions: Array<Record<string, unknown>> = [];

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

