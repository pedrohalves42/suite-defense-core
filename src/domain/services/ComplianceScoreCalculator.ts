/**
 * Domain Service: Calculates a tenant's compliance score across
 * multiple security categories using weighted scoring.
 */

export enum ComplianceCategory {
  VULNERABILITY_MANAGEMENT = 'vulnerability_management',
  FILE_INTEGRITY = 'file_integrity',
  ENDPOINT_PROTECTION = 'endpoint_protection',
  ACCESS_CONTROL = 'access_control',
  CERTIFICATE_MANAGEMENT = 'certificate_management',
  NETWORK_SECURITY = 'network_security',
}

export interface CategoryScore {
  category: ComplianceCategory;
  score: number;        // 0-100
  maxScore: number;     // always 100
  weight: number;       // 0.0-1.0, all weights sum to 1.0
  findings: number;     // number of issues found
  details: string;
}

export interface ComplianceInput {
  totalVulnerabilities: number;
  criticalVulnerabilities: number;
  remediatedVulnerabilities: number;
  fileIntegrityViolations: number;
  totalFilesScanned: number;
  antivirusEnabled: boolean;
  antivirusUpToDate: boolean;
  expiredCertificates: number;
  expiringSoonCertificates: number;
  totalCertificates: number;
  blockedUsbDevices: number;
  totalUsbDevices: number;
  networkErrorRate: number;
  agentsOnline: number;
  totalAgents: number;
}

export interface ComplianceResult {
  overallScore: number;
  grade: string;
  categoryScores: CategoryScore[];
  calculatedAt: Date;
}

const CATEGORY_WEIGHTS: Record<ComplianceCategory, number> = {
  [ComplianceCategory.VULNERABILITY_MANAGEMENT]: 0.25,
  [ComplianceCategory.FILE_INTEGRITY]: 0.20,
  [ComplianceCategory.ENDPOINT_PROTECTION]: 0.20,
  [ComplianceCategory.ACCESS_CONTROL]: 0.10,
  [ComplianceCategory.CERTIFICATE_MANAGEMENT]: 0.15,
  [ComplianceCategory.NETWORK_SECURITY]: 0.10,
};

export class ComplianceScoreCalculator {
  calculate(input: ComplianceInput): ComplianceResult {
    const categoryScores = this.calculateAllCategories(input);
    const overallScore = this.calculateOverall(categoryScores);
    const grade = this.determineGrade(overallScore);

    return {
      overallScore: Math.round(overallScore),
      grade,
      categoryScores,
      calculatedAt: new Date(),
    };
  }

  private calculateAllCategories(input: ComplianceInput): CategoryScore[] {
    return [
      this.calcVulnerabilityScore(input),
      this.calcFileIntegrityScore(input),
      this.calcEndpointProtectionScore(input),
      this.calcAccessControlScore(input),
      this.calcCertificateScore(input),
      this.calcNetworkScore(input),
    ];
  }

  private calcVulnerabilityScore(input: ComplianceInput): CategoryScore {
    let score = 100;
    const findings = input.totalVulnerabilities;

    // Deduct for critical vulnerabilities
    score -= input.criticalVulnerabilities * 15;
    // Deduct for non-remediated
    const unremediated = input.totalVulnerabilities - input.remediatedVulnerabilities;
    score -= unremediated * 5;
    // Bonus for high remediation rate
    if (input.totalVulnerabilities > 0) {
      const rate = input.remediatedVulnerabilities / input.totalVulnerabilities;
      if (rate > 0.9) score += 10;
    }

    return {
      category: ComplianceCategory.VULNERABILITY_MANAGEMENT,
      score: Math.max(0, Math.min(100, score)),
      maxScore: 100,
      weight: CATEGORY_WEIGHTS[ComplianceCategory.VULNERABILITY_MANAGEMENT],
      findings,
      details: `${input.remediatedVulnerabilities}/${input.totalVulnerabilities} remediated, ${input.criticalVulnerabilities} critical`,
    };
  }

