import { describe, it, expect } from 'vitest';
import { mapInsightToAction, shouldAutoExecute, requiresApproval, getAutoExecutableTypes, getActionLabel, getSuggestedActions, DEFAULT_MAPPING, INSIGHT_MAPPINGS } from '../insight-action-mapping';

describe('insight-action-mapping', () => {
  describe('mapInsightToAction', () => {
    it('returns mapping for known type', () => {
      const m = mapInsightToAction('antivirus_disabled');
      expect(m.mode).toBe('auto');
      expect(m.risk).toBe('high');
    });

    it('returns default for unknown type', () => {
      const m = mapInsightToAction('nonexistent');
      expect(m).toEqual(DEFAULT_MAPPING);
    });
  });

  describe('shouldAutoExecute', () => {
    it('returns true for auto types with handler', () => {
      expect(shouldAutoExecute('antivirus_disabled')).toBe(true);
      expect(shouldAutoExecute('dns_malicious_activity')).toBe(true);
    });

    it('returns false for suggest/approval types', () => {
      expect(shouldAutoExecute('anomaly_detection')).toBe(false);
      expect(shouldAutoExecute('vulnerability_critical')).toBe(false);
    });
  });

  describe('requiresApproval', () => {
    it('returns true for approval types', () => {
      expect(requiresApproval('vulnerability_critical')).toBe(true);
      expect(requiresApproval('p2p_software_detected')).toBe(true);
    });

    it('returns false for auto types', () => {
      expect(requiresApproval('antivirus_disabled')).toBe(false);
    });
  });

  describe('getAutoExecutableTypes', () => {
    it('returns array of auto types', () => {
      const types = getAutoExecutableTypes();
      expect(types).toContain('antivirus_disabled');
      expect(types).toContain('dns_malicious_activity');
      expect(types.length).toBeGreaterThan(3);
    });
  });

  describe('getActionLabel', () => {
    it('returns human label', () => {
      expect(getActionLabel('antivirus_disabled')).toContain('Antivírus');
    });

    it('returns default label for unknown', () => {
      expect(getActionLabel('unknown')).toBe('Ação sugerida');
    });
  });

  describe('getSuggestedActions', () => {
    it('returns actions for known type', () => {
      const actions = getSuggestedActions('vulnerability_critical');
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].label).toBeTruthy();
    });
  });

  it('INSIGHT_MAPPINGS has comprehensive coverage', () => {
    expect(Object.keys(INSIGHT_MAPPINGS).length).toBeGreaterThan(15);
  });
});
