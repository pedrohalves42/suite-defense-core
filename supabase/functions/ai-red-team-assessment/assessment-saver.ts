import { logger } from '../_shared/logger.ts';

/**
 * Save an AI-generated Red Team assessment to the database.
 */
export async function saveAssessment(
  supabase: any,
  tenantId: string,
  analysisResult: any,
  aiModel: string,
  promptHash: string,
  metrics: any,
) {
  const { data: savedAssessment, error: saveError } = await supabase
    .from('red_team_assessments')
    .insert({
      tenant_id: tenantId,
      threat_level: analysisResult.threat_level || 'medium',
      red_score: analysisResult.red_score || 50,
      attack_vectors: analysisResult.attack_vectors || [],
      residual_risks: analysisResult.residual_risks || [],
      threat_system_identity: analysisResult.dimension_threats?.system_identity,
      threat_governance: analysisResult.dimension_threats?.governance,
      threat_evidence_proof: analysisResult.dimension_threats?.evidence_proof,
      threat_human_oversight: analysisResult.dimension_threats?.human_oversight,
      threat_operational_resilience: analysisResult.dimension_threats?.operational_resilience,
      threat_cross_tenant_isolation: analysisResult.dimension_threats?.cross_tenant_isolation,
      threat_transparency_explainability: analysisResult.dimension_threats?.transparency_explainability,
      threat_compliance_alignment: analysisResult.dimension_threats?.compliance_alignment,
      threat_market_trust: analysisResult.dimension_threats?.market_trust,
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
