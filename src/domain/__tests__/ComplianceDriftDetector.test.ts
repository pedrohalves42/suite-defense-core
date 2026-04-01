import { describe, it, expect } from 'vitest';
import { ComplianceDriftDetector } from '../../services/ComplianceDriftDetector';

describe('ComplianceDriftDetector', () => {
  const detector = new ComplianceDriftDetector();

  const snap = (score: number, daysAgo: number = 0) => ({
    tenantId: 'tenant-1',
    overallScore: score,
    grade: score >= 90 ? 'A' : 'B',
    calculatedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
  });

  describe('detect()', () => {
    it('returns stable when no previous snapshot', () => {
      const result = detector.detect(snap(85), null);
      expect(result.hasDrift).toBe(false);
      expect(result.trend).toBe('stable');
      expect(result.requiresAlert).toBe(false);
    });

    it('detects degrading drift', () => {
      const result = detector.detect(snap(70), snap(85, 7));
      expect(result.hasDrift).toBe(true);
      expect(result.trend).toBe('degrading');
      expect(result.requiresAlert).toBe(true);
      expect(result.alertSeverity).toBe('warning');
    });

    it('detects critical drift (>= 15 point drop)', () => {
      const result = detector.detect(snap(60), snap(80, 7));
      expect(result.alertSeverity).toBe('critical');
    });

    it('detects improving trend', () => {
      const result = detector.detect(snap(90), snap(80, 7));
      expect(result.hasDrift).toBe(true);
      expect(result.trend).toBe('improving');
      expect(result.requiresAlert).toBe(false);
    });

    it('returns stable for small changes', () => {
      const result = detector.detect(snap(81), snap(80, 7));
      expect(result.hasDrift).toBe(false);
      expect(result.trend).toBe('stable');
    });
  });

  describe('analyzeTrend()', () => {
    it('returns insufficient_data for < 2 snapshots', () => {
      expect(detector.analyzeTrend([snap(80)]).trend).toBe('insufficient_data');
      expect(detector.analyzeTrend([]).trend).toBe('insufficient_data');
    });

    it('detects improving trend', () => {
      const snapshots = [snap(70, 30), snap(75, 20), snap(80, 10), snap(85, 0)];
      const result = detector.analyzeTrend(snapshots);
      expect(result.trend).toBe('improving');
      expect(result.averageChange).toBeGreaterThan(0);
    });

    it('detects degrading trend', () => {
      const snapshots = [snap(90, 30), snap(85, 20), snap(80, 10), snap(75, 0)];
      const result = detector.analyzeTrend(snapshots);
      expect(result.trend).toBe('degrading');
      expect(result.averageChange).toBeLessThan(0);
    });

    it('detects stable trend', () => {
      const snapshots = [snap(80, 30), snap(80, 20), snap(80, 10), snap(80, 0)];
      const result = detector.analyzeTrend(snapshots);
      expect(result.trend).toBe('stable');
    });
  });
});
