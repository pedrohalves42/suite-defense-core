import { describe, it, expect } from 'vitest';
import { translateAlert, getSeverityColor, getSeverityLabel, translateTechTerm, TECH_TERMS_DICTIONARY } from '../alert-translator';

describe('alert-translator', () => {
  describe('translateAlert', () => {
    it('translates known alert type', () => {
      const result = translateAlert('high_cpu');
      expect(result.title).toBe('Computador Sobrecarregado');
      expect(result.severity).toBe('high');
      expect(result.icon).toBe('🔥');
    });

    it('returns fallback for unknown alert', () => {
      const result = translateAlert('unknown_type_xyz');
      expect(result.severity).toBe('info');
      expect(result.icon).toBe('ℹ️');
      expect(result.title).toContain('Unknown Type Xyz');
    });

    it('injects agentName context', () => {
      const result = translateAlert('high_cpu', { agentName: 'PC-001' });
      expect(result.description).toContain('PC-001');
    });

    it('translates all critical alerts', () => {
      for (const type of ['high_disk', 'network_offline', 'threat_detected', 'antivirus_disabled']) {
        const result = translateAlert(type);
        expect(result.severity).toBe('critical');
      }
    });
  });

  describe('getSeverityColor', () => {
    it('returns CSS classes for each severity', () => {
      expect(getSeverityColor('critical')).toContain('red');
      expect(getSeverityColor('high')).toContain('orange');
      expect(getSeverityColor('medium')).toContain('yellow');
      expect(getSeverityColor('low')).toContain('blue');
      expect(getSeverityColor('info')).toContain('gray');
    });
  });

  describe('getSeverityLabel', () => {
    it('returns Portuguese labels', () => {
      expect(getSeverityLabel('critical')).toBe('Crítico');
      expect(getSeverityLabel('high')).toBe('Alto');
      expect(getSeverityLabel('medium')).toBe('Médio');
      expect(getSeverityLabel('low')).toBe('Baixo');
      expect(getSeverityLabel('info')).toBe('Informativo');
    });
  });

  describe('translateTechTerm', () => {
    it('translates known terms', () => {
      const result = translateTechTerm('CPU');
      expect(result).not.toBeNull();
      expect(result!.translated).toBe('Processador');
    });

    it('returns null for unknown terms', () => {
      expect(translateTechTerm('xyzzy')).toBeNull();
    });

    it('has all required dictionary entries', () => {
      expect(Object.keys(TECH_TERMS_DICTIONARY).length).toBeGreaterThan(5);
    });
  });
});
