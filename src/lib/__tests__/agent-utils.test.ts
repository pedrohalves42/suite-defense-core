import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAgentDisplayName, getAgentStatusInfo, getJobTypeName, getDefaultJobPayload, formatRelativeTimePt } from '../agent-utils';

describe('agent-utils', () => {
  describe('getAgentDisplayName', () => {
    it('prioritizes agent_name', () => {
      expect(getAgentDisplayName({ agent_name: 'PC-01', display_name: 'Display', hostname: 'host' })).toBe('PC-01');
    });

    it('falls back to display_name', () => {
      expect(getAgentDisplayName({ display_name: 'Display' })).toBe('Display');
    });

    it('returns default for empty agent', () => {
      expect(getAgentDisplayName({})).toBe('Computador Desconhecido');
    });
  });

  describe('getAgentStatusInfo', () => {
    it('returns online for healthy agent_state', () => {
      const info = getAgentStatusInfo({ agent_state: 'healthy' });
      expect(info.isOnline).toBe(true);
      expect(info.label).toBe('Online');
    });

    it('returns offline for offline agent_state', () => {
      const info = getAgentStatusInfo({ agent_state: 'offline' });
      expect(info.isOnline).toBe(false);
      expect(info.label).toBe('Offline');
    });

    it('returns warning for degraded', () => {
      const info = getAgentStatusInfo({ agent_state: 'degraded' });
      expect(info.isOnline).toBe(true);
      expect(info.label).toBe('Atenção');
    });

    it('returns never connected when no heartbeat', () => {
      const info = getAgentStatusInfo({});
      expect(info.label).toBe('Nunca Conectou');
    });
  });

  describe('getJobTypeName', () => {
    it('translates known job types', () => {
      expect(getJobTypeName('software_inventory_collect')).toBe('Inventário de Software');
      expect(getJobTypeName('light_vuln_scan')).toBe('Análise de Vulnerabilidades');
    });

    it('formats unknown types', () => {
      expect(getJobTypeName('custom_job')).toBe('Custom Job');
    });
  });

  describe('getDefaultJobPayload', () => {
    it('returns payload for known types', () => {
      const payload = getDefaultJobPayload('software_inventory_collect');
      expect(payload.include_32bit).toBe(true);
    });

    it('returns empty for unknown types', () => {
      expect(getDefaultJobPayload('unknown')).toEqual({});
    });
  });

  describe('formatRelativeTimePt', () => {
    it('returns "Nunca" for null', () => {
      expect(formatRelativeTimePt(null)).toBe('Nunca');
    });

    it('returns "Agora mesmo" for recent date', () => {
      expect(formatRelativeTimePt(new Date())).toBe('Agora mesmo');
    });

    it('returns minutes for recent past', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTimePt(fiveMinAgo)).toBe('5 min atrás');
    });

    it('returns hours for same-day past', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      expect(formatRelativeTimePt(threeHoursAgo)).toBe('3h atrás');
    });

    it('returns days for recent past', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTimePt(twoDaysAgo)).toBe('2 dias atrás');
    });

    it('handles string input', () => {
      expect(formatRelativeTimePt(new Date().toISOString())).toBe('Agora mesmo');
    });
  });
});
