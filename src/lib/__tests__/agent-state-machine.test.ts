import { describe, it, expect, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  deriveAgentState,
  getStateDescription,
  isTransitionAllowed,
  getStateColorClasses,
  STATE_DESCRIPTIONS,
  STATE_TRANSITIONS,
} from '../agent-state-machine';

describe('agent-state-machine', () => {
  describe('deriveAgentState()', () => {
    it('returns isolated when is_isolated is true', () => {
      expect(deriveAgentState({ is_isolated: true })).toBe('isolated');
    });

    it('returns safe_mode when safe_mode fields are set', () => {
      expect(deriveAgentState({
        safe_mode_entered_at: '2025-01-01',
        safe_mode_reason: 'test',
      })).toBe('safe_mode');
    });

    it('returns offline when heartbeat is stale', () => {
      const oldDate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      expect(deriveAgentState({ last_heartbeat: oldDate })).toBe('offline');
    });

    it('returns offline for pending status with no heartbeat', () => {
      expect(deriveAgentState({ status: 'pending' })).toBe('offline');
    });

    it('returns updating when force_update is recent', () => {
      const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
      expect(deriveAgentState({
        force_update_version: '2.0',
        force_update_at: recent,
        last_heartbeat: new Date().toISOString(),
        status: 'active',
      })).toBe('updating');
    });

    it('returns degraded when is_throttled', () => {
      expect(deriveAgentState({
        is_throttled: true,
        last_heartbeat: new Date().toISOString(),
        status: 'active',
      })).toBe('degraded');
    });

    it('returns healthy for active agent with recent heartbeat', () => {
      expect(deriveAgentState({
        status: 'active',
        last_heartbeat: new Date().toISOString(),
      })).toBe('healthy');
    });

    it('returns offline as default fallback', () => {
      expect(deriveAgentState({})).toBe('offline');
    });
  });

  describe('getStateDescription()', () => {
    it('returns description for every state', () => {
      const states = Object.keys(STATE_DESCRIPTIONS) as Array<keyof typeof STATE_DESCRIPTIONS>;
      for (const state of states) {
        const desc = getStateDescription(state);
        expect(desc.label).toBeTruthy();
        expect(desc.color).toBeTruthy();
        expect(desc.icon).toBeTruthy();
      }
    });
  });

  describe('isTransitionAllowed()', () => {
    it('allows healthy to degraded', () => {
      expect(isTransitionAllowed('healthy', 'degraded')).toBe(true);
    });

    it('blocks shutdown to any state', () => {
      expect(isTransitionAllowed('shutdown', 'healthy')).toBe(false);
      expect(isTransitionAllowed('shutdown', 'offline')).toBe(false);
    });

    it('blocks quarantined to offline', () => {
      expect(isTransitionAllowed('quarantined', 'offline')).toBe(false);
    });

    it('allows quarantined to healthy', () => {
      expect(isTransitionAllowed('quarantined', 'healthy')).toBe(true);
    });
  });

  describe('getStateColorClasses()', () => {
    it('returns color classes for healthy state', () => {
      const classes = getStateColorClasses('healthy');
      expect(classes.bg).toContain('bg-');
      expect(classes.text).toContain('text-');
      expect(classes.border).toContain('border-');
    });

    it('returns color classes for all states', () => {
      const states = Object.keys(STATE_DESCRIPTIONS) as Array<keyof typeof STATE_DESCRIPTIONS>;
      for (const state of states) {
        const classes = getStateColorClasses(state);
        expect(classes).toHaveProperty('bg');
        expect(classes).toHaveProperty('text');
        expect(classes).toHaveProperty('border');
      }
    });
  });
});
