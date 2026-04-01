import { describe, it, expect } from 'vitest';
import { BehavioralBaseline, BaselineType, AnomalySeverity } from '../../entities/BehavioralBaseline';
import { AgentId } from '../../value-objects/AgentId';
import { TenantId } from '../../value-objects/TenantId';

const agentId = AgentId.create('agent-1').value;
const tenantId = TenantId.create('tenant-1').value;

describe('BehavioralBaseline', () => {
  const validInput = () => ({
    agentId,
    tenantId,
    type: BaselineType.PROCESS_PATTERNS,
    data: { processes: ['chrome.exe', 'explorer.exe'] },
    thresholds: { mean: 50, stdDev: 10, multiplier: 2 },
  });

  describe('create()', () => {
    it('creates successfully', () => {
      const result = BehavioralBaseline.create(validInput());
      expect(result.isSuccess).toBe(true);
      expect(result.value.isActive).toBe(true);
      expect(result.value.type).toBe(BaselineType.PROCESS_PATTERNS);
    });

    it('fails with multiplier <= 0', () => {
      const input = { ...validInput(), thresholds: { mean: 50, stdDev: 10, multiplier: 0 } };
      expect(BehavioralBaseline.create(input).isFailure).toBe(true);
    });

    it('fails with negative multiplier', () => {
      const input = { ...validInput(), thresholds: { mean: 50, stdDev: 10, multiplier: -1 } };
      expect(BehavioralBaseline.create(input).isFailure).toBe(true);
    });
  });

  describe('detectAnomaly()', () => {
    it('detects anomaly above threshold', () => {
      const baseline = BehavioralBaseline.create(validInput()).value;
      // threshold = 50 + 10*2 = 70, so 80 is anomaly
      const result = baseline.detectAnomaly(80);
      expect(result.isAnomaly).toBe(true);
      expect(result.severity).toBe(AnomalySeverity.HIGH);
    });

    it('detects critical anomaly (> mean + 3*stdDev)', () => {
      const baseline = BehavioralBaseline.create(validInput()).value;
      // > 50 + 10*3 = 80
      const result = baseline.detectAnomaly(85);
      expect(result.isAnomaly).toBe(true);
      expect(result.severity).toBe(AnomalySeverity.CRITICAL);
    });

    it('returns no anomaly for normal values', () => {
      const baseline = BehavioralBaseline.create(validInput()).value;
      const result = baseline.detectAnomaly(60);
      expect(result.isAnomaly).toBe(false);
      expect(result.severity).toBe(AnomalySeverity.INFO);
    });
  });

  describe('mutations', () => {
    it('updateThresholds changes thresholds', () => {
      const baseline = BehavioralBaseline.create(validInput()).value;
      const newThresholds = { mean: 70, stdDev: 15, multiplier: 3 };
      baseline.updateThresholds(newThresholds);
      expect(baseline.thresholds).toEqual(newThresholds);
    });

    it('deactivate sets isActive false', () => {
      const baseline = BehavioralBaseline.create(validInput()).value;
      baseline.deactivate();
      expect(baseline.isActive).toBe(false);
    });
  });
});
