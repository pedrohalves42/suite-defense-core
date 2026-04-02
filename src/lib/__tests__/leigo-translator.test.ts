import { describe, it, expect } from 'vitest';
import { translateTerm, simplifyMessage, getFailureExplanation, getAlertExplanation, formatErrorForUser, humanizeStatus, TECH_TO_SIMPLE, FAILURE_CLASS_LABELS, ALERT_TYPE_LABELS } from '../leigo-translator';

describe('leigo-translator', () => {
  describe('translateTerm', () => {
    it('translates known terms', () => {
      expect(translateTerm('CPU')).toBe('processador');
      expect(translateTerm('RAM')).toBe('memória');
      expect(translateTerm('firewall')).toBe('proteção de rede');
    });

    it('returns original for unknown terms', () => {
      expect(translateTerm('xyzzy')).toBe('xyzzy');
    });

    it('handles case variations', () => {
      expect(translateTerm('cpu')).toBe('processador');
    });
  });

  describe('simplifyMessage', () => {
    it('replaces technical terms', () => {
      const result = simplifyMessage('High CPU usage detected');
      expect(result.toLowerCase()).toContain('processador');
    });

    it('handles empty string', () => {
      expect(simplifyMessage('')).toBe('');
    });
  });

  describe('getFailureExplanation', () => {
    it('returns known failure class', () => {
      const result = getFailureExplanation('AGENT_OFFLINE');
      expect(result.title).toBe('Computador Desligado');
      expect(result.icon).toBe('🔌');
    });

    it('returns UNKNOWN for unknown class', () => {
      const result = getFailureExplanation('NONEXISTENT');
      expect(result.title).toBe('Erro Desconhecido');
    });
  });

  describe('getAlertExplanation', () => {
    it('returns known alert type', () => {
      const result = getAlertExplanation('high_cpu');
      expect(result.title).toBe('Computador Muito Lento');
      expect(result.analogy).toBeTruthy();
    });

    it('returns default for unknown type', () => {
      const result = getAlertExplanation('nonexistent');
      expect(result.title).toBe('Alerta');
    });
  });

  describe('formatErrorForUser', () => {
    it('handles network errors', () => {
      const result = formatErrorForUser(new Error('network error'));
      expect(result.title).toBe('Problema de conexão');
    });

    it('handles timeout errors', () => {
      const result = formatErrorForUser('timeout occurred');
      expect(result.title).toBe('Tempo esgotado');
    });

    it('handles 401 unauthorized', () => {
      const result = formatErrorForUser('401 unauthorized');
      expect(result.title).toBe('Sessão expirada');
    });

    it('handles 403 forbidden', () => {
      const result = formatErrorForUser('403 forbidden');
      expect(result.title).toBe('Sem permissão');
    });

    it('handles 500 server error', () => {
      const result = formatErrorForUser('500 internal server error');
      expect(result.title).toBe('Erro interno');
    });

    it('returns generic for unknown errors', () => {
      const result = formatErrorForUser('something weird');
      expect(result.title).toBe('Algo deu errado');
      expect(result.suggestion).toBeTruthy();
    });
  });

  describe('humanizeStatus', () => {
    it('translates known statuses', () => {
      expect(humanizeStatus('completed')).toContain('Pronto');
      expect(humanizeStatus('failed')).toContain('Não deu certo');
      expect(humanizeStatus('running')).toContain('Executando');
      expect(humanizeStatus('critical')).toContain('Urgente');
    });

    it('returns original for unknown status', () => {
      expect(humanizeStatus('custom_status')).toBe('custom_status');
    });
  });

  it('TECH_TO_SIMPLE has comprehensive coverage', () => {
    expect(Object.keys(TECH_TO_SIMPLE).length).toBeGreaterThan(50);
  });

  it('FAILURE_CLASS_LABELS covers common classes', () => {
    const required = ['AGENT_OFFLINE', 'TIMEOUT', 'PERMISSION_DENIED', 'UNKNOWN'];
    for (const key of required) {
      expect(FAILURE_CLASS_LABELS[key]).toBeDefined();
    }
  });
});
