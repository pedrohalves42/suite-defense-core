import { describe, it, expect } from 'vitest';
import { getMemberLimit, buildDisplayName } from '../subscriptionLimits';

describe('subscriptionLimits', () => {
  describe('getMemberLimit()', () => {
    it('returns free plan limit when no subscription', () => {
      expect(getMemberLimit(null)).toBe(5);
      expect(getMemberLimit(undefined)).toBe(5);
    });

    it('uses quota from features.max_users', () => {
      expect(getMemberLimit({ features: { max_users: { quota_limit: 100 } } })).toBe(100);
    });

    it('uses plan_name to determine limit', () => {
      expect(getMemberLimit({ plan_name: 'pro' })).toBe(50);
      expect(getMemberLimit({ plan_name: 'starter' })).toBe(20);
    });

    it('returns null (unlimited) for enterprise', () => {
      expect(getMemberLimit({ plan_name: 'enterprise' })).toBeNull();
    });

    it('uses plan_id as fallback', () => {
      expect(getMemberLimit({ plan_id: 'pro' })).toBe(50);
    });

    it('uses plan.id as deeper fallback', () => {
      expect(getMemberLimit({ plan: { id: 'starter' } })).toBe(20);
    });

    it('uses fallbackPlan parameter', () => {
      expect(getMemberLimit(null, 'pro')).toBe(50);
    });

    it('falls back to free for unknown plan', () => {
      expect(getMemberLimit({ plan_name: 'unknown_plan' })).toBe(5);
    });
  });

  describe('buildDisplayName()', () => {
    it('uses profile full_name first', () => {
      expect(buildDisplayName({ email: 'a@b.com' }, { full_name: 'John Doe' })).toBe('John Doe');
    });

    it('uses user_metadata.full_name as fallback', () => {
      expect(buildDisplayName({ email: 'a@b.com', user_metadata: { full_name: 'Jane' } })).toBe('Jane');
    });

    it('uses email prefix as fallback', () => {
      expect(buildDisplayName({ email: 'john@example.com' })).toBe('john');
    });

    it('returns "Usuario" as last resort', () => {
      expect(buildDisplayName({})).toBe('Usuario');
      expect(buildDisplayName(null)).toBe('Usuario');
    });

    it('trims whitespace from names', () => {
      expect(buildDisplayName({}, { full_name: '  John  ' })).toBe('John');
    });
  });
});
