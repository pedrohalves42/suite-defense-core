/**
 * Maps new AI dimension names to legacy database column names.
 */
export const DIMENSION_MAPPING: Record<string, { scoreCol: string; analysisCol: string }> = {
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

/**
 * Build the insert data for saving an audit, mapping dimension scores to legacy columns.
 */
export function buildAuditInsertData(
  tenantId: string,
  userId: string,
  analysisResult: Record<string, unknown>,
  metrics: Record<string, unknown>,
  aiModel: string,
  promptHash: string,
  tokensUsed: number,
): Record<string, unknown> {
  const insertData: Record<string, unknown> = {
    tenant_id: tenantId,
    created_by: userId,
    overall_score: analysisResult.overall_score,
    executive_summary: analysisResult.executive_summary,
    final_sentence: analysisResult.final_sentence,
    recommendation: analysisResult.recommendation,
    metrics_snapshot: metrics,
    ai_model: aiModel,
    prompt_hash: promptHash,
    tokens_used: tokensUsed,
    evidence_basis: analysisResult.evidence_basis || [],
    falsification_criteria: analysisResult.falsification_criteria || [],
  };

  for (const [dimKey, mapping] of Object.entries(DIMENSION_MAPPING)) {
    const dim = analysisResult.dimensions?.[dimKey];
    if (dim) {
      insertData[mapping.scoreCol] = dim.score;
      insertData[mapping.analysisCol] = dim.analysis;
    }
  }

  return insertData;
}
