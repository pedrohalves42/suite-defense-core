import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('utils', () => {
  describe('cn', () => {
    it('merges class names', () => {
      expect(cn('a', 'b')).toBe('a b');
    });

    it('handles conditional classes', () => {
      expect(cn('a', false && 'b', 'c')).toBe('a c');
    });

    it('merges tailwind conflicts', () => {
      expect(cn('p-4', 'p-2')).toBe('p-2');
    });

    it('handles empty inputs', () => {
      expect(cn()).toBe('');
    });

    it('handles undefined and null', () => {
      expect(cn('a', undefined, null, 'b')).toBe('a b');
    });
  });
});
