/**
 * Types for ai-system-analyzer
 */

export interface AnalysisData {
  problematicJobs: any[];
  failurePatterns: any[];
  agentMetrics: any[];
  installationStats: any[];
  systemAlerts: any[];
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