  private calcFileIntegrityScore(input: ComplianceInput): CategoryScore {
    let score = 100;
    const findings = input.fileIntegrityViolations;

    if (input.totalFilesScanned === 0) {
      score = 50; // No scans = medium risk
    } else {
      const violationRate = input.fileIntegrityViolations / input.totalFilesScanned;
      score -= violationRate * 200; // 50% violations = score 0
    }

    return {
      category: ComplianceCategory.FILE_INTEGRITY,
      score: Math.max(0, Math.min(100, score)),
      maxScore: 100,
      weight: CATEGORY_WEIGHTS[ComplianceCategory.FILE_INTEGRITY],
      findings,
      details: `${input.fileIntegrityViolations} violations in ${input.totalFilesScanned} files`,
    };
  }

  private calcEndpointProtectionScore(input: ComplianceInput): CategoryScore {
    let score = 100;
    let findings = 0;

    if (!input.antivirusEnabled) { score -= 50; findings++; }
    if (!input.antivirusUpToDate) { score -= 30; findings++; }

    // Agent health
    if (input.totalAgents > 0) {
      const onlineRate = input.agentsOnline / input.totalAgents;
      if (onlineRate < 0.8) { score -= 20; findings++; }
    }

    return {
      category: ComplianceCategory.ENDPOINT_PROTECTION,
      score: Math.max(0, Math.min(100, score)),
      maxScore: 100,
      weight: CATEGORY_WEIGHTS[ComplianceCategory.ENDPOINT_PROTECTION],
      findings,
      details: `AV ${input.antivirusEnabled ? 'enabled' : 'disabled'}, ${input.agentsOnline}/${input.totalAgents} agents online`,
    };
  }

  private calcAccessControlScore(input: ComplianceInput): CategoryScore {
    let score = 100;
    let findings = 0;

    // USB device control
    if (input.totalUsbDevices > 0 && input.blockedUsbDevices === 0) {
      score -= 20; // No blocking policy active
      findings++;
    }

    return {
      category: ComplianceCategory.ACCESS_CONTROL,
      score: Math.max(0, Math.min(100, score)),
      maxScore: 100,
      weight: CATEGORY_WEIGHTS[ComplianceCategory.ACCESS_CONTROL],
      findings,
      details: `${input.blockedUsbDevices}/${input.totalUsbDevices} USB devices blocked`,
    };
  }

  private calcCertificateScore(input: ComplianceInput): CategoryScore {
    let score = 100;
    const findings = input.expiredCertificates + input.expiringSoonCertificates;

    score -= input.expiredCertificates * 20;
    score -= input.expiringSoonCertificates * 5;

    return {
      category: ComplianceCategory.CERTIFICATE_MANAGEMENT,
      score: Math.max(0, Math.min(100, score)),
      maxScore: 100,
      weight: CATEGORY_WEIGHTS[ComplianceCategory.CERTIFICATE_MANAGEMENT],
      findings,
      details: `${input.expiredCertificates} expired, ${input.expiringSoonCertificates} expiring soon`,
    };
  }

  private calcNetworkScore(input: ComplianceInput): CategoryScore {
    let score = 100;
    let findings = 0;

    if (input.networkErrorRate > 0.05) {
      score -= 30;
      findings++;
    } else if (input.networkErrorRate > 0.01) {
      score -= 10;
      findings++;
    }

    return {
      category: ComplianceCategory.NETWORK_SECURITY,
      score: Math.max(0, Math.min(100, score)),
      maxScore: 100,
      weight: CATEGORY_WEIGHTS[ComplianceCategory.NETWORK_SECURITY],
      findings,
      details: `Error rate: ${(input.networkErrorRate * 100).toFixed(2)}%`,
    };
  }

  private calculateOverall(categories: CategoryScore[]): number {
    return categories.reduce((total, cat) => total + cat.score * cat.weight, 0);
  }

  private determineGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}
