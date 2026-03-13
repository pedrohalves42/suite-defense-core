import { describe, it, expect } from 'vitest';
import { ComplianceScore } from '../entities/ComplianceScore';
import { TenantId } from '../value-objects/TenantId';

describe('ComplianceScore', () => {
  const tenantId = TenantId.create(crypto.randomUUID()).value;

  describe('fromCalculation', () => {
    it('creates score without drift when no previous score', () => {
      const score = ComplianceScore.fromCalculation(tenantId, 85, 'B', null);
      expect(score.overallScore).toBe(85);
      expect(score.grade).toBe('B');
      expect(score.hasDrift).toBe(false);
      expect(score.drifts).toHaveLength(0);
    });

    it('detects drift when difference >= 5', () => {
      const score = ComplianceScore.fromCalculation(tenantId, 80, 'B', 90);
      expect(score.hasDrift).toBe(true);
      expect(score.drifts).toHaveLength(1);
      expect(score.drifts[0].difference).toBe(-10);
      expect(score.drifts[0].severity).toBe('medium');
    });

    it('high severity drift for >= 15 point difference', () => {
      const score = ComplianceScore.fromCalculation(tenantId, 60, 'D', 80);
      expect(score.drifts[0].severity).toBe('high');
    });

    it('no drift for < 5 point difference', () => {
      const score = ComplianceScore.fromCalculation(tenantId, 88, 'B', 85);
      expect(score.hasDrift).toBe(false);
    });

    it('emits ComplianceScoreChangedEvent when drift detected', () => {
      const score = ComplianceScore.fromCalculation(tenantId, 70, 'C', 85);
      expect(score.domainEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('no event when no drift', () => {
      const score = ComplianceScore.fromCalculation(tenantId, 90, 'A', null);
      expect(score.domainEvents).toHaveLength(0);
    });
  });

  describe('recommendations', () => {
    it('generates critical recommendations for score < 70', () => {
      const score = ComplianceScore.fromCalculation(tenantId, 50, 'F', null);
      expect(score.recommendations.length).toBeGreaterThan(0);
      expect(score.recommendations[0].priority).toBe('critical');
    });

    it('generates medium recommendations for score 70-84', () => {
      const score = ComplianceScore.fromCalculation(tenantId, 75, 'C', null);
      expect(score.recommendations[0].priority).toBe('medium');
    });

    it('no recommendations for score >= 85', () => {
      const score = ComplianceScore.fromCalculation(tenantId, 95, 'A', null);
      expect(score.recommendations).toHaveLength(0);
    });
  });
});
