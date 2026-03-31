import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { AIPromptRegistry, logPromptUsage } from "../_shared/ai-prompt-registry.ts";
import { safeParseJSON, createFallbackAudit, createFallbackRedTeam } from "../_shared/json-parser.ts";
import { callAI, type AIMessage } from "../_shared/ai-provider-helper.ts";
import { serveTenant } from '../_shared/serve-tenant.ts';
import { requireEnv } from '../_shared/env.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

import {
  calculateDeterministicScore, calculateRiskFactor, calculateBinaryCriteria,
  getDeterministicThreatLevel, isCreditsExhausted, isRateLimited, logGovernanceEvent,
} from './helpers.ts';

serveTenant(async (req, ctx) => {
  const origin = req.headers.get("origin");
  const { supabase: serviceClient, tenantId, userId, isInternal, requestId } = ctx;

  logger.info(`[ai-full-audit] Starting FULL audit v2.3 for tenant ${tenantId} [requestId: ${requestId}]`);

  let userClient = serviceClient;
  if (!isInternal) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      userClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
        global: { headers: { Authorization: authHeader } },
      });
    }
  }

  const { data: metrics, error: metricsError } = await userClient.rpc('get_audit_raw_metrics', { p_tenant_id: tenantId });
  if (metricsError) {
    logger.error('Error fetching metrics:', metricsError);
    return new Response(JSON.stringify({ error: 'Failed to fetch system metrics', stage: 'metrics', details: { code: metricsError.code ?? 'unknown', message: metricsError.message ?? 'unknown error' } }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  // ============ PHASE 1: RED TEAM ============
  logger.info('[ai-full-audit] Phase 1: Running Red Team assessment...');
  const redPersona = await AIPromptRegistry.getPromptWithMetadata('red-team-persona');
  const redTemplate = await AIPromptRegistry.getPromptWithMetadata('red-team-analysis-template');
  if (!redPersona || !redTemplate) {
    return new Response(JSON.stringify({ error: 'Red Team prompt configuration error' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  logPromptUsage('red-team-persona', redPersona.hash, tenantId, 'ai-full-audit', { phase: 1 });
  logPromptUsage('red-team-analysis-template', redTemplate.hash, tenantId, 'ai-full-audit', { phase: 1 });

  const redPrompt = redTemplate.content.replace('{metrics}', JSON.stringify(metrics, null, 2)).replace('{ana_summary}', 'Nenhuma analise Ana disponivel - executando Red Team primeiro para evitar vies otimista.');
  const redMessages: AIMessage[] = [{ role: 'system', content: redPersona.content }, { role: 'user', content: redPrompt }];
  const redAiResult = await callAI(redMessages, { maxTokens: 8192, functionName: 'ai-full-audit-red-team', tenantId });

  if (!redAiResult.success || !redAiResult.content) {
    logger.error('[ai-full-audit] Red Team AI failed:', redAiResult.error);
    if (isCreditsExhausted(redAiResult.error)) {
      const fallbackCriteria = calculateBinaryCriteria(metrics);
      const criteriaCount = Object.values(fallbackCriteria).filter(Boolean).length;
      const deterministicScore = calculateDeterministicScore(metrics);
      await logGovernanceEvent(serviceClient, tenantId, null, 'ai_providers_unavailable', null, Math.min(100, criteriaCount * 15), 'deterministic_fallback', 'Todos os provedores de IA falharam.', { criteria_count: criteriaCount, deterministic_score: deterministicScore, error: redAiResult.error });
      return new Response(JSON.stringify({ success: true, audit_id: null, overall_score: deterministicScore, market_score: Math.round(deterministicScore * 0.9), threat_level: getDeterministicThreatLevel(criteriaCount), red_score: Math.min(100, criteriaCount * 15), confidence_gap: 0, is_deterministic: true, fallback_reason: 'AI_PROVIDERS_UNAVAILABLE', binary_criteria: fallbackCriteria, tokens_used: 0, warning: 'AI providers unavailable. Deterministic fallback audit.' }),
        { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    if (isRateLimited(redAiResult.error)) return new Response(JSON.stringify({ error: 'Rate limit exceeded.', stage: 'red_team', retry_after: 60 }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ error: 'Red Team analysis failed', stage: 'red_team', details: redAiResult.error }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  const redTokens = redAiResult.tokensUsed?.total || 0;
  let redResult: Record<string, unknown> | null = null;
  let redTeamFallbackUsed = false;
  try { redResult = safeParseJSON(redAiResult.content, 'red-team'); } catch {
    redResult = createFallbackRedTeam('AI_JSON_PARSE_ERROR', calculateBinaryCriteria(metrics));
    redTeamFallbackUsed = true;
    await logGovernanceEvent(serviceClient, tenantId, null, 'red_team_fallback', null, 50, 'parse_error', 'Red Team JSON parse falhou', {});
  }

  // Binary criteria fallback
  let binaryCriteria = (redResult!.binary_criteria || {}) as Record<string, unknown>;
  let binaryCriteriaFallbackUsed = false;
  if (Object.keys(binaryCriteria).length < 7) {
    binaryCriteria = calculateBinaryCriteria(metrics);
    redResult!.binary_criteria = binaryCriteria;
    binaryCriteriaFallbackUsed = true;
    await logGovernanceEvent(serviceClient, tenantId, null, 'binary_criteria_fallback', null, Object.values(binaryCriteria).filter((v: unknown) => v === true).length, 'llm_fallback', 'LLM nao retornou binary_criteria completo', {});
  }

  const criteriaCountTrue = Object.values(binaryCriteria).filter((v: unknown) => v === true).length;
  redResult!.criteria_count_true = criteriaCountTrue;
  const expectedThreatLevel = getDeterministicThreatLevel(criteriaCountTrue);
  if (redResult!.threat_level !== expectedThreatLevel) redResult!.threat_level = expectedThreatLevel;

  const redPromptHash = `${redPersona.hash.slice(0, 8)}-${redTemplate.hash.slice(0, 8)}`;
  const { data: savedRed } = await serviceClient.from('red_team_assessments').insert({
    tenant_id: tenantId, threat_level: redResult!.threat_level, red_score: redResult!.red_score || 50,
    attack_vectors: redResult!.attack_vectors || [], residual_risks: redResult!.residual_risks || [],
    threat_system_identity: (redResult!.dimension_threats as Record<string, unknown>)?.system_identity,
    threat_governance: (redResult!.dimension_threats as Record<string, unknown>)?.governance,
    threat_evidence_proof: (redResult!.dimension_threats as Record<string, unknown>)?.evidence_proof,
    threat_human_oversight: (redResult!.dimension_threats as Record<string, unknown>)?.human_oversight,
    threat_operational_resilience: (redResult!.dimension_threats as Record<string, unknown>)?.operational_resilience,
    threat_cross_tenant_isolation: (redResult!.dimension_threats as Record<string, unknown>)?.cross_tenant_isolation,
    threat_transparency_explainability: (redResult!.dimension_threats as Record<string, unknown>)?.transparency_explainability,
    threat_compliance_alignment: (redResult!.dimension_threats as Record<string, unknown>)?.compliance_alignment,
    threat_market_trust: (redResult!.dimension_threats as Record<string, unknown>)?.market_trust,
    executive_threat_summary: redResult!.executive_threat_summary, worst_case_scenario: redResult!.worst_case_scenario,
    recommended_hardening: redResult!.recommended_hardening || [],
    ai_model: redAiResult.model, ai_prompt_hash: redPromptHash,
    ai_response_raw: redResult, metrics_snapshot: metrics,
    binary_criteria: binaryCriteria, criteria_count_true: criteriaCountTrue,
  }).select().single();

  logger.info(`[ai-full-audit] Phase 1 complete. Red Score: ${redResult!.red_score}, Threat: ${redResult!.threat_level}, Criteria TRUE: ${criteriaCountTrue}`);

  // ============ PHASE 2: ANA ============
  logger.info('[ai-full-audit] Phase 2: Running Ana audit...');
  const anaPersona = await AIPromptRegistry.getPromptWithMetadata('ana-auditor-persona');
  const anaTemplate = await AIPromptRegistry.getPromptWithMetadata('ana-analysis-template');
  if (!anaPersona || !anaTemplate) return new Response(JSON.stringify({ error: 'Ana prompt configuration error' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });

  logPromptUsage('ana-auditor-persona', anaPersona.hash, tenantId, 'ai-full-audit', { phase: 2 });
  logPromptUsage('ana-analysis-template', anaTemplate.hash, tenantId, 'ai-full-audit', { phase: 2 });

  const redTeamContext = `\nCONTEXTO RED TEAM:\n- Red Score: ${redResult!.red_score}/100\n- Threat Level: ${redResult!.threat_level}\n- Vetores: ${(redResult!.attack_vectors as Array<Record<string, unknown>>)?.slice(0, 3).map((v) => v.name).join(', ') || 'nenhum'}\n- Pior cenario: ${redResult!.worst_case_scenario || 'nao especificado'}\n`;
  const anaPrompt = anaTemplate.content.replace('{metrics}', JSON.stringify(metrics, null, 2) + '\n\n' + redTeamContext);
  const anaMessages: AIMessage[] = [{ role: 'system', content: anaPersona.content }, { role: 'user', content: anaPrompt }];
  const anaAiResult = await callAI(anaMessages, { maxTokens: 8192, functionName: 'ai-full-audit-ana', tenantId });

  if (!anaAiResult.success || !anaAiResult.content) {
    logger.error('[ai-full-audit] Ana AI failed:', anaAiResult.error);
    if (isCreditsExhausted(anaAiResult.error)) {
      const deterministicScore = calculateDeterministicScore(metrics);
      await logGovernanceEvent(serviceClient, tenantId, null, 'ai_unavailable_ana_phase', null, deterministicScore, 'deterministic_fallback', 'Provedores indisponiveis na fase Ana.', {});
      return new Response(JSON.stringify({ success: true, audit_id: null, overall_score: deterministicScore, market_score: Math.round(deterministicScore * 0.9), threat_level: getDeterministicThreatLevel(criteriaCountTrue), red_score: redResult!.red_score, confidence_gap: 0, is_deterministic: true, fallback_reason: 'AI_UNAVAILABLE_ANA_PHASE', red_team_completed: true, tokens_used: redTokens, warning: 'AI unavailable during Ana phase.' }),
        { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    if (isRateLimited(anaAiResult.error)) return new Response(JSON.stringify({ error: 'Rate limit exceeded.', stage: 'ana', retry_after: 60 }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ error: 'Ana analysis failed', stage: 'ana', details: anaAiResult.error }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  const anaTokens = anaAiResult.tokensUsed?.total || 0;
  let anaResult: Record<string, unknown> | null = null;
  try { anaResult = safeParseJSON(anaAiResult.content, 'ana'); } catch {
    anaResult = createFallbackAudit('AI_JSON_PARSE_ERROR');
    await logGovernanceEvent(serviceClient, tenantId, null, 'ana_fallback', null, 50, 'parse_error', 'Ana JSON parse falhou', {});
  }

  // Score Governance
  const deterministicBaseScore = calculateDeterministicScore(metrics);
  const redRiskFactor = calculateRiskFactor(redResult!.red_score as number);
  await logGovernanceEvent(serviceClient, tenantId, null, 'deterministic_base_applied', null, deterministicBaseScore, 'fixed_rules', 'Base score calculada com regras deterministicas', {});
  await logGovernanceEvent(serviceClient, tenantId, null, 'risk_factor_applied', null, redRiskFactor * 100, 'red_team_adjustment', `Red score ${redResult!.red_score} → fator ${redRiskFactor.toFixed(3)}`, {});

  const { data: prevAuditData } = await serviceClient.rpc('get_previous_audit_score', { p_tenant_id: tenantId });
  const rawScore = anaResult!.overall_score as number;
  const previousScore = prevAuditData?.[0]?.previous_score ?? rawScore;
  const avgLast3 = prevAuditData?.[0]?.avg_last_3 ?? rawScore;
  const avgLast7 = prevAuditData?.[0]?.avg_last_7 ?? rawScore;

  const rawDelta = rawScore - previousScore;
  let guardedScore = rawScore;
  let guardrailApplied = false;
  let guardrailReason: string | null = null;
  if (Math.abs(rawDelta) > 10) {
    guardedScore = previousScore + (rawDelta > 0 ? 10 : -10);
    guardrailApplied = true;
    guardrailReason = `Delta original ${rawDelta} limitado a ${rawDelta > 0 ? 10 : -10}`;
    await logGovernanceEvent(serviceClient, tenantId, null, 'guardrail_applied', rawScore, guardedScore, 'max_delta_10', guardrailReason, {});
  }

  const officialScore = Math.round(0.5 * guardedScore + 0.3 * avgLast3 + 0.2 * avgLast7);
  let marketScore = Math.round(0.3 * guardedScore + 0.4 * avgLast3 + 0.3 * avgLast7);
  let marketFloorApplied = false;
  if (marketScore < 40 && avgLast3 > 50) { marketScore = 50; marketFloorApplied = true; }

  // Save Ana result
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

  // deno-lint-ignore no-explicit-any
  const insertData: Record<string, any> = {
    tenant_id: tenantId, created_by: null, overall_score: guardedScore, raw_score: rawScore,
    official_score: officialScore, market_score: marketScore, deterministic_base_score: deterministicBaseScore,
    red_risk_factor: redRiskFactor, guardrail_applied: guardrailApplied, guardrail_reason: guardrailReason,
    executive_summary: anaResult!.executive_summary, final_sentence: anaResult!.final_sentence,
    recommendation: anaResult!.recommendation, metrics_snapshot: metrics,
    ai_model: anaAiResult.model, prompt_hash: `${anaPersona.hash.slice(0, 8)}-${anaTemplate.hash.slice(0, 8)}`,
    tokens_used: anaTokens, evidence_basis: anaResult!.evidence_basis || [],
    falsification_criteria: anaResult!.falsification_criteria || [],
  };
  for (const [dimKey, mapping] of Object.entries(dimensionMapping)) {
    const dim = (anaResult!.dimensions as Record<string, Record<string, unknown>>)?.[dimKey];
    if (dim) { insertData[mapping.scoreCol] = dim.score; insertData[mapping.analysisCol] = dim.analysis; }
  }

  const { data: savedAna } = await serviceClient.from('system_audits').insert(insertData).select().single();

  // ============ PHASE 3: CONFIDENCE GAP ============
  const anaScore = anaResult!.overall_score as number;
  const redScore = redResult!.red_score as number;
  const gap = anaScore - redScore;
  const healthStatus = gap > 40 ? 'healthy' : gap >= 20 ? 'attention' : 'critical';

  const { data: prevGap } = await serviceClient.from('audit_confidence_gaps').select('confidence_gap').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1).single();
  const previousGap = prevGap?.confidence_gap || null;
  const gapDelta = previousGap !== null ? gap - previousGap : null;

  const dims = ['system_identity', 'governance', 'evidence_proof', 'human_oversight', 'operational_resilience', 'cross_tenant_isolation', 'transparency_explainability', 'compliance_alignment', 'market_trust'];
  const dimensionGaps: Record<string, number> = {};
  for (const dim of dims) {
    const aDimScore = (anaResult!.dimensions as Record<string, Record<string, number>>)?.[dim]?.score || 0;
    const redThreat = (redResult!.dimension_threats as Record<string, number>)?.[dim] || 0;
    dimensionGaps[dim] = aDimScore - redThreat;
  }

  let alertTriggered = false;
  let alertReason: string | null = null;
  if (healthStatus === 'critical') { alertTriggered = true; alertReason = `Gap critico: ${gap} pontos.`; }
  else if (gapDelta !== null && gapDelta < -10) { alertTriggered = true; alertReason = `Degradacao: gap caiu ${Math.abs(gapDelta)} pontos.`; }

  const { data: savedGap } = await serviceClient.from('audit_confidence_gaps').insert({
    tenant_id: tenantId, audit_id: savedAna?.id, red_team_id: savedRed?.id,
    ana_score: anaScore, red_score: redScore, confidence_gap: gap,
    health_status: healthStatus, previous_gap: previousGap, gap_delta: gapDelta,
    alert_triggered: alertTriggered, alert_reason: alertReason, dimension_gaps: dimensionGaps,
  }).select().single();

  logger.info(`[ai-full-audit] FULL AUDIT v2.3 COMPLETE. Gap: ${gap} (${healthStatus}), Tokens: ${redTokens + anaTokens}`);

  return new Response(JSON.stringify({
    success: true, version: '2.3', execution_order: 'red_team → ana → gap',
    red_team: { assessment_id: savedRed?.id, threat_level: redResult!.threat_level, red_score: redResult!.red_score, attack_vectors_count: (redResult!.attack_vectors as unknown[])?.length || 0, tokens_used: redTokens, binary_criteria: binaryCriteria, criteria_count_true: criteriaCountTrue, binary_criteria_fallback_used: binaryCriteriaFallbackUsed, ai_provider: redAiResult.provider, ai_model: redAiResult.model },
    ana: { audit_id: savedAna?.id, raw_score: rawScore, guarded_score: guardedScore, official_score: officialScore, market_score: marketScore, deterministic_base_score: deterministicBaseScore, red_risk_factor: redRiskFactor, guardrail_applied: guardrailApplied, guardrail_reason: guardrailReason, market_floor_applied: marketFloorApplied, recommendation: anaResult!.recommendation, tokens_used: anaTokens, ai_provider: anaAiResult.provider, ai_model: anaAiResult.model },
    confidence_gap: { gap_id: savedGap?.id, ana_score: guardedScore, red_score: redScore, gap: guardedScore - redScore, health_status: healthStatus, gap_delta: gapDelta, alert_triggered: alertTriggered, alert_reason: alertReason },
    governance: { previous_score: previousScore, avg_last_3: avgLast3, avg_last_7: avgLast7, guardrail_max_delta: 10, variance_reduced: guardrailApplied },
    total_tokens: redTokens + anaTokens,
    prompt_versions: { red_persona: redPersona.version, red_template: redTemplate.version, ana_persona: anaPersona.version, ana_template: anaTemplate.version },
  }), { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
}, { methods: ['POST'], tenantSource: 'auto' });
