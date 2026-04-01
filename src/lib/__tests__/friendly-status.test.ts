import { describe, it, expect } from 'vitest';
import {
  getFriendlyAgentStatus,
  getFriendlyAlertMessage,
  getFriendlySeverity,
  getFriendlyJobType,
  getFriendlyJobStatus,
  getTechGlossaryTerm,
  AGENT_STATUS_LABELS,
  SEVERITY_LABELS,
  JOB_TYPE_LABELS,
} from '../friendly-status';

describe('friendly-status', () => {
  describe('getFriendlyAgentStatus()', () => {
    it('returns "online" for active agent with recent heartbeat', () => {
      const recent = new Date().toISOString();
      const result = getFriendlyAgentStatus('active', recent);
      expect(result.label).toBe(AGENT_STATUS_LABELS['online'].label);
    });

    it('returns "offline" for active agent with old heartbeat', () => {
      const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const result = getFriendlyAgentStatus('active', old);
      expect(result.label).toBe(AGENT_STATUS_LABELS['offline'].label);
    });

    it('returns status label for non-active agent', () => {
      const result = getFriendlyAgentStatus('pending', null);
      expect(result.label).toBe(AGENT_STATUS_LABELS['pending'].label);
    });

    it('returns raw status for unknown status', () => {
      const result = getFriendlyAgentStatus('unknown_status', null);
      expect(result.label).toBe('unknown_status');
    });
  });

  describe('getFriendlyAlertMessage()', () => {
    it('returns known alert message', () => {
      const result = getFriendlyAlertMessage('high_cpu');
      expect(result.title).toBe('Computador lento');
    });

    it('returns formatted fallback for unknown alert', () => {
      const result = getFriendlyAlertMessage('custom_alert');
      expect(result.title).toBe('Custom Alert');
    });
  });

  describe('getFriendlySeverity()', () => {
    it('returns known severity', () => {
      expect(getFriendlySeverity('critical').label).toBe('Urgente');
    });

    it('returns info fallback for unknown', () => {
      const result = getFriendlySeverity('unknown');
      expect(result.label).toBe(SEVERITY_LABELS['info'].label);
    });
  });

  describe('getFriendlyJobType()', () => {
    it('returns known job type label', () => {
      expect(getFriendlyJobType('software_inventory_collect')).toBe('Verificar programas instalados');
    });

    it('returns raw type for unknown', () => {
      expect(getFriendlyJobType('custom_job')).toBe('custom_job');
    });
  });

  describe('getFriendlyJobStatus()', () => {
    it('returns known job status', () => {
      expect(getFriendlyJobStatus('completed').label).toBe('Concluído');
    });

    it('returns raw status for unknown', () => {
      expect(getFriendlyJobStatus('custom').label).toBe('custom');
    });
  });

  describe('getTechGlossaryTerm()', () => {
    it('returns known term', () => {
      expect(getTechGlossaryTerm('heartbeat')?.term).toBe('Sinal de Vida');
    });

    it('returns null for unknown term', () => {
      expect(getTechGlossaryTerm('nonexistent')).toBeNull();
    });
  });
});
