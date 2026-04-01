import { describe, it, expect } from 'vitest';
import { Result } from '@/domain/shared/Result';
import { DomainError, InvalidArgumentError, BusinessRuleViolationError } from '@/domain/shared/DomainError';

describe('Result', () => {
  describe('success()', () => {
    it('creates a successful result', () => {
      const r = Result.success(42);
      expect(r.isSuccess).toBe(true);
      expect(r.isFailure).toBe(false);
      expect(r.value).toBe(42);
    });
  });

  describe('failure()', () => {
    it('creates a failed result', () => {
      const r = Result.failure(new Error('fail'));
      expect(r.isFailure).toBe(true);
      expect(r.isSuccess).toBe(false);
      expect(r.error.message).toBe('fail');
    });
  });

  describe('value getter', () => {
    it('throws when accessing value on failure', () => {
      const r = Result.failure(new Error('fail'));
      expect(() => r.value).toThrow();
    });
  });

  describe('error getter', () => {
    it('throws when accessing error on success', () => {
      const r = Result.success(42);
      expect(() => r.error).toThrow();
    });
  });

  describe('map()', () => {
    it('transforms success value', () => {
      const r = Result.success(5).map(v => v * 2);
      expect(r.value).toBe(10);
    });

    it('propagates failure', () => {
      const r = Result.failure<number>(new Error('fail')).map(v => v * 2);
      expect(r.isFailure).toBe(true);
    });
  });

  describe('flatMap()', () => {
    it('chains successful results', () => {
      const r = Result.success(5).flatMap(v => Result.success(v * 2));
      expect(r.value).toBe(10);
    });

    it('propagates failure', () => {
      const r = Result.failure<number>(new Error('fail')).flatMap(v => Result.success(v * 2));
      expect(r.isFailure).toBe(true);
    });

    it('propagates inner failure', () => {
      const r = Result.success(5).flatMap(() => Result.failure(new Error('inner')));
      expect(r.isFailure).toBe(true);
      expect(r.error.message).toBe('inner');
    });
  });

  describe('getOrElse()', () => {
    it('returns value on success', () => {
      expect(Result.success(42).getOrElse(0)).toBe(42);
    });

    it('returns default on failure', () => {
      expect(Result.failure<number>(new Error('fail')).getOrElse(0)).toBe(0);
    });
  });
});

describe('DomainError', () => {
  it('creates with message and code', () => {
    const err = new DomainError('test');
    expect(err.message).toBe('test');
    expect(err.code).toBe('DOMAIN_ERROR');
    expect(err.name).toBe('DomainError');
  });

  it('creates InvalidArgumentError', () => {
    const err = new InvalidArgumentError('email', 'invalid format');
    expect(err.message).toContain('email');
    expect(err.message).toContain('invalid format');
    expect(err.code).toBe('INVALID_ARGUMENT');
  });

  it('creates BusinessRuleViolationError', () => {
    const err = new BusinessRuleViolationError('cannot delete active agent');
    expect(err.message).toContain('cannot delete active agent');
    expect(err.code).toBe('BUSINESS_RULE_VIOLATION');
  });
});
