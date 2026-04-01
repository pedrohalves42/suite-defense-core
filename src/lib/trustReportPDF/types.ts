export interface TrustReportData {
  tenant: { id: string; name: string; slug: string };
  period: { start: Date; end: Date };
  agents: { total: number; online: number; offline: number; isolated: number };
  detectionRules: { total: number; enabled: number; bySeverity: Record<string, number>; byTactic: Record<string, number> };
  detections: { total: number; bySeverity: Record<string, number>; topRules: { name: string; count: number }[] };
  alerts: { total: number; critical: number; high: number; medium: number; low: number; resolved: number };
  threatIntel: { totalIndicators: number; matches: number; lastSync: string | null; sources: string[] };
  auditIntegrity: { totalLogs: number; chainValid: boolean };
  compliance: { score: number | null; categories: { name: string; score: number }[] };
  coverageGates: { is_compliant: boolean; gates: { gate: string; passed: boolean; count: number }[] } | null;
  evidenceChain: { totalExecutions: number; agentsWithChain: number };
}

export const COLORS = {
  brand: [30, 58, 138] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  amber: [217, 119, 6] as [number, number, number],
  gray: [100, 116, 139] as [number, number, number],
  lightBg: [241, 245, 249] as [number, number, number],
};
