/**
 * Compliance score calculator
 */

export interface CategoryScore {
  category: string;
  score: number;
  max_score: number;
  weight: number;
  details: string;
}

export function gradeFromScore(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export interface ComplianceMetrics {
  criticalVulns: number;
  highVulns: number;
  totalAgents: number;
  offlineAgents: number;
  totalCerts: number;
  expiredCerts: number;
  blockedUsb: number;
  unresolvedAlerts: number;
  recentEvents: number;
}

export function calculateCategories(m: ComplianceMetrics): CategoryScore[] {
  const vulnScore = Math.max(0, 100 - m.criticalVulns * 15 - m.highVulns * 5);
  const agentHealthScore = m.totalAgents ? Math.round(((m.totalAgents - m.offlineAgents) / m.totalAgents) * 100) : 100;
  const certScore = m.totalCerts ? Math.round(((m.totalCerts - m.expiredCerts) / m.totalCerts) * 100) : 100;
  const usbScore = m.blockedUsb > 0 ? Math.max(50, 100 - m.blockedUsb * 10) : 100;
  const incidentScore = Math.max(0, 100 - m.unresolvedAlerts * 3);
  const auditScore = m.recentEvents > 0 ? Math.min(100, 70 + m.recentEvents) : 50;

  return [
    { category: 'vulnerability_management', score: vulnScore, max_score: 100, weight: 0.25, details: `${m.criticalVulns} critical, ${m.highVulns} high vulns` },
    { category: 'agent_health', score: agentHealthScore, max_score: 100, weight: 0.20, details: `${m.offlineAgents}/${m.totalAgents} offline` },
    { category: 'certificate_management', score: certScore, max_score: 100, weight: 0.15, details: `${m.expiredCerts}/${m.totalCerts} expired` },
    { category: 'usb_security', score: usbScore, max_score: 100, weight: 0.10, details: `${m.blockedUsb} blocked devices` },
    { category: 'incident_response', score: incidentScore, max_score: 100, weight: 0.15, details: `${m.unresolvedAlerts} unresolved alerts` },
    { category: 'audit_trail', score: auditScore, max_score: 100, weight: 0.15, details: `${m.recentEvents} events in 24h` },
  ];
}

export function calculateOverallScore(categories: CategoryScore[]): number {
  return Math.round(categories.reduce((sum, c) => sum + c.score * c.weight, 0));
}
