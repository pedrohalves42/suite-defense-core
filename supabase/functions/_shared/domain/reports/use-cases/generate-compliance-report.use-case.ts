
import { ReportDataRepository } from '../../../repositories/report-data.repository.ts';
import { ComplianceScoringService } from '../services/compliance-scoring.service.ts';

export class GenerateComplianceReportUseCase {
  private scoringService = new ComplianceScoringService();

  constructor(private repository: ReportDataRepository) {}

  async execute(tenantId: string, template: string, periodStart: string, periodEnd: string) {
    const data = await this.repository.getComplianceData(tenantId, periodStart, periodEnd);
    
    const offlineThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const offlineAgentsCount = data.agentsData?.filter(a => !a.last_heartbeat || a.last_heartbeat < offlineThreshold).length ?? 0;
    
    const vulns = data.vulns ?? [];
    const criticalVulns = vulns.filter(v => v.severity === "critical").length;
    const highVulns = vulns.filter(v => v.severity === "high").length;
    const mediumVulns = vulns.filter(v => v.severity === "medium").length;
    
    const threatsFound = data.avData?.reduce((sum: number, a: any) => sum + (a.threats_found ?? 0), 0) ?? 0;
    const securityEvents = data.securityEvents ?? [];
    const criticalEvents = securityEvents.filter(e => e.severity === "critical").length;
    const highEvents = securityEvents.filter(e => e.severity === "high").length;
    
    const failedLogins = securityEvents.filter(e => e.event_type === "login_failed" || e.event_type === "auth_failed").length;
    const avOutdated = data.avData?.filter((a: any) => a.definition_status === "outdated").length ?? 0;
    const recentJobs = data.recentJobs ?? [];
    const failedJobs = recentJobs.filter(j => j.status === "failed" || j.status === "failed_timeout").length;

    const score = this.scoringService.calculateSecurityScore({
      criticalVulns,
      highVulns,
      mediumVulns,
      threatsFound,
      criticalEvents,
      highEvents,
      offlineAgentsCount,
      failedLogins,
      avOutdated,
      failedJobs
    });

    return {
      score,
      level: this.scoringService.getSecurityLevel(score),
      raw_data: data
    };
  }
}
