import { describe, it, expect } from 'vitest';
import {
  CyberShieldError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  TenantIsolationError,
  isCyberShieldError,
  getUserFriendlyMessage,
} from '../errors';

describe('errors', () => {
  describe('CyberShieldError', () => {
    it('creates with defaults', () => {
      const err = new CyberShieldError('test');
      expect(err.message).toBe('test');
      expect(err.code).toBe('CYBERSHIELD_ERROR');
      expect(err.status).toBe(500);
      expect(err.name).toBe('CyberShieldError');
      expect(err.timestamp).toBeTruthy();
    });

    it('serializes to JSON', () => {
      const err = new CyberShieldError('test', 'CODE', 400, { key: 'val' });
      const json = err.toJSON();
      expect(json.name).toBe('CyberShieldError');
      expect(json.code).toBe('CODE');
      expect(json.status).toBe(400);
      expect(json.context).toEqual({ key: 'val' });
    });
  });

  describe('ValidationError', () => {
    it('has correct code and status', () => {
      const err = new ValidationError('bad input');
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.status).toBe(400);
      expect(err.name).toBe('ValidationError');
    });
  });

  describe('AuthenticationError', () => {
    it('has correct defaults', () => {
      const err = new AuthenticationError();
      expect(err.message).toBe('Authentication required');
      expect(err.status).toBe(401);
    });
  });

  describe('AuthorizationError', () => {
    it('has correct defaults', () => {
      const err = new AuthorizationError();
      expect(err.status).toBe(403);
    });
  });

  describe('NotFoundError', () => {
    it('includes resource name', () => {
      const err = new NotFoundError('Agent', '123');
      expect(err.message).toContain('Agent');
      expect(err.message).toContain('123');
      expect(err.status).toBe(404);
    });

    it('works without id', () => {
      const err = new NotFoundError('Tenant');
      expect(err.message).toBe('Tenant not found');
    });
  });

  describe('ConflictError', () => {
    it('has status 409', () => {
      const err = new ConflictError('duplicate');
      expect(err.status).toBe(409);
    });
  });

  describe('RateLimitError', () => {
    it('has status 429 and retryAfter', () => {
      const err = new RateLimitError(30);
      expect(err.status).toBe(429);
      expect(err.retryAfter).toBe(30);
    });

    it('defaults retryAfter to 60', () => {
      const err = new RateLimitError();
      expect(err.retryAfter).toBe(60);
    });
  });

  describe('TenantIsolationError', () => {
    it('has status 403', () => {
      const err = new TenantIsolationError();
      expect(err.status).toBe(403);
      expect(err.code).toBe('TENANT_ISOLATION');
    });
  });

  describe('isCyberShieldError()', () => {
    it('returns true for CyberShieldError instances', () => {
      expect(isCyberShieldError(new ValidationError('x'))).toBe(true);
      expect(isCyberShieldError(new RateLimitError())).toBe(true);
    });

    it('returns false for generic errors', () => {
      expect(isCyberShieldError(new Error('x'))).toBe(false);
      expect(isCyberShieldError('string')).toBe(false);
      expect(isCyberShieldError(null)).toBe(false);
    });
  });

  describe('getUserFriendlyMessage()', () => {
    it('returns message from CyberShieldError', () => {
      expect(getUserFriendlyMessage(new ValidationError('bad'))).toBe('bad');
    });

    it('returns message from generic Error', () => {
      expect(getUserFriendlyMessage(new Error('oops'))).toBe('oops');
    });

    it('returns fallback for non-errors', () => {
      expect(getUserFriendlyMessage(42)).toContain('unexpected');
    });
  });
});
