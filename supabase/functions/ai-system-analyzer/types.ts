/**
 * Types for ai-system-analyzer
 */

export interface AnalysisData {
  problematicJobs: Array<Record<string, unknown>>;
  failurePatterns: Array<Record<string, unknown>>;
  agentMetrics: Array<Record<string, unknown>>;
  installationStats: Array<Record<string, unknown>>;
  systemAlerts: Array<Record<string, unknown>>;
}

export interface AIInsight {
  tenant_id: string;
  insight_type: 'anomaly_detection' | 'optimization' | 'prediction' | 'root_cause';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  recommendation: string;
  confidence_score: number;
}
