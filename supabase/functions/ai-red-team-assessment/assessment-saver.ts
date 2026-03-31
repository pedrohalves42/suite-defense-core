import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

/**
 * Save an AI-generated Red Team assessment to the database.
 */
export async function saveAssessment(
  supabase: SupabaseClient,
  tenantId: string,
  analysisResult: Record<string, unknown>,
  aiModel: string,
  promptHash: string,
  metrics: Record<string, unknown>,
) {
  const dimensionThreats = analysisResult.dimension_threats as Record<string, unknown> | undefined;
  const { data: savedAssessment, error: saveError } = await supabase
    .from('red_team_assessments')
    .insert({
      tenant_id: tenantId,
      threat_level: analysisResult.threat_level || 'medium',
      red_score: analysisResult.red_score || 50,
      attack_vectors: analysisResult.attack_vectors || [],
      residual_risks: analysisResult.residual_risks || [],
      threat_system_identity: dimensionThreats?.system_identity,
      threat_governance: dimensionThreats?.governance,
      threat_evidence_proof: dimensionThreats?.evidence_proof,
      threat_human_oversight: dimensionThreats?.human_oversight,
      threat_operational_resilience: dimensionThreats?.operational_resilience,
      threat_cross_tenant_isolation: dimensionThreats?.cross_tenant_isolation,
      threat_transparency_explainability: dimensionThreats?.transparency_explainability,
      threat_compliance_alignment: dimensionThreats?.compliance_alignment,
      threat_market_trust: dimensionThreats?.market_trust,
      executive_threat_summary: analysisResult.executive_threat_summary,
      worst_case_scenario: analysisResult.worst_case_scenario,
      recommended_hardening: analysisResult.recommended_hardening || [],
      ai_model: aiModel,
      ai_prompt_hash: promptHash,
      ai_response_raw: analysisResult,
      metrics_snapshot: metrics,
    })
    .select()
    .single();

  if (saveError) {
    logger.error('Error saving Red Team assessment:', saveError);
  }

  return savedAssessment;
}
