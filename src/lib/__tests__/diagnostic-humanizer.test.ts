import { describe, it, expect } from 'vitest';
import { getHumanizedExplanation, getHumanizedTitle, getConfidenceBadge, DIAGNOSTIC_EXPLANATIONS } from '../diagnostic-humanizer';

describe('diagnostic-humanizer', () => {
  describe('getHumanizedExplanation', () => {
    it('returns known issue explanation', () => {
      const result = getHumanizedExplanation('high_cpu');
      expect(result.title).toBe('Uso Elevado de CPU');
      expect(result.confidence).toBe('high');
      expect(result.actions.length).toBeGreaterThan(0);
    });

    it('falls back to unknown', () => {
      const result = getHumanizedExplanation('nonexistent');
      expect(result.title).toBe('Problema Detectado');
      expect(result.confidence).toBe('low');
    });

    it('covers all severity types', () => {
      expect(getHumanizedExplanation('no_heartbeat').confidence).toBe('high');
      expect(getHumanizedExplanation('stale_heartbeat').confidence).toBe('medium');
      expect(getHumanizedExplanation('dns_failure').confidence).toBe('low');
    });
  });

  describe('getHumanizedTitle', () => {
    it('returns title for known type', () => {
      expect(getHumanizedTitle('offline')).toBe('Computador Offline');
    });

    it('returns fallback title for unknown', () => {
      expect(getHumanizedTitle('xyz')).toBe('Problema Detectado');
    });
  });

  describe('getConfidenceBadge', () => {
    it('returns correct badge for high confidence', () => {
      const badge = getConfidenceBadge('high');
      expect(badge.label).toBe('Alta confiança');
      expect(badge.variant).toBe('default');
    });

    it('returns correct badge for medium', () => {
      const badge = getConfidenceBadge('medium');
      expect(badge.label).toBe('Confiança média');
    });

    it('returns correct badge for low', () => {
      const badge = getConfidenceBadge('low');
      expect(badge.label).toBe('Baixa confiança');
    });
  });

  it('has comprehensive explanations catalog', () => {
    expect(Object.keys(DIAGNOSTIC_EXPLANATIONS).length).toBeGreaterThan(15);
  });
});
