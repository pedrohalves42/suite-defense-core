import { describe, it, expect } from 'vitest';
import { ComplianceScoreCalculator, ComplianceCategory } from '@/domain/services/ComplianceScoreCalculator';

describe('ComplianceScoreCalculator', () => {
  const calculator = new ComplianceScoreCalculator();

  const perfectInput = () => ({
    totalVulnerabilities: 0,
    criticalVulnerabilities: 0,
    remediatedVulnerabilities: 0,
    fileIntegrityViolations: 0,
    totalFilesScanned: 100,
    antivirusEnabled: true,
    antivirusUpToDate: true,
    expiredCertificates: 0,
    expiringSoonCertificates: 0,
    totalCertificates: 10,
    blockedUsbDevices: 5,
    totalUsbDevices: 5,
    networkErrorRate: 0,
    agentsOnline: 10,
    totalAgents: 10,
  });

  it('returns grade A for perfect compliance', () => {
    const result = calculator.calculate(perfectInput());
    expect(result.overallScore).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.categoryScores).toHaveLength(6);
  });

  it('deducts for critical vulnerabilities', () => {
    const result = calculator.calculate({ ...perfectInput(), totalVulnerabilities: 5, criticalVulnerabilities: 3 });
    const vulnScore = result.categoryScores.find(c => c.category === ComplianceCategory.VULNERABILITY_MANAGEMENT);
    expect(vulnScore!.score).toBeLessThan(100);
  });

  it('gives bonus for high remediation rate', () => {
    const result = calculator.calculate({
      ...perfectInput(), totalVulnerabilities: 10, remediatedVulnerabilities: 10, criticalVulnerabilities: 0,
    });
    const vulnScore = result.categoryScores.find(c => c.category === ComplianceCategory.VULNERABILITY_MANAGEMENT);
    expect(vulnScore!.score).toBe(100); // 100 - 0 deductions + 10 bonus clamped to 100
  });

  it('penalizes disabled antivirus', () => {
    const result = calculator.calculate({ ...perfectInput(), antivirusEnabled: false });
    const epScore = result.categoryScores.find(c => c.category === ComplianceCategory.ENDPOINT_PROTECTION);
    expect(epScore!.score).toBe(50);
  });

  it('penalizes low agent online rate', () => {
    const result = calculator.calculate({ ...perfectInput(), agentsOnline: 5, totalAgents: 10 });
    const epScore = result.categoryScores.find(c => c.category === ComplianceCategory.ENDPOINT_PROTECTION);
    expect(epScore!.score).toBe(80); // -20 for < 80% online
  });

  it('penalizes file integrity violations', () => {
    const result = calculator.calculate({ ...perfectInput(), fileIntegrityViolations: 25, totalFilesScanned: 100 });
    const fiScore = result.categoryScores.find(c => c.category === ComplianceCategory.FILE_INTEGRITY);
    expect(fiScore!.score).toBe(50); // 100 - 0.25*200
  });

  it('gives medium score for no file scans', () => {
    const result = calculator.calculate({ ...perfectInput(), totalFilesScanned: 0 });
    const fiScore = result.categoryScores.find(c => c.category === ComplianceCategory.FILE_INTEGRITY);
    expect(fiScore!.score).toBe(50);
  });

  it('penalizes expired certificates', () => {
    const result = calculator.calculate({ ...perfectInput(), expiredCertificates: 3 });
    const certScore = result.categoryScores.find(c => c.category === ComplianceCategory.CERTIFICATE_MANAGEMENT);
    expect(certScore!.score).toBe(40); // 100 - 3*20
  });

  it('penalizes high network error rate', () => {
    const result = calculator.calculate({ ...perfectInput(), networkErrorRate: 0.1 });
    const netScore = result.categoryScores.find(c => c.category === ComplianceCategory.NETWORK_SECURITY);
    expect(netScore!.score).toBe(70); // 100 - 30
  });

  it('returns grade F for very poor compliance', () => {
    const result = calculator.calculate({
      ...perfectInput(),
      criticalVulnerabilities: 5,
      totalVulnerabilities: 10,
      antivirusEnabled: false,
      antivirusUpToDate: false,
      expiredCertificates: 5,
      networkErrorRate: 0.2,
      fileIntegrityViolations: 50,
      totalFilesScanned: 100,
      agentsOnline: 2,
      totalAgents: 10,
    });
    expect(result.grade).toBe('F');
  });

  it.each([
    [90, 'A'], [85, 'B'], [75, 'C'], [65, 'D'], [50, 'F'],
  ])('score %d = grade %s', (score, expectedGrade) => {
    // Access private method via prototype for testing grades
    const grade = (calculator as any).determineGrade(score);
    expect(grade).toBe(expectedGrade);
  });
});
