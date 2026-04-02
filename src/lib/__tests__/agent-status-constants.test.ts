import { describe, it, expect } from 'vitest';
import { AGENT_STATUS_THRESHOLDS, AGENT_STATUS_LABELS, isAgentOnline, getAgentOnlineStatus, OFFLINE_THRESHOLD_MS } from '../agent-status-constants';

describe('agent-status-constants', () => {
  it('has correct thresholds', () => {
    expect(AGENT_STATUS_THRESHOLDS.ONLINE_MAX_MINUTES).toBe(15);
    expect(AGENT_STATUS_THRESHOLDS.WARNING_MAX_MINUTES).toBe(30);
    expect(AGENT_STATUS_THRESHOLDS.OFFLINE_MIN_MINUTES).toBe(30);
  });

  it('OFFLINE_THRESHOLD_MS matches minutes', () => {
    expect(OFFLINE_THRESHOLD_MS).toBe(AGENT_STATUS_THRESHOLDS.OFFLINE_MIN_MINUTES * 60 * 1000);
  });

  it('has all status labels', () => {
    expect(AGENT_STATUS_LABELS.healthy).toBe('Protegido');
    expect(AGENT_STATUS_LABELS.offline).toBe('Offline');
    expect(AGENT_STATUS_LABELS.archived).toBe('Arquivado');
  });

  describe('getAgentOnlineStatus', () => {
    it('returns online for healthy state', () => {
      expect(getAgentOnlineStatus({ agent_state: 'healthy' })).toBe('online');
    });

    it('returns online for enforcing state', () => {
      expect(getAgentOnlineStatus({ agent_state: 'enforcing' })).toBe('online');
    });

    it('returns warning for degraded state', () => {
      expect(getAgentOnlineStatus({ agent_state: 'degraded' })).toBe('warning');
    });

    it('returns warning for safe_mode', () => {
      expect(getAgentOnlineStatus({ agent_state: 'safe_mode' })).toBe('warning');
    });

    it('returns offline for error state', () => {
      expect(getAgentOnlineStatus({ agent_state: 'error' })).toBe('offline');
    });

    it('returns never_connected when no heartbeat', () => {
      expect(getAgentOnlineStatus({})).toBe('never_connected');
    });

    it('returns online for recent heartbeat', () => {
      const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(getAgentOnlineStatus({ last_heartbeat: recent })).toBe('online');
    });

    it('returns warning for heartbeat in warning range', () => {
      const mins20ago = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      expect(getAgentOnlineStatus({ last_heartbeat: mins20ago })).toBe('warning');
    });

    it('returns offline for old heartbeat', () => {
      const hoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(getAgentOnlineStatus({ last_heartbeat: hoursAgo })).toBe('offline');
    });
  });

  describe('isAgentOnline', () => {
    it('returns true for recent heartbeat', () => {
      expect(isAgentOnline(new Date().toISOString())).toBe(true);
    });

    it('returns false for null', () => {
      expect(isAgentOnline(null)).toBe(false);
    });

    it('returns false for old heartbeat', () => {
      const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      expect(isAgentOnline(old)).toBe(false);
    });
  });
});
