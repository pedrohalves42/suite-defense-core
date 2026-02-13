import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { AIPromptRegistry, logPromptUsage } from "../_shared/ai-prompt-registry.ts";
import { safeParseJSON, createFallbackAudit, createFallbackRedTeam } from "../_shared/json-parser.ts";
import { callAI, type AIMessage } from "../_shared/ai-provider-helper.ts";

/**
 * AI Full Audit Orchestrator v2.1
 * 
 * Executes audits in anti-bias order:
 * 1. Red Team (adversarial, no prior context)
 * 2. Ana (with red_team_handoff context)
 * 3. Confidence Gap calculation
 * 
 * Score Governance (5 layers):
 * - Layer 1: Weighted Moving Average (50/30/20)
 * - Layer 2: Red Team as Risk Factor (not absolute judge)
 * - Layer 3: Variation Guardrail (±10 max)
 * - Layer 4: Binary Criteria for threat_level (deterministic)
 * - Layer 5: Market Score (conservative smoothing)
 * 
 * v2.2: Migrated to multi-provider AI routing via ai-provider-helper.ts
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Calculate deterministic base score from metrics (no LLM variance)
 * 
 * REGRA 1: Não penalizar se aiActions.total === 0 (IA ainda não usada)
 * REGRA 2: Só penalizar se HOUVE execução SEM aprovação
 * REGRA 3: Revisão humana só exigida em volume significativo
 * REGRA 4: Rollback = 0 NÃO é penalidade (nunca precisou reverter)
 */
function calculateDeterministicScore(metrics: any): number {
  let score = 70;
  
  const agents = metrics?.agents || {};
  const aiActions = metrics?.ai_actions || {};
  const dlq = metrics?.dlq || {};
  const criticalAlerts = metrics?.critical_alerts || {};
  const users = metrics?.users || {};
  const alerts = metrics?.alerts || {};
  
  if (agents.offline > 0) score -= Math.min(agents.offline * 5, 15);
  if (aiActions.total > 0 && (aiActions.approval_rate || 0) === 0) score -= 15;
  if (aiActions.total > 10 && (aiActions.human_reviewed || 0) === 0) score -= 10;
  if ((users.count || 0) <= 1) score -= 2;
  if (dlq.current > 0) score -= Math.min(dlq.current * 5, 10);
  if (criticalAlerts.open > 0) score -= Math.min(criticalAlerts.open * 3, 9);
  
  if (alerts.decision_coverage_percent === 100) score += 5;
  if (metrics?.evidence_chain?.healthy === true) score += 5;
  if ((aiActions.shadow_validation_rate || 0) > 50) score += 3;
  if (dlq.resolution_rate === 100) score += 3;
  if (aiActions.total > 0 && aiActions.approval_rate === 100) score += 5;
  if (aiActions.total > 0 && aiActions.human_reviewed === aiActions.total) score += 3;
  
  return Math.max(20, Math.min(100, score));
}

function calculateRiskFactor(redScore: number): number {
  return Math.max(0.7, 1 - (redScore / 333));
}

function calculateBinaryCriteria(metrics: any): Record<string, boolean> {
  const agents = metrics?.agents || {};
  const aiActions = metrics?.ai_actions || {};
  const rollbacks = metrics?.rollbacks || {};
  const users = metrics?.users || {};
  const dlq = metrics?.dlq || {};
  const criticalAlerts = metrics?.critical_alerts || {};

  return {
    offline_agents_exist: (agents.offline || 0) > 0,
    human_approval_rate_zero: (aiActions.approval_rate || 0) === 0 || (aiActions.approved || 0) === 0,
    human_reviewed_zero: (aiActions.human_reviewed || 0) === 0,
    rollback_never_tested: (rollbacks.total || 0) === 0,
    single_user_system: (users.count || 0) <= 1,
    dlq_has_items: (dlq.current || 0) > 0,
    critical_alerts_open: (criticalAlerts.open || 0) > 0,
  };
}

function getDeterministicThreatLevel(criteriaCountTrue: number): string {
  if (criteriaCountTrue >= 4) return 'critical';
  if (criteriaCountTrue === 3) return 'high';
  if (criteriaCountTrue === 2) return 'medium';
  return 'low';
}

