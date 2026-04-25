
export class ComplianceScoringService {
  calculateSecurityScore(data: any) {
    const { 
      criticalVulns = 0, 
      highVulns = 0, 
      mediumVulns = 0, 
      threatsFound = 0, 
      criticalEvents = 0, 
      highEvents = 0, 
      offlineAgentsCount = 0, 
      failedLogins = 0, 
      avOutdated = 0, 
      failedJobs = 0 
    } = data;

    let securityScore = 100;
    securityScore -= criticalVulns * 25;
    securityScore -= highVulns * 10;
    securityScore -= mediumVulns * 3;
    securityScore -= threatsFound * 15;
    securityScore -= criticalEvents * 20;
    securityScore -= highEvents * 8;
    securityScore -= offlineAgentsCount * 5;
    securityScore -= failedLogins > 10 ? 10 : failedLogins > 5 ? 5 : 0;
    securityScore -= avOutdated * 8;
    securityScore -= failedJobs > 5 ? 10 : failedJobs > 2 ? 5 : 0;
    
    return Math.max(securityScore, 0);
  }

  getSecurityLevel(score: number): string {
    if (score >= 90) return "EXCELENTE";
    if (score >= 70) return "BOM";
    if (score >= 50) return "ADEQUADO";
    if (score >= 30) return "ATENCAO";
    return "CRITICO";
  }
}
