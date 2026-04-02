import { describe, it, expect } from 'vitest';
import { ComplianceDriftDetector, type ComplianceSnapshot } from '@/domain/services/ComplianceDriftDetector';

describe('ComplianceDriftDetector', () => {
  const detector = new ComplianceDriftDetector();

  const mkSnap = (score: number, date = new Date()): ComplianceSnapshot => ({
    tenantId: 't1',
    overallScore: score,
    grade: score >= 90 ? 'A' : 'B',
    calculatedAt: date,
  });

  describe('detect', () => {
    it('returns stable when no previous snapshot', () => {
      const result = detector.detect(mkSnap(85), null);
      expect(result.hasDrift).toBe(false);
      expect(result.trend).toBe('stable');
      expect(result.requiresAlert).toBe(false);
    });

    it('detects no drift for small changes', () => {
      const result = detector.detect(mkSnap(82), mkSnap(84));
      expect(result.hasDrift).toBe(false);
      expect(result.trend).toBe('stable');
    });

    it('detects improving trend', () => {
      const result = detector.detect(mkSnap(90), mkSnap(84));
      expect(result.trend).toBe('improving');
      expect(result.hasDrift).toBe(true);
    });

    it('detects degrading trend and requires alert', () => {
      const result = detector.detect(mkSnap(70), mkSnap(80));
      expect(result.trend).toBe('degrading');
      expect(result.requiresAlert).toBe(true);
      expect(result.hasDrift).toBe(true);
    });

    it('sets critical severity for large drops', () => {
      const result = detector.detect(mkSnap(60), mkSnap(80));
      expect(result.alertSeverity).toBe('critical');
      expect(result.drifts[0].severity).toBe('high');
    });

    it('sets warning severity for moderate drops', () => {
      const result = detector.detect(mkSnap(68), mkSnap(80));
      expect(result.alertSeverity).toBe('warning');
    });
  });

  describe('analyzeTrend', () => {
    it('returns insufficient_data for < 2 snapshots', () => {
      const result = detector.analyzeTrend([mkSnap(90)]);
      expect(result.trend).toBe('insufficient_data');
    });

    it('detects improving trend over time', () => {
      const snaps = [
        mkSnap(70, new Date('2024-01-01')),
        mkSnap(75, new Date('2024-01-02')),
        mkSnap(80, new Date('2024-01-03')),
        mkSnap(85, new Date('2024-01-04')),
      ];
      const result = detector.analyzeTrend(snaps);
      expect(result.trend).toBe('improving');
      expect(result.averageChange).toBe(5);
    });

    it('detects degrading trend', () => {
      const snaps = [
        mkSnap(90, new Date('2024-01-01')),
        mkSnap(85, new Date('2024-01-02')),
        mkSnap(78, new Date('2024-01-03')),
      ];
      const result = detector.analyzeTrend(snaps);
      expect(result.trend).toBe('degrading');
    });

    it('detects stable trend', () => {
      const snaps = [
        mkSnap(80, new Date('2024-01-01')),
        mkSnap(80.5, new Date('2024-01-02')),
        mkSnap(80, new Date('2024-01-03')),
      ];
      const result = detector.analyzeTrend(snaps);
      expect(result.trend).toBe('stable');
    });
  });
});
