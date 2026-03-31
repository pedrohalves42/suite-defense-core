import type { DeterministicCriteria } from './types.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

interface RedTeamMetrics {
  agents?: { offline?: number };
  ai_actions?: { approval_rate?: number; human_reviewed?: number };
  rollbacks?: { total?: number };
  users?: { count?: number };
  dlq?: { current?: number };
  critical_alerts?: { open?: number };
}

/**
 * Build a deterministic Red Team assessment when AI providers are unavailable.
 */
export function buildDeterministicAssessment(metrics: RedTeamMetrics | null) {
  const m = metrics || {};
  const binaryCriteria: DeterministicCriteria = {
    offline_agents_exist: (m?.agents?.offline || 0) > 0,
    human_approval_rate_zero: (m?.ai_actions?.approval_rate || 0) === 0,
    human_reviewed_zero: (m?.ai_actions?.human_reviewed || 0) === 0,
    rollback_never_tested: (m?.rollbacks?.total || 0) === 0,
    single_user_system: (m?.users?.count || 0) <= 1,
    dlq_has_items: (m?.dlq?.current || 0) > 0,
    critical_alerts_open: (m?.critical_alerts?.open || 0) > 0,
  };

  const criteriaCount = Object.values(binaryCriteria).filter(Boolean).length;
  const threatLevel = criteriaCount >= 4 ? 'critical' : criteriaCount === 3 ? 'high' : criteriaCount === 2 ? 'medium' : 'low';
  const redScore = Math.min(100, criteriaCount * 15);

  return {
    threat_level: threatLevel,
    red_score: redScore,
    binary_criteria: binaryCriteria,
    attack_vectors: ['Analise deterministica - provedores de IA indisponiveis'],
    residual_risks: [`${criteriaCount} criterios de risco identificados automaticamente`],
    dimension_threats: {
      system_identity: binaryCriteria.offline_agents_exist ? 'medium' : 'low',
      governance: binaryCriteria.human_approval_rate_zero ? 'high' : 'low',
      evidence_proof: 'unknown',
      human_oversight: binaryCriteria.human_reviewed_zero ? 'high' : 'low',
      operational_resilience: binaryCriteria.dlq_has_items ? 'medium' : 'low',
      cross_tenant_isolation: 'unknown',
      transparency_explainability: 'unknown',
      compliance_alignment: 'unknown',
      market_trust: binaryCriteria.critical_alerts_open ? 'medium' : 'low',
    },
    executive_threat_summary: `Analise deterministica: ${criteriaCount} criterios de risco ativos. Provedores de IA indisponiveis - analise completa requer reconexao.`,
    worst_case_scenario: 'Nao disponivel - analise de IA requer provedor ativo',
    recommended_hardening: ['Verificar configuracao dos provedores de IA', 'Revisar criterios binarios identificados'],
    _fallback_reason: 'AI_PROVIDERS_UNAVAILABLE',
    _is_deterministic: true,
  };
}

/**
 * Save a deterministic assessment to the database.
 */
export async function saveDeterministicAssessment(supabase: SupabaseClient, tenantId: string, result: ReturnType<typeof buildDeterministicAssessment>, metrics: Record<string, unknown> | null) {
  const { data: savedAssessment } = await supabase
    .from('red_team_assessments')
    .insert({
      tenant_id: tenantId,
      threat_level: result.threat_level,
      red_score: result.red_score,
      attack_vectors: result.attack_vectors,
      residual_risks: result.residual_risks,
      threat_system_identity: result.dimension_threats.system_identity,
      threat_governance: result.dimension_threats.governance,
      threat_evidence_proof: result.dimension_threats.evidence_proof,
      threat_human_oversight: result.dimension_threats.human_oversight,
      threat_operational_resilience: result.dimension_threats.operational_resilience,
      threat_cross_tenant_isolation: result.dimension_threats.cross_tenant_isolation,
      threat_transparency_explainability: result.dimension_threats.transparency_explainability,
      threat_compliance_alignment: result.dimension_threats.compliance_alignment,
      threat_market_trust: result.dimension_threats.market_trust,
      executive_threat_summary: result.executive_threat_summary,
      worst_case_scenario: result.worst_case_scenario,
      recommended_hardening: result.recommended_hardening,
      ai_model: 'deterministic-fallback',
      ai_prompt_hash: 'deterministic-fallback',
      ai_response_raw: result,
      metrics_snapshot: metrics,
    })
    .select()
    .single();

  logger.info(`[ai-red-team-assessment] Deterministic fallback saved. Threat level: ${result.threat_level}, Red score: ${result.red_score}`);
  return savedAssessment;
}
