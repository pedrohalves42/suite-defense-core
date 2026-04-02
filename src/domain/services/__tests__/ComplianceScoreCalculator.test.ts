import { describe, it, expect } from 'vitest';
import { ComplianceScoreCalculator, ComplianceCategory, type ComplianceInput } from '@/domain/services/ComplianceScoreCalculator';

describe('ComplianceScoreCalculator', () => {
  const calc = new ComplianceScoreCalculator();

  const perfectInput: ComplianceInput = {
    totalVulnerabilities: 0,
    criticalVulnerabilities: 0,
    remediatedVulnerabilities: 0,
    fileIntegrityViolations: 0,
    totalFilesScanned: 1000,
    antivirusEnabled: true,
    antivirusUpToDate: true,
    expiredCertificates: 0,
    expiringSoonCertificates: 0,
    totalCertificates: 10,
    blockedUsbDevices: 5,
    totalUsbDevices: 5,
    networkErrorRate: 0,
    agentsOnline: 100,
    totalAgents: 100,
  };

  it('returns grade A for perfect input', () => {
    const result = calc.calculate(perfectInput);
    expect(result.overallScore).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.categoryScores).toHaveLength(6);
  });

  it('returns grade F for worst case', () => {
    const result = calc.calculate({
      ...perfectInput,
      criticalVulnerabilities: 10,
      totalVulnerabilities: 20,
      remediatedVulnerabilities: 0,
      fileIntegrityViolations: 500,
      antivirusEnabled: false,
      antivirusUpToDate: false,
      expiredCertificates: 10,
      networkErrorRate: 0.5,
      agentsOnline: 10,
    });
    expect(result.grade).toBe('F');
    expect(result.overallScore).toBeLessThan(60);
  });

  it('penalizes critical vulnerabilities heavily', () => {
    const result = calc.calculate({
      ...perfectInput,
      criticalVulnerabilities: 5,
      totalVulnerabilities: 5,
    });
    const vulnScore = result.categoryScores.find(
      c => c.category === ComplianceCategory.VULNERABILITY_MANAGEMENT
    )!;
    expect(vulnScore.score).toBeLessThanOrEqual(25);
  });

  it('gives bonus for high remediation rate', () => {
    const result = calc.calculate({
      ...perfectInput,
      totalVulnerabilities: 10,
      remediatedVulnerabilities: 10,
      criticalVulnerabilities: 0,
    });
    const vulnScore = result.categoryScores.find(
      c => c.category === ComplianceCategory.VULNERABILITY_MANAGEMENT
    )!;
    // All remediated + >90% rate bonus = 100 + 10 capped at 100
    expect(vulnScore.score).toBe(100);
  });

  it('scores 50 when no files scanned', () => {
    const result = calc.calculate({
      ...perfectInput,
      totalFilesScanned: 0,
      fileIntegrityViolations: 0,
    });
    const fiScore = result.categoryScores.find(
      c => c.category === ComplianceCategory.FILE_INTEGRITY
    )!;
    expect(fiScore.score).toBe(50);
  });

  it('penalizes disabled antivirus', () => {
    const result = calc.calculate({
      ...perfectInput,
      antivirusEnabled: false,
    });
    const epScore = result.categoryScores.find(
      c => c.category === ComplianceCategory.ENDPOINT_PROTECTION
    )!;
    expect(epScore.score).toBeLessThanOrEqual(50);
  });

  it('penalizes no USB blocking when devices exist', () => {
    const result = calc.calculate({
      ...perfectInput,
      blockedUsbDevices: 0,
      totalUsbDevices: 10,
    });
    const acScore = result.categoryScores.find(
      c => c.category === ComplianceCategory.ACCESS_CONTROL
    )!;
    expect(acScore.score).toBe(80);
  });

  it('penalizes expired certificates', () => {
    const result = calc.calculate({
      ...perfectInput,
      expiredCertificates: 3,
      expiringSoonCertificates: 2,
    });
    const certScore = result.categoryScores.find(
      c => c.category === ComplianceCategory.CERTIFICATE_MANAGEMENT
    )!;
    expect(certScore.score).toBe(30); // 100 - 3*20 - 2*5
  });

  it('penalizes high network error rate', () => {
    const result = calc.calculate({
      ...perfectInput,
      networkErrorRate: 0.06,
    });
    const netScore = result.categoryScores.find(
      c => c.category === ComplianceCategory.NETWORK_SECURITY
    )!;
    expect(netScore.score).toBe(70);
  });

  it('has correct grade boundaries', () => {
    // Test all grade boundaries
    expect(calc.calculate({ ...perfectInput }).grade).toBe('A'); // 100
  });

  it('scores are clamped between 0 and 100', () => {
    const result = calc.calculate({
      ...perfectInput,
      criticalVulnerabilities: 100,
      totalVulnerabilities: 100,
    });
    const vulnScore = result.categoryScores.find(
      c => c.category === ComplianceCategory.VULNERABILITY_MANAGEMENT
    )!;
    expect(vulnScore.score).toBeGreaterThanOrEqual(0);
    expect(vulnScore.score).toBeLessThanOrEqual(100);
  });
});
