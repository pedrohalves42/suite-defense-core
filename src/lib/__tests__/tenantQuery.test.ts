import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn() },
}));

import { validateTenantId, isMultiTenantTable } from '../tenantQuery';

describe('tenantQuery', () => {
  describe('validateTenantId', () => {
    it('returns true for valid tenant ID', () => {
      expect(validateTenantId('tenant-123', 'agents')).toBe(true);
    });

    it('returns false for undefined', () => {
      expect(validateTenantId(undefined, 'agents')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(validateTenantId('', 'agents')).toBe(false);
    });
  });

  describe('isMultiTenantTable', () => {
    it('identifies multi-tenant tables', () => {
      expect(isMultiTenantTable('agents')).toBe(true);
      expect(isMultiTenantTable('jobs')).toBe(true);
      expect(isMultiTenantTable('ai_insights')).toBe(true);
    });

    it('identifies non-multi-tenant tables', () => {
      expect(isMultiTenantTable('nonexistent_table')).toBe(false);
    });
  });
});
