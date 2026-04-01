import { describe, it, expect } from 'vitest';
import { getDeltaInfo, formatCurrency } from '@/hooks/useRiskDelta';

describe('getDeltaInfo', () => {
  it('returns stable for null delta', () => {
    const result = getDeltaInfo(null);
    expect(result.icon).toBe('stable');
    expect(result.label).toBe('Estável');
  });

  it('returns stable for zero delta', () => {
    const result = getDeltaInfo(0);
    expect(result.icon).toBe('stable');
  });

  it('returns down (positive) for negative delta', () => {
    const result = getDeltaInfo(-5);
    expect(result.icon).toBe('down');
    expect(result.label).toBe('5 pontos');
    expect(result.color).toContain('success');
  });

  it('returns up (negative) for positive delta', () => {
    const result = getDeltaInfo(3);
    expect(result.icon).toBe('up');
    expect(result.label).toBe('+3 pontos');
    expect(result.color).toContain('destructive');
  });
});

describe('formatCurrency', () => {
  it('returns R$ 0 for null', () => {
    expect(formatCurrency(null)).toBe('R$ 0');
  });

  it('formats BRL currency', () => {
    const result = formatCurrency(1500);
    expect(result).toContain('1.500');
  });

  it('formats zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });
});
