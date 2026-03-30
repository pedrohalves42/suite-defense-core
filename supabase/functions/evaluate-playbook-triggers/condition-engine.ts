/**
 * Trigger condition evaluation engine
 */

export function evaluateConditions(
  triggerType: string,
  conditions: Record<string, unknown>,
  context: Record<string, unknown>
): boolean {
  switch (triggerType) {
    case 'agent_offline': {
      const hoursThreshold = (conditions.hours_threshold as number) || 24;
      const hoursOffline = (context.hours_offline as number) || 0;
      return hoursOffline >= hoursThreshold;
    }

    case 'dns_blocked': {
      const minBlocked = (conditions.min_blocked_requests as number) || 10;
      const blockedCount = (context.blocked_requests as number) || 0;
      return blockedCount >= minBlocked;
    }

    case 'job_failed': {
      const minFailures = (conditions.min_failures as number) || 3;
      const failureCount = (context.failure_count as number) || 0;
      const criticalTypes = (conditions.critical_job_types as string[]) || [];
      const jobType = context.job_type as string;
      if (criticalTypes.length > 0 && jobType) {
        return failureCount >= minFailures && criticalTypes.includes(jobType);
      }
      return failureCount >= minFailures;
    }

    case 'integrity_low': {
      const threshold = (conditions.integrity_threshold as number) || 80;
      const currentScore = (context.integrity_score as number) || 100;
      return currentScore < threshold;
    }

    case 'suspicious_web_activity': {
      const minRiskScore = (conditions.min_risk_score as number) || 70;
      const riskScore = (context.risk_score as number) || 0;
      const categories = (conditions.categories as string[]) || [];
      const domain_category = (context.domain_category as string) || '';
      if (categories.length > 0 && domain_category) {
        return riskScore >= minRiskScore && categories.includes(domain_category);
      }
      return riskScore >= minRiskScore;
    }

    case 'vulnerability_critical': {
      const minCvss = (conditions.min_cvss as number) || 9.0;
      const cvssScore = (context.cvss_score as number) || 0;
      const vulnsFound = (context.vulns_found as number) || 0;
      return cvssScore >= minCvss || vulnsFound > 0;
    }

    case 'vulnerability_high': {
      const minCvss = (conditions.min_cvss as number) || 7.0;
      const maxCvss = (conditions.max_cvss as number) || 8.9;
      const cvssScore = (context.cvss_score as number) || 0;
      return cvssScore >= minCvss && cvssScore <= maxCvss;
    }

    case 'multiple_malicious_access': {
      const minCount = (conditions.min_count as number) || 3;
      const accessCount = (context.access_count as number) || 0;
      return accessCount >= minCount;
    }

    case 'suspicious_process': {
      const processReputation = (context.process_reputation as string) || '';
      const requiredReputation = (conditions.process_reputation as string) || 'malicious';
      return processReputation === requiredReputation;
    }

    case 'unauthorized_service': {
      const authorized = (context.authorized as boolean) ?? true;
      const serviceState = (context.service_state as string) || '';
      const requiredState = (conditions.service_state as string) || 'running';
      return !authorized && serviceState === requiredState;
    }

    case 'manual':
      return true;

    default:
      return true;
  }
}
