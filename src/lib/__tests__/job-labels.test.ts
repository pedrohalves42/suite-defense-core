import { describe, it, expect } from 'vitest';
import { getJobTypeLabel, getJobStatusLabel, getJobTypeLabelNoEmoji, isProcessProtected, isServiceProtected, PROTECTED_PROCESSES, PROTECTED_SERVICES, UI_TERMINOLOGY, JOB_TYPE_LABELS } from '../job-labels';

describe('job-labels', () => {
  describe('getJobTypeLabel', () => {
    it('returns label for known type', () => {
      expect(getJobTypeLabel('scan')).toContain('Verificar arquivos');
    });

    it('returns original for unknown type', () => {
      expect(getJobTypeLabel('custom_unknown')).toBe('custom_unknown');
    });
  });

  describe('getJobStatusLabel', () => {
    it('returns label for known status', () => {
      expect(getJobStatusLabel('completed')).toContain('Concluído');
      expect(getJobStatusLabel('failed')).toContain('Falhou');
    });

    it('returns original for unknown status', () => {
      expect(getJobStatusLabel('xyz')).toBe('xyz');
    });
  });

  describe('getJobTypeLabelNoEmoji', () => {
    it('returns label without emoji', () => {
      const label = getJobTypeLabelNoEmoji('scan');
      expect(label).toBe('Verificar arquivos');
      expect(label).not.toMatch(/[\u{1F600}-\u{1F6FF}]/u);
    });
  });

  describe('isProcessProtected', () => {
    it('identifies critical Windows processes', () => {
      expect(isProcessProtected('csrss.exe')).toBe(true);
      expect(isProcessProtected('lsass.exe')).toBe(true);
      expect(isProcessProtected('svchost.exe')).toBe(true);
    });

    it('is case insensitive', () => {
      expect(isProcessProtected('CSRSS.EXE')).toBe(true);
    });

    it('allows non-critical processes', () => {
      expect(isProcessProtected('notepad.exe')).toBe(false);
    });
  });

  describe('isServiceProtected', () => {
    it('identifies critical services', () => {
      expect(isServiceProtected('WinDefend')).toBe(true);
      expect(isServiceProtected('eventlog')).toBe(true);
    });

    it('allows non-critical services', () => {
      expect(isServiceProtected('CustomApp')).toBe(false);
    });
  });

  it('UI_TERMINOLOGY uses human language', () => {
    expect(UI_TERMINOLOGY.agent).toBe('Computador');
    expect(UI_TERMINOLOGY.job).toBe('Verificação');
  });

  it('JOB_TYPE_LABELS covers main types', () => {
    expect(Object.keys(JOB_TYPE_LABELS).length).toBeGreaterThan(20);
  });
});
