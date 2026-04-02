import { describe, it, expect, vi } from 'vitest';
import { mapErrorToHuman } from '../humanized-toast';

describe('humanized-toast', () => {
  describe('mapErrorToHuman', () => {
    it('maps network errors', () => {
      const result = mapErrorToHuman(new Error('network failure'));
      expect(result.title).toBe('Sem conexão');
    });

    it('maps timeout errors', () => {
      const result = mapErrorToHuman('TIMEOUT');
      expect(result.title).toBe('Tempo esgotado');
    });

    it('maps 401 errors', () => {
      const result = mapErrorToHuman('Error 401');
      expect(result.title).toBe('Sessão expirou');
    });

    it('maps 403 errors', () => {
      const result = mapErrorToHuman('403 access');
      expect(result.title).toBe('Você não pode fazer isso');
    });

    it('maps 404 errors', () => {
      const result = mapErrorToHuman('404 not found');
      expect(result.title).toBe('Não existe');
    });

    it('maps 500 errors', () => {
      const result = mapErrorToHuman('500 server');
      expect(result.title).toBe('Erro interno');
    });

    it('maps AGENT_OFFLINE', () => {
      const result = mapErrorToHuman('AGENT_OFFLINE');
      expect(result.title).toBe('Computador desligado');
    });

    it('maps RATE_LIMIT', () => {
      const result = mapErrorToHuman('RATE_LIMIT exceeded');
      expect(result.title).toBe('Muitas tentativas');
    });

    it('returns generic for unknown errors', () => {
      const result = mapErrorToHuman('completely unknown error type xyz');
      expect(result.title).toBe('Algo deu errado');
    });
  });
});
