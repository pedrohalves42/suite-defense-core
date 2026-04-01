import { describe, it, expect, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isAgentHealthy, getAgentHealthLevel } from '../health-rules';

describe('health-rules', () => {
  describe('isAgentHealthy()', () => {
    it('returns false for null state', () => {
      expect(isAgentHealthy({ state: null })).toBe(false);
    });

    it('returns false for undefined state', () => {
      expect(isAgentHealthy({ state: undefined })).toBe(false);
    });

    it('returns true for healthy state with no issues', () => {
      expect(isAgentHealthy({ state: 'healthy' })).toBe(true);
    });

    it('returns true for healthy state with zero critical/high', () => {
      expect(isAgentHealthy({
        state: 'healthy',
        summary: { critical: 0, high: 0, medium: 2, low: 1 } as any,
      })).toBe(true);
    });

    it('returns false for healthy state with critical issues', () => {
      expect(isAgentHealthy({
        state: 'healthy',
        summary: { critical: 1, high: 0, medium: 0, low: 0 } as any,
      })).toBe(false);
    });

    it('returns false for healthy state with high issues', () => {
      expect(isAgentHealthy({
        state: 'healthy',
        summary: { critical: 0, high: 1, medium: 0, low: 0 } as any,
      })).toBe(false);
    });

    it('returns false for non-healthy state', () => {
      expect(isAgentHealthy({ state: 'offline' })).toBe(false);
      expect(isAgentHealthy({ state: 'degraded' })).toBe(false);
    });
  });

  describe('getAgentHealthLevel()', () => {
    it('returns critical for null state', () => {
      expect(getAgentHealthLevel({ state: null })).toBe('critical');
    });

    it('returns critical for isolated', () => {
      expect(getAgentHealthLevel({ state: 'isolated' })).toBe('critical');
    });

    it('returns critical for quarantined', () => {
      expect(getAgentHealthLevel({ state: 'quarantined' })).toBe('critical');
    });

    it('returns critical for critical summary issues', () => {
      expect(getAgentHealthLevel({
        state: 'healthy',
        summary: { critical: 1, high: 0, medium: 0, low: 0 } as any,
      })).toBe('critical');
    });

    it('returns warning for offline', () => {
      expect(getAgentHealthLevel({ state: 'offline' })).toBe('warning');
    });

    it('returns warning for safe_mode', () => {
      expect(getAgentHealthLevel({ state: 'safe_mode' })).toBe('warning');
    });

    it('returns warning for high issues', () => {
      expect(getAgentHealthLevel({
        state: 'healthy',
        summary: { critical: 0, high: 2, medium: 0, low: 0 } as any,
      })).toBe('warning');
    });

    it('returns warning for degraded/updating/rollback', () => {
      expect(getAgentHealthLevel({ state: 'degraded' })).toBe('warning');
      expect(getAgentHealthLevel({ state: 'updating' })).toBe('warning');
      expect(getAgentHealthLevel({ state: 'rollback' })).toBe('warning');
    });

    it('returns healthy for healthy state with no issues', () => {
      expect(getAgentHealthLevel({ state: 'healthy' })).toBe('healthy');
    });
  });
});
