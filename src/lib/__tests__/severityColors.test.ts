import { describe, it, expect } from 'vitest';
import {
  getSeverityTextColor,
  getSeverityBgColor,
  getSeverityCombo,
  getHealthStatusTextColor,
  getHealthStatusBgColor,
  getIncidentStatusColor,
  getRiskLevelColor,
  getRiskDeltaColor,
  getBurnRateColors,
  getErrorBudgetBarColor,
  getThreatLevelTextColor,
  getThreatLevelBgColor,
} from '../severityColors';

describe('severityColors', () => {
  describe('getSeverityTextColor()', () => {
    it('returns destructive for critical', () => {
      expect(getSeverityTextColor('critical')).toContain('destructive');
    });

    it('returns muted for unknown', () => {
      expect(getSeverityTextColor('unknown')).toContain('muted');
    });

    it.each(['high', 'medium'])('returns warning for %s', (sev) => {
      expect(getSeverityTextColor(sev)).toContain('warning');
    });

    it('returns success for low', () => {
      expect(getSeverityTextColor('low')).toContain('success');
    });

    it('returns info for info', () => {
      expect(getSeverityTextColor('info')).toContain('info');
    });
  });

  describe('getSeverityBgColor()', () => {
    it('returns bg classes for each severity', () => {
      expect(getSeverityBgColor('critical')).toContain('bg-');
      expect(getSeverityBgColor('low')).toContain('bg-');
      expect(getSeverityBgColor('unknown')).toBe('bg-muted');
    });
  });

  describe('getSeverityCombo()', () => {
    it('combines text and bg', () => {
      const combo = getSeverityCombo('critical');
      expect(combo).toContain('text-');
      expect(combo).toContain('bg-');
    });
  });

  describe('getHealthStatusTextColor()', () => {
    it('returns success for healthy', () => {
      expect(getHealthStatusTextColor('healthy')).toContain('success');
    });

    it('returns warning for attention', () => {
      expect(getHealthStatusTextColor('attention')).toContain('warning');
    });

    it('returns destructive for critical', () => {
      expect(getHealthStatusTextColor('critical')).toContain('destructive');
    });

    it('returns destructive for offline', () => {
      expect(getHealthStatusTextColor('offline')).toContain('destructive');
    });
  });

  describe('getRiskDeltaColor()', () => {
    it('returns muted for 0', () => {
      expect(getRiskDeltaColor(0)).toContain('muted');
    });

    it('returns success for negative', () => {
      expect(getRiskDeltaColor(-5)).toContain('success');
    });

    it('returns destructive for positive', () => {
      expect(getRiskDeltaColor(5)).toContain('destructive');
    });
  });

  describe('getBurnRateColors()', () => {
    it('returns critical for rate >= 5', () => {
      expect(getBurnRateColors(5).level).toBe('critical');
    });

    it('returns high for rate >= 2', () => {
      expect(getBurnRateColors(3).level).toBe('high');
    });

    it('returns ok for rate < 1', () => {
      expect(getBurnRateColors(0.5).level).toBe('ok');
    });

    it('returns warning for rate >= 1.5', () => {
      expect(getBurnRateColors(1.7).level).toBe('warning');
    });

    it('returns alert for rate >= 1', () => {
      expect(getBurnRateColors(1.2).level).toBe('alert');
    });
  });

  describe('getErrorBudgetBarColor()', () => {
    it('returns destructive for >= 80', () => {
      expect(getErrorBudgetBarColor(80)).toContain('destructive');
    });

    it('returns success for < 30', () => {
      expect(getErrorBudgetBarColor(20)).toContain('success');
    });
  });
});