async function logGovernanceEvent(
  supabase: any,
  tenantId: string,
  auditId: string | null,
  eventType: string,
  previousValue: number | null,
  newValue: number,
  ruleApplied: string,
  justification: string,
  metadata: any = {}
): Promise<void> {
  try {
    await supabase.from('score_governance_log').insert({
      tenant_id: tenantId,
      audit_id: auditId,
      event_type: eventType,
      previous_value: previousValue,
      new_value: newValue,
      delta: previousValue !== null ? newValue - previousValue : null,
      rule_applied: ruleApplied,
      justification: justification,
      metadata: metadata,
    });
  } catch (err) {
    console.warn('[ai-full-audit] Failed to log governance event:', err);
  }
}

/**
 * Check if AI failure is due to credits/rate limiting
 */
function isCreditsExhausted(error?: string): boolean {
  if (!error) return false;
  return error.includes('402') || error.toLowerCase().includes('credits') || error.includes('All AI providers failed');
}

function isRateLimited(error?: string): boolean {
  if (!error) return false;
  return error.includes('429') || error.toLowerCase().includes('rate limit');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Service client for admin operations (inserts, updates)
    const serviceClient = createClient(supabaseUrl, supabaseKey);

    // Check for internal call via X-Internal-Secret (ADR-023)
    const internalSecret = req.headers.get('X-Internal-Secret');
    const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('Authorization');
    
    let tenantId: string | null = null;
    let userClient = serviceClient;
    let isInternalCall = false;

    if (internalSecret && INTERNAL_FUNCTION_SECRET && internalSecret === INTERNAL_FUNCTION_SECRET) {
      isInternalCall = true;
      console.log('[ai-full-audit] Internal call detected');
      
      try {
        const body = await req.clone().json();
        tenantId = body.tenant_id;
      } catch {
        const url = new URL(req.url);
        tenantId = url.searchParams.get('tenant_id');
      }
      
      if (!tenantId) {
        const { data: tenants } = await serviceClient.from('tenants').select('id').limit(1);
        tenantId = tenants?.[0]?.id;
      }
      
      console.log('[ai-full-audit] Internal call for tenant:', tenantId);
    } else if (authHeader) {
      userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await serviceClient.auth.getUser(token);
      
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const requestedTenantId = req.headers.get('x-tenant-id');
      console.log(`[ai-full-audit] Requested tenant from header: ${requestedTenantId || 'not provided'}`);

      const { data: userRoles } = await serviceClient
        .from('user_roles')
        .select('tenant_id, role')
        .eq('user_id', user.id);

      const adminRole = userRoles?.find(r => ['admin', 'super_admin'].includes(r.role));
      if (!adminRole) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      tenantId = adminRole.tenant_id;
      if (requestedTenantId) {
        const hasAccessToRequested = userRoles?.some(r => r.tenant_id === requestedTenantId);
        if (hasAccessToRequested) {
          tenantId = requestedTenantId;
          console.log(`[ai-full-audit] Using requested tenant: ${tenantId}`);
        } else {
          console.warn(`[ai-full-audit] User does not have access to requested tenant ${requestedTenantId}, using ${tenantId}`);
        }
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'Tenant ID not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[ai-full-audit] Starting FULL audit v2.2 for tenant ${tenantId} (Red → Ana → Gap) [multi-provider]`);

    // Get metrics using userClient (so auth.uid() works in RPC)
    const { data: metrics, error: metricsError } = await userClient
      .rpc('get_audit_raw_metrics', { p_tenant_id: tenantId });

    if (metricsError) {
      console.error('Error fetching metrics:', metricsError);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch system metrics',
          stage: 'metrics',
          details: {
            code: metricsError.code ?? 'unknown',
            message: metricsError.message ?? 'unknown error'
          }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============ PHASE 1: RED TEAM (FIRST - NO BIAS) ============
    console.log('[ai-full-audit] Phase 1: Running Red Team assessment...');

    const redPersona = await AIPromptRegistry.getPromptWithMetadata('red-team-persona');
    const redTemplate = await AIPromptRegistry.getPromptWithMetadata('red-team-analysis-template');

    if (!redPersona || !redTemplate) {
      return new Response(
        JSON.stringify({ error: 'Red Team prompt configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logPromptUsage('red-team-persona', redPersona.hash, tenantId, 'ai-full-audit', { phase: 1 });
    logPromptUsage('red-team-analysis-template', redTemplate.hash, tenantId, 'ai-full-audit', { phase: 1 });

    // Red Team runs WITHOUT Ana summary (anti-bias)
    const redPrompt = redTemplate.content
      .replace('{metrics}', JSON.stringify(metrics, null, 2))
      .replace('{ana_summary}', 'Nenhuma análise Ana disponível - executando Red Team primeiro para evitar viés otimista.');

    // Red Team AI call via multi-provider
    const redMessages: AIMessage[] = [
      { role: 'system', content: redPersona.content },
      { role: 'user', content: redPrompt }
    ];

    const redAiResult = await callAI(redMessages, {
      maxTokens: 8192,
      functionName: 'ai-full-audit-red-team',
      tenantId,
    });

    // Handle Red Team AI failure with graceful fallback
    if (!redAiResult.success || !redAiResult.content) {
      console.error('[ai-full-audit] Red Team AI failed:', redAiResult.error);

      if (isCreditsExhausted(redAiResult.error)) {
        console.warn('[ai-full-audit] AI unavailable. Returning deterministic audit result.');
        
        const fallbackCriteria = calculateBinaryCriteria(metrics);
        const criteriaCount = Object.values(fallbackCriteria).filter(Boolean).length;
        const deterministicThreatLevel = getDeterministicThreatLevel(criteriaCount);
        const deterministicRedScore = Math.min(100, criteriaCount * 15);
        const deterministicScore = calculateDeterministicScore(metrics);
        
        await logGovernanceEvent(
          serviceClient, tenantId, null, 'ai_providers_unavailable',
          null, deterministicRedScore, 'deterministic_fallback',
          'Todos os provedores de IA falharam. Usando análise determinística completa.',
          { criteria_count: criteriaCount, threat_level: deterministicThreatLevel, deterministic_score: deterministicScore, error: redAiResult.error }
        );
        
        return new Response(
          JSON.stringify({
            success: true,
            audit_id: null,
            overall_score: deterministicScore,
            market_score: Math.round(deterministicScore * 0.9),
            threat_level: deterministicThreatLevel,
            red_score: deterministicRedScore,
            confidence_gap: 0,
            is_deterministic: true,
            fallback_reason: 'AI_PROVIDERS_UNAVAILABLE',
            binary_criteria: fallbackCriteria,
            governance_applied: ['deterministic_fallback'],
            executive_summary: `Análise determinística: Score ${deterministicScore}/100 baseado em métricas. ${criteriaCount} critérios de risco identificados. Provedores de IA indisponíveis.`,
            recommendation: criteriaCount >= 3 ? 'Ação imediata requerida' : criteriaCount >= 2 ? 'Atenção recomendada' : 'Sistema operando normalmente',
            tokens_used: 0,
            warning: 'AI providers unavailable. Deterministic fallback audit based on metrics only.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (isRateLimited(redAiResult.error)) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.', stage: 'red_team', retry_after: 60 }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Red Team analysis failed', stage: 'red_team', details: redAiResult.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const redContent = redAiResult.content;
    const redTokens = redAiResult.tokensUsed?.total || 0;

    // Parse Red Team response with robust stream-safe parser
    let redResult: any;
    let redTeamFallbackUsed = false;
    try {
      redResult = safeParseJSON(redContent, 'red-team');
    } catch (parseError) {
      console.error('[ai-full-audit] Red Team parse failed, using fallback');
      
      const fallbackCriteria = calculateBinaryCriteria(metrics);
      redResult = createFallbackRedTeam('AI_JSON_PARSE_ERROR', fallbackCriteria);
      redTeamFallbackUsed = true;
      
      await logGovernanceEvent(
        serviceClient, tenantId, null, 'red_team_fallback',
        null, 50, 'parse_error',
        'Red Team JSON parse falhou, usando fallback determinístico',
        { error: (parseError as Error).message, content_length: redContent.length }
      );
    }

    // ============ BINARY CRITERIA FALLBACK ============
    let binaryCriteria = redResult.binary_criteria || {};
    let binaryCriteriaFallbackUsed = false;
    
    if (Object.keys(binaryCriteria).length < 7) {
      console.warn('[ai-full-audit] Red Team binary_criteria incomplete, calculating fallback');
      binaryCriteria = calculateBinaryCriteria(metrics);
      redResult.binary_criteria = binaryCriteria;
      binaryCriteriaFallbackUsed = true;
      
      await logGovernanceEvent(
        serviceClient, tenantId, null, 'binary_criteria_fallback',
        null, Object.values(binaryCriteria).filter((v: unknown) => v === true).length,
        'llm_fallback', 'LLM não retornou binary_criteria completo, usando cálculo determinístico',
        { original_criteria: redResult.binary_criteria, calculated: binaryCriteria }
      );
    }
    
    const criteriaCountTrue = Object.values(binaryCriteria).filter((v: unknown) => v === true).length;
    redResult.criteria_count_true = criteriaCountTrue;
    
    const expectedThreatLevel = getDeterministicThreatLevel(criteriaCountTrue);
    if (redResult.threat_level !== expectedThreatLevel) {
      console.warn(`[ai-full-audit] threat_level mismatch: LLM=${redResult.threat_level}, criteria=${expectedThreatLevel}. Correcting.`);
      redResult.threat_level = expectedThreatLevel;
    }
    
    // Save Red Team result
    const redPromptHash = `${redPersona.hash.slice(0, 8)}-${redTemplate.hash.slice(0, 8)}`;
    
    const { data: savedRed, error: redSaveError } = await serviceClient
      .from('red_team_assessments')
      .insert({
        tenant_id: tenantId,
        threat_level: redResult.threat_level,
        red_score: redResult.red_score || 50,
        attack_vectors: redResult.attack_vectors || [],
        residual_risks: redResult.residual_risks || [],
        threat_system_identity: redResult.dimension_threats?.system_identity,
        threat_governance: redResult.dimension_threats?.governance,
        threat_evidence_proof: redResult.dimension_threats?.evidence_proof,
        threat_human_oversight: redResult.dimension_threats?.human_oversight,
        threat_operational_resilience: redResult.dimension_threats?.operational_resilience,
        threat_cross_tenant_isolation: redResult.dimension_threats?.cross_tenant_isolation,
        threat_transparency_explainability: redResult.dimension_threats?.transparency_explainability,
        threat_compliance_alignment: redResult.dimension_threats?.compliance_alignment,
        threat_market_trust: redResult.dimension_threats?.market_trust,
        executive_threat_summary: redResult.executive_threat_summary,
        worst_case_scenario: redResult.worst_case_scenario,
        recommended_hardening: redResult.recommended_hardening || [],
        ai_model: redAiResult.model,
        ai_prompt_hash: redPromptHash,
        ai_response_raw: redResult,
        metrics_snapshot: metrics,
        binary_criteria: binaryCriteria,
        criteria_count_true: criteriaCountTrue,
      })
      .select()
      .single();

    if (redSaveError) {
      console.error('Error saving Red Team:', redSaveError);
    }
    
    console.log(`[ai-full-audit] Phase 1 complete. Red Score: ${redResult.red_score}, Threat: ${redResult.threat_level}, Provider: ${redAiResult.provider}, Criteria TRUE: ${criteriaCountTrue}`);

    // ============ PHASE 2: ANA (WITH RED TEAM CONTEXT) ============
    console.log('[ai-full-audit] Phase 2: Running Ana audit with Red Team handoff...');

    const anaPersona = await AIPromptRegistry.getPromptWithMetadata('ana-auditor-persona');
    const anaTemplate = await AIPromptRegistry.getPromptWithMetadata('ana-analysis-template');

    if (!anaPersona || !anaTemplate) {
      return new Response(
        JSON.stringify({ error: 'Ana prompt configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logPromptUsage('ana-auditor-persona', anaPersona.hash, tenantId, 'ai-full-audit', { phase: 2 });
    logPromptUsage('ana-analysis-template', anaTemplate.hash, tenantId, 'ai-full-audit', { phase: 2 });

    // Build Ana prompt with RED TEAM CONTEXT
    const redTeamContext = `
CONTEXTO RED TEAM (para calibrar sua análise):
- Red Score: ${redResult.red_score}/100 (quanto maior, mais vulnerável)
- Threat Level: ${redResult.threat_level}
- Principais vetores de ataque identificados: ${redResult.attack_vectors?.slice(0, 3).map((v: any) => v.name).join(', ') || 'nenhum'}
- Pior cenário: ${redResult.worst_case_scenario || 'não especificado'}
- Challenge à análise otimista: ${redResult.challenge_to_ana || 'nenhum'}

INSTRUÇÃO: Considere esses riscos ao avaliar. Seu score deve refletir consciência das ameaças.
`;

    const anaPrompt = anaTemplate.content.replace('{metrics}', JSON.stringify(metrics, null, 2) + '\n\n' + redTeamContext);

    // Ana AI call via multi-provider
    const anaMessages: AIMessage[] = [
      { role: 'system', content: anaPersona.content },
      { role: 'user', content: anaPrompt }
    ];

    const anaAiResult = await callAI(anaMessages, {
      maxTokens: 8192,
      functionName: 'ai-full-audit-ana',
      tenantId,
    });

    // Handle Ana AI failure
    if (!anaAiResult.success || !anaAiResult.content) {
      console.error('[ai-full-audit] Ana AI failed:', anaAiResult.error);

      if (isCreditsExhausted(anaAiResult.error)) {
        console.warn('[ai-full-audit] AI unavailable at Ana phase. Returning deterministic result with Red Team.');
        
        const deterministicScore = calculateDeterministicScore(metrics);
        const deterministicThreatLevel = getDeterministicThreatLevel(criteriaCountTrue);
        
        await logGovernanceEvent(
          serviceClient, tenantId, null, 'ai_unavailable_ana_phase',
          null, deterministicScore, 'deterministic_fallback',
          'Provedores de IA indisponíveis na fase Ana. Usando resultado determinístico com Red Team já executado.',
          { criteria_count: criteriaCountTrue, red_score: redResult.red_score }
        );
        
        return new Response(
          JSON.stringify({
            success: true,
            audit_id: null,
            overall_score: deterministicScore,
            market_score: Math.round(deterministicScore * 0.9),
            threat_level: deterministicThreatLevel,
            red_score: redResult.red_score,
            confidence_gap: 0,
            is_deterministic: true,
            fallback_reason: 'AI_UNAVAILABLE_ANA_PHASE',
            binary_criteria: binaryCriteria,
            red_team_completed: true,
            governance_applied: ['deterministic_fallback', 'red_team_completed'],
            executive_summary: `Análise parcial: Red Team executado (score ${redResult.red_score}). Ana não executada - provedores indisponíveis. Score determinístico: ${deterministicScore}/100.`,
            recommendation: criteriaCountTrue >= 3 ? 'Ação imediata requerida' : criteriaCountTrue >= 2 ? 'Atenção recomendada' : 'Sistema operando normalmente',
            tokens_used: redTokens,
            warning: 'AI unavailable during Ana phase. Red Team completed. Check provider configuration.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (isRateLimited(anaAiResult.error)) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.', stage: 'ana', retry_after: 60 }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Ana analysis failed', stage: 'ana', details: anaAiResult.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anaContent = anaAiResult.content;
    const anaTokens = anaAiResult.tokensUsed?.total || 0;

    // Parse Ana response with robust stream-safe parser
    let anaResult: any;
    let anaFallbackUsed = false;
    try {
      anaResult = safeParseJSON(anaContent, 'ana');
    } catch (parseError) {
      console.error('[ai-full-audit] Ana parse failed, using fallback');
      
      anaResult = createFallbackAudit('AI_JSON_PARSE_ERROR');
      anaFallbackUsed = true;
      
      await logGovernanceEvent(
        serviceClient, tenantId, null, 'ana_fallback',
        null, 50, 'parse_error',
        'Ana JSON parse falhou, usando fallback com score neutro',
        { error: (parseError as Error).message, content_length: anaContent.length }
      );
    }

    // ============ SCORE GOVERNANCE: Guardrails + Moving Average ============
    console.log('[ai-full-audit] Applying score governance v2.0...');
    
    const deterministicBaseScore = calculateDeterministicScore(metrics);
    console.log(`[ai-full-audit] Deterministic base score: ${deterministicBaseScore}`);
    
    await logGovernanceEvent(
      serviceClient, tenantId, null, 'deterministic_base_applied',
      null, deterministicBaseScore, 'fixed_rules',
      'Base score calculada com regras determinísticas das métricas',
      { metrics_used: ['agents', 'ai_actions', 'rollbacks', 'users', 'dlq', 'critical_alerts'] }
    );
    
    const redRiskFactor = calculateRiskFactor(redResult.red_score);
    console.log(`[ai-full-audit] Red risk factor: ${redRiskFactor.toFixed(3)}`);
    
    await logGovernanceEvent(
      serviceClient, tenantId, null, 'risk_factor_applied',
      null, redRiskFactor * 100, 'red_team_adjustment',
      `Red score ${redResult.red_score} → fator ${redRiskFactor.toFixed(3)}`,
      { red_score: redResult.red_score, threat_level: redResult.threat_level }
    );
    
    const { data: prevAuditData, error: rpcError } = await serviceClient
      .rpc('get_previous_audit_score', { p_tenant_id: tenantId });
    
    if (rpcError) {
      console.warn('[ai-full-audit] RPC get_previous_audit_score failed:', rpcError.message);
    }
    
    const rawScore = anaResult.overall_score;
    const previousScore = prevAuditData?.[0]?.previous_score ?? rawScore;
    const avgLast3 = prevAuditData?.[0]?.avg_last_3 ?? rawScore;
    const avgLast7 = prevAuditData?.[0]?.avg_last_7 ?? rawScore;
    
    console.log(`[ai-full-audit] Historical scores: prev=${previousScore}, avg3=${avgLast3}, avg7=${avgLast7} (fallback: ${!prevAuditData?.[0]})`);
    
    const rawDelta = rawScore - previousScore;
    let guardedScore = rawScore;
    let guardrailApplied = false;
    let guardrailReason: string | null = null;
    
    if (Math.abs(rawDelta) > 10) {
      const maxDelta = rawDelta > 0 ? 10 : -10;
      guardedScore = previousScore + maxDelta;
      guardrailApplied = true;
      guardrailReason = `Delta original ${rawDelta} limitado a ${maxDelta} (score anterior: ${previousScore})`;
      console.log(`[ai-full-audit] GUARDRAIL APPLIED: ${rawScore} -> ${guardedScore} (delta ${rawDelta} > 10)`);
      
      await logGovernanceEvent(
        serviceClient, tenantId, null, 'guardrail_applied',
        rawScore, guardedScore, 'max_delta_10',
        guardrailReason,
        { raw_delta: rawDelta, previous_score: previousScore }
      );
    }
    
    await logGovernanceEvent(
      serviceClient, tenantId, null, 'raw_score_calculated',
      null, rawScore, 'llm_evaluation',
      'Score bruto retornado pelo LLM Ana',
      { model: anaAiResult.model, provider: anaAiResult.provider, tokens: anaTokens }
    );
    
    let officialScore = Math.round(
      0.5 * guardedScore +
      0.3 * avgLast3 +
      0.2 * avgLast7
    );
    
    await logGovernanceEvent(
      serviceClient, tenantId, null, 'moving_average_applied',
      guardedScore, officialScore, 'weighted_avg_50_30_20',
      `50% guarded(${guardedScore}) + 30% avg3(${avgLast3}) + 20% avg7(${avgLast7})`,
      { weights: { current: 0.5, avg_3: 0.3, avg_7: 0.2 } }
    );
    
    let marketScore = Math.round(
      0.3 * guardedScore +
      0.4 * avgLast3 +
      0.3 * avgLast7
    );
    
    let marketFloorApplied = false;
    if (marketScore < 40 && avgLast3 > 50) {
      const originalMarket = marketScore;
      marketScore = 50;
      marketFloorApplied = true;
      console.log('[ai-full-audit] Market score floor applied (40 < market && avg3 > 50)');
      
      await logGovernanceEvent(
        serviceClient, tenantId, null, 'market_score_calculated',
        originalMarket, marketScore, 'floor_protection',
        'Market score protegido contra queda brusca (avg3 > 50)',
        { original: originalMarket, floor_triggered: true }
      );
    } else {
      await logGovernanceEvent(
        serviceClient, tenantId, null, 'market_score_calculated',
        officialScore, marketScore, 'conservative_smoothing',
        `30% guarded + 40% avg3 + 30% avg7`,
        { weights: { current: 0.3, avg_3: 0.4, avg_7: 0.3 } }
      );
    }
    
    console.log(`[ai-full-audit] Scores: raw=${rawScore}, guarded=${guardedScore}, official=${officialScore}, market=${marketScore}`);
    
    // Save Ana result with governance data
    const anaPromptHash = `${anaPersona.hash.slice(0, 8)}-${anaTemplate.hash.slice(0, 8)}`;
    
    const dimensionMapping: Record<string, { scoreCol: string; analysisCol: string }> = {
      'system_identity': { scoreCol: 'score_system_identity', analysisCol: 'analysis_system_identity' },
      'governance': { scoreCol: 'score_control_vs_monitor', analysisCol: 'analysis_control_vs_monitor' },
      'evidence_proof': { scoreCol: 'score_evidence_proof', analysisCol: 'analysis_evidence_proof' },
      'human_oversight': { scoreCol: 'score_maturity', analysisCol: 'analysis_maturity' },
      'operational_resilience': { scoreCol: 'score_failure_handling', analysisCol: 'analysis_failure_handling' },
      'cross_tenant_isolation': { scoreCol: 'score_limitations', analysisCol: 'analysis_limitations' },
      'transparency_explainability': { scoreCol: 'score_operational_trust', analysisCol: 'analysis_operational_trust' },
      'compliance_alignment': { scoreCol: 'score_market_value', analysisCol: 'analysis_market_value' },
      'market_trust': { scoreCol: 'score_simplicity', analysisCol: 'analysis_simplicity' },
    };

    const insertData: Record<string, any> = {
      tenant_id: tenantId,
      created_by: isInternalCall ? null : null,
      overall_score: guardedScore,
      raw_score: rawScore,
      official_score: officialScore,
      market_score: marketScore,
      deterministic_base_score: deterministicBaseScore,
      red_risk_factor: redRiskFactor,
      guardrail_applied: guardrailApplied,
      guardrail_reason: guardrailReason,
      executive_summary: anaResult.executive_summary,
      final_sentence: anaResult.final_sentence,
      recommendation: anaResult.recommendation,
      metrics_snapshot: metrics,
      ai_model: anaAiResult.model,
      prompt_hash: anaPromptHash,
      tokens_used: anaTokens,
      evidence_basis: anaResult.evidence_basis || [],
      falsification_criteria: anaResult.falsification_criteria || [],
    };

    for (const [dimKey, mapping] of Object.entries(dimensionMapping)) {
      const dim = anaResult.dimensions?.[dimKey];
      if (dim) {
        insertData[mapping.scoreCol] = dim.score;
        insertData[mapping.analysisCol] = dim.analysis;
      }
    }

    const { data: savedAna, error: anaSaveError } = await serviceClient
      .from('system_audits')
      .insert(insertData)
      .select()
      .single();

    if (anaSaveError) {
      console.error('Error saving Ana audit:', anaSaveError);
    }

    console.log(`[ai-full-audit] Phase 2 complete. Raw: ${rawScore}, Official: ${officialScore}, Market: ${marketScore}, Providers: Red=${redAiResult.provider}, Ana=${anaAiResult.provider}`);

    // ============ PHASE 3: CONFIDENCE GAP ============
    console.log('[ai-full-audit] Phase 3: Calculating Confidence Gap...');

    const anaScore = anaResult.overall_score;
    const redScore = redResult.red_score;
    const gap = anaScore - redScore;

    let healthStatus: 'healthy' | 'attention' | 'critical';
    if (gap > 40) {
      healthStatus = 'healthy';
    } else if (gap >= 20) {
      healthStatus = 'attention';
    } else {
      healthStatus = 'critical';
    }

    const { data: prevGap } = await serviceClient
      .from('audit_confidence_gaps')
      .select('confidence_gap')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const previousGap = prevGap?.confidence_gap || null;
    const gapDelta = previousGap !== null ? gap - previousGap : null;

    const dimensionGaps: Record<string, number> = {};
    const dims = ['system_identity', 'governance', 'evidence_proof', 'human_oversight', 
                  'operational_resilience', 'cross_tenant_isolation', 'transparency_explainability',
                  'compliance_alignment', 'market_trust'];
    
    for (const dim of dims) {
      const aDimScore = anaResult.dimensions?.[dim]?.score || 0;
      const redThreat = redResult.dimension_threats?.[dim] || 0;
      dimensionGaps[dim] = aDimScore - redThreat;
    }

    let alertTriggered = false;
    let alertReason: string | null = null;

    if (healthStatus === 'critical') {
      alertTriggered = true;
      alertReason = `Gap crítico: ${gap} pontos. Risco elevado de compromisso.`;
    } else if (gapDelta !== null && gapDelta < -10) {
      alertTriggered = true;
      alertReason = `Degradação significativa: gap caiu ${Math.abs(gapDelta)} pontos.`;
    }

    const { data: savedGap, error: gapSaveError } = await serviceClient
      .from('audit_confidence_gaps')
      .insert({
        tenant_id: tenantId,
        audit_id: savedAna?.id,
        red_team_id: savedRed?.id,
        ana_score: anaScore,
        red_score: redScore,
        confidence_gap: gap,
        health_status: healthStatus,
        previous_gap: previousGap,
        gap_delta: gapDelta,
        alert_triggered: alertTriggered,
        alert_reason: alertReason,
        dimension_gaps: dimensionGaps,
      })
      .select()
      .single();

    if (gapSaveError) {
      console.error('Error saving confidence gap:', gapSaveError);
    }

    console.log(`[ai-full-audit] Phase 3 complete. Gap: ${gap} (${healthStatus}), Alert: ${alertTriggered}`);
    console.log(`[ai-full-audit] FULL AUDIT v2.2 COMPLETE. Total tokens: ${redTokens + anaTokens}, Providers: Red=${redAiResult.provider}, Ana=${anaAiResult.provider}`);

    return new Response(
      JSON.stringify({
        success: true,
        version: '2.2',
        execution_order: 'red_team → ana → gap',
        
        // Phase 1: Red Team
        red_team: {
          assessment_id: savedRed?.id,
          threat_level: redResult.threat_level,
          red_score: redResult.red_score,
          attack_vectors_count: redResult.attack_vectors?.length || 0,
          tokens_used: redTokens,
          binary_criteria: binaryCriteria,
          criteria_count_true: criteriaCountTrue,
          binary_criteria_fallback_used: binaryCriteriaFallbackUsed,
          ai_provider: redAiResult.provider,
          ai_model: redAiResult.model,
        },
        
        // Phase 2: Ana with Governance
        ana: {
          audit_id: savedAna?.id,
          raw_score: rawScore,
          guarded_score: guardedScore,
          official_score: officialScore,
          market_score: marketScore,
          deterministic_base_score: deterministicBaseScore,
          red_risk_factor: redRiskFactor,
          guardrail_applied: guardrailApplied,
          guardrail_reason: guardrailReason,
          market_floor_applied: marketFloorApplied,
          recommendation: anaResult.recommendation,
          falsification_count: anaResult.falsification_criteria?.length || 0,
          tokens_used: anaTokens,
          ai_provider: anaAiResult.provider,
          ai_model: anaAiResult.model,
        },
        
        // Phase 3: Confidence Gap
        confidence_gap: {
          gap_id: savedGap?.id,
          ana_score: guardedScore,
          red_score: redScore,
          gap: guardedScore - redScore,
          health_status: healthStatus,
          gap_delta: gapDelta,
          alert_triggered: alertTriggered,
          alert_reason: alertReason,
        },
        
        // Score Governance Summary
        governance: {
          previous_score: previousScore,
          avg_last_3: avgLast3,
          avg_last_7: avgLast7,
          guardrail_max_delta: 10,
          variance_reduced: guardrailApplied,
          fallback_used: !prevAuditData?.[0],
        },
        
        // Summary
        total_tokens: redTokens + anaTokens,
        prompt_versions: {
          red_persona: redPersona.version,
          red_template: redTemplate.version,
          ana_persona: anaPersona.version,
          ana_template: anaTemplate.version,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ai-full-audit] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
