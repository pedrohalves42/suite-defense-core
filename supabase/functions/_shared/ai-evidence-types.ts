// CS-IA Evidence Pack Types - TOP 5% Global Implementation
// Provides explainability and auditability for all AI insights

export interface AIEvidence {
  data_point: string;        // Human-readable description of the evidence
  source_table: string;      // Database table/source of this evidence
  source_id?: string;        // Optional: specific record ID
  timestamp: string;         // When this evidence was collected
  value: unknown;            // The actual value/data
  severity?: 'info' | 'warning' | 'critical'; // Evidence severity
}

export interface AIEvidencePack {
  evidence: AIEvidence[];           // List of supporting evidence
  data_sources: string[];           // All data sources consulted
  reasoning_summary: string;        // Human-readable explanation
  confidence: number;               // 0.0 - 1.0 confidence score
}

export interface AIResponseWithEvidence {
  // Analysis results
  insights: string[];
  suggestions: Record<string, unknown>[];
  riskFactors?: string[];
  healthScore?: number;
  
  // Evidence Pack (required for TOP 5% compliance)
  evidence: AIEvidence[];
  data_sources: string[];
  reasoning_summary: string;
  confidence: number;
}

// Helper to build evidence from database query results
export function buildEvidence(
  dataPoint: string,
  sourceTable: string,
  value: unknown,
  sourceId?: string,
  severity?: 'info' | 'warning' | 'critical'
): AIEvidence {
  return {
    data_point: dataPoint,
    source_table: sourceTable,
    source_id: sourceId,
    timestamp: new Date().toISOString(),
    value,
    severity,
  };
}

// Helper to extract unique data sources from evidence
export function extractDataSources(evidence: AIEvidence[]): string[] {
  return [...new Set(evidence.map(e => e.source_table))];
}

// Helper to calculate confidence based on evidence quality
export function calculateConfidence(evidence: AIEvidence[], hasAIAnalysis: boolean): number {
  if (evidence.length === 0) return 0.3;
  
  const baseConfidence = hasAIAnalysis ? 0.7 : 0.5;
  const evidenceBonus = Math.min(0.25, evidence.length * 0.05);
  const criticalEvidence = evidence.filter(e => e.severity === 'critical').length;
  const criticalBonus = criticalEvidence > 0 ? 0.05 : 0;
  
  return Math.min(1.0, baseConfidence + evidenceBonus + criticalBonus);
}

// Helper to generate reasoning summary from evidence
export function generateReasoningSummary(
  evidence: AIEvidence[],
  context: string,
  aiAnalysis?: string
): string {
  if (evidence.length === 0) {
    return `Analise baseada em ${context}. Dados insuficientes para evidencia detalhada.`;
  }

  const criticalEvidence = evidence.filter(e => e.severity === 'critical');
  const warningEvidence = evidence.filter(e => e.severity === 'warning');
  
  let summary = `Esta analise e baseada em ${evidence.length} pontos de evidencia coletados de ${extractDataSources(evidence).length} fonte(s) de dados.`;
  
  if (criticalEvidence.length > 0) {
    summary += ` ${criticalEvidence.length} evidencia(s) critica(s) identificada(s).`;
  }
  
  if (warningEvidence.length > 0) {
    summary += ` ${warningEvidence.length} ponto(s) de atencao detectado(s).`;
  }
  
  if (aiAnalysis) {
    summary += ` Analise de IA aplicada para correlacao e recomendacoes.`;
  }
  
  return summary;
}
