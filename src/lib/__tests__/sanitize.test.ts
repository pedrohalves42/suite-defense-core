import { describe, it, expect, vi } from 'vitest';
import { sanitizeForLog, sanitizeError } from '../sanitize';

describe('sanitize', () => {
  describe('sanitizeForLog()', () => {
    it('returns null/undefined as-is', () => {
      expect(sanitizeForLog(null)).toBeNull();
      expect(sanitizeForLog(undefined)).toBeUndefined();
    });

    it('returns primitives as-is', () => {
      expect(sanitizeForLog(42)).toBe(42);
      expect(sanitizeForLog(true)).toBe(true);
      expect(sanitizeForLog('hello')).toBe('hello');
    });

    it('redacts sensitive keys', () => {
      const input = { username: 'john', password: 'secret123', data: 'ok' };
      const result = sanitizeForLog(input) as any;
      expect(result.username).toBe('john');
      expect(result.password).toBe('[REDACTED]');
      expect(result.data).toBe('ok');
    });

    it('redacts nested sensitive keys', () => {
      const input = { config: { api_key: 'abc123', host: 'example.com' } };
      const result = sanitizeForLog(input) as any;
      expect(result.config.api_key).toBe('[REDACTED]');
      expect(result.config.host).toBe('example.com');
    });

    it('redacts long token-like strings', () => {
      const longToken = 'A'.repeat(50);
      const result = sanitizeForLog(longToken) as string;
      expect(result).toContain('[REDACTED]');
      expect(result).toContain('AAAAAAAA...');
    });

    it('does not redact short strings', () => {
      expect(sanitizeForLog('short')).toBe('short');
    });

    it('handles arrays', () => {
      const input = [{ token: 'secret' }, 'hello'];
      const result = sanitizeForLog(input) as any[];
      expect(result[0].token).toBe('[REDACTED]');
      expect(result[1]).toBe('hello');
    });

    it('respects max depth', () => {
      let nested: any = { value: 'deep' };
      for (let i = 0; i < 10; i++) {
        nested = { child: nested };
      }
      const result = sanitizeForLog(nested) as any;
      // Should not throw, deep values become '[MAX_DEPTH]'
      expect(result).toBeDefined();
    });

    it('converts unknown types to string', () => {
      const sym = Symbol('test');
      expect(sanitizeForLog(sym)).toBe('Symbol(test)');
    });

    it('redacts keys containing sensitive substrings', () => {
      const input = { myApiKey: 'val', refreshToken: 'tok', normal: 'ok' };
      const result = sanitizeForLog(input) as any;
      expect(result.myApiKey).toBe('[REDACTED]');
      expect(result.refreshToken).toBe('[REDACTED]');
      expect(result.normal).toBe('ok');
    });
  });

  describe('sanitizeError()', () => {
    it('sanitizes Error instances', () => {
      const err = new Error('test error');
      const result = sanitizeError(err);
      expect(result.name).toBe('Error');
      expect(result.message).toBe('test error');
    });

    it('sanitizes non-Error values', () => {
      const result = sanitizeError('something went wrong');
      expect(result.raw).toBe('something went wrong');
    });

    it('includes code if present on error', () => {
      const err: any = new Error('fail');
      err.code = 'ENOENT';
      const result = sanitizeError(err);
      expect(result.code).toBe('ENOENT');
    });
  });
});
