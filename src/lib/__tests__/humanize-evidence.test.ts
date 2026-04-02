import { describe, it, expect } from 'vitest';
import { humanizeEvidence, getEvidenceSummary } from '../humanize-evidence';

describe('humanize-evidence', () => {
  describe('humanizeEvidence', () => {
    it('returns empty for null evidence', () => {
      expect(humanizeEvidence(null)).toEqual([]);
      expect(humanizeEvidence(undefined)).toEqual([]);
    });

    it('returns empty for non-object', () => {
      expect(humanizeEvidence('string')).toEqual([]);
    });

    it('humanizes CPU usage', () => {
      const items = humanizeEvidence({ cpu_percent: 95.3 });
      expect(items).toHaveLength(1);
      expect(items[0].label).toBe('CPU atual');
      expect(items[0].value).toBe('95%');
    });

    it('humanizes memory', () => {
      const items = humanizeEvidence({ memory_percent: 87.6 });
      expect(items[0].label).toBe('Memória em uso');
      expect(items[0].value).toBe('88%');
    });

    it('humanizes hours offline', () => {
      const items = humanizeEvidence({ hours_offline: 48 });
      expect(items[0].value).toBe('2 dias');
    });

    it('humanizes hours offline < 1', () => {
      const items = humanizeEvidence({ hours_offline: 0.5 });
      expect(items[0].value).toBe('Menos de 1 hora');
    });

    it('humanizes threat level', () => {
      const items = humanizeEvidence({ threat_level: 'critical' });
      expect(items[0].value).toBe('Crítico');
    });

    it('humanizes anomaly score', () => {
      const items = humanizeEvidence({ anomaly_score: 0.9 });
      expect(items[0].value).toBe('Muito alto');
    });

    it('limits to 6 items', () => {
      const evidence = {
        cpu_percent: 90,
        memory_percent: 80,
        disk_percent: 70,
        failureRate: 5,
        blocked_requests: 10,
        domain: 'evil.com',
        confidence_score: 0.9,
        anomaly_score: 0.8,
      };
      expect(humanizeEvidence(evidence).length).toBeLessThanOrEqual(6);
    });

    it('handles evidence_pack with agent problem entry', () => {
      const evidence = {
        evidence_pack: [
          { data_point: 'Uso Médio de CPU', value: 10.84 },
          { data_point: 'Agente com Problema: DESKTOP-X', value: { cpu: 93, disk: 51, memory: 78 } },
        ],
      };
      const items = humanizeEvidence(evidence);
      expect(items.find(i => i.label === 'Agente')?.value).toBe('DESKTOP-X');
      expect(items.find(i => i.label === 'CPU')?.value).toBe('93%');
    });
  });

  describe('getEvidenceSummary', () => {
    it('returns empty string for no evidence', () => {
      expect(getEvidenceSummary(null)).toBe('');
    });

    it('returns formatted summary', () => {
      const summary = getEvidenceSummary({ cpu_percent: 95 });
      expect(summary).toContain('CPU atual');
      expect(summary).toContain('95%');
    });

    it('limits to 3 items', () => {
      const evidence = {
        cpu_percent: 90,
        memory_percent: 80,
        disk_percent: 70,
        failureRate: 5,
      };
      const parts = getEvidenceSummary(evidence).split(' • ');
      expect(parts.length).toBeLessThanOrEqual(3);
    });
  });
});
