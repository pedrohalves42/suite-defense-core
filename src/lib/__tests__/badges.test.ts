import { describe, it, expect } from 'vitest';
import {
  getRoleBadgeVariant,
  getUserStatusVariant,
  getUserStatusText,
  getTimeSince,
} from '../badges';

describe('badges', () => {
  describe('getRoleBadgeVariant()', () => {
    it('returns destructive for super_admin', () => {
      expect(getRoleBadgeVariant('super_admin')).toBe('destructive');
    });

    it('returns default for admin', () => {
      expect(getRoleBadgeVariant('admin')).toBe('default');
    });

    it('returns secondary for operator', () => {
      expect(getRoleBadgeVariant('operator')).toBe('secondary');
    });

    it('returns outline for viewer', () => {
      expect(getRoleBadgeVariant('viewer')).toBe('outline');
    });
  });

  describe('getUserStatusVariant()', () => {
    it('returns default for active', () => {
      expect(getUserStatusVariant(true)).toBe('default');
    });

    it('returns secondary for inactive', () => {
      expect(getUserStatusVariant(false)).toBe('secondary');
    });
  });

  describe('getUserStatusText()', () => {
    it('returns "Ativo" for active', () => {
      expect(getUserStatusText(true)).toBe('Ativo');
    });

    it('returns "Inativo" for inactive', () => {
      expect(getUserStatusText(false)).toBe('Inativo');
    });
  });

  describe('getTimeSince()', () => {
    it('returns "Nunca" for null', () => {
      expect(getTimeSince(null)).toBe('Nunca');
    });

    it('returns "Agora mesmo" for recent dates', () => {
      const now = new Date().toISOString();
      expect(getTimeSince(now)).toBe('Agora mesmo');
    });

    it('returns minutes for recent past', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(getTimeSince(fiveMinAgo)).toMatch(/\d+min atras/);
    });

    it('returns hours for past hours', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(getTimeSince(threeHoursAgo)).toMatch(/\d+h atras/);
    });

    it('returns days for past days', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      expect(getTimeSince(twoDaysAgo)).toMatch(/\d+d atras/);
    });
  });
});
