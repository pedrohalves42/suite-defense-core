import { describe, it, expect } from 'vitest';

/**
 * HMAC Helper Tests
 * Tests pure helper functions used in HMAC verification
 */

// Mirror of the hexToBytes function from hmac.ts
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/i.test(clean)) {
    throw new Error(`Invalid HMAC secret format: expected 64 hex chars, got ${clean.length}`);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 64; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

// Mirror of parseTimestampToMs
function parseTimestampToMs(rawTimestamp: string): number | null {
  const parsed = Number.parseInt(rawTimestamp, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed < 1e12 ? parsed * 1000 : parsed;
}

// Mirror of uniqueNonEmpty
function uniqueNonEmpty(values: Array<string | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

describe('hexToBytes', () => {
  it('converts valid 64-char hex to 32 bytes', () => {
    const hex = 'a'.repeat(64);
    const bytes = hexToBytes(hex);
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(0xaa);
  });

  it('throws for invalid hex length', () => {
    expect(() => hexToBytes('abc')).toThrow('Invalid HMAC secret format');
  });

  it('throws for non-hex characters', () => {
    expect(() => hexToBytes('g'.repeat(64))).toThrow('Invalid HMAC secret format');
  });

  it('handles mixed case', () => {
    const hex = 'aAbBcCdDeEfF' + '0'.repeat(52);
    const bytes = hexToBytes(hex);
    expect(bytes[0]).toBe(0xaa);
    expect(bytes[1]).toBe(0xbb);
  });

  it('trims whitespace', () => {
    const hex = '  ' + 'a'.repeat(64) + '  ';
    const bytes = hexToBytes(hex);
    expect(bytes.length).toBe(32);
  });
});

describe('parseTimestampToMs', () => {
  it('converts seconds to milliseconds', () => {
    const result = parseTimestampToMs('1700000000');
    expect(result).toBe(1700000000000);
  });

  it('keeps milliseconds as-is', () => {
    const result = parseTimestampToMs('1700000000000');
    expect(result).toBe(1700000000000);
  });

  it('returns null for non-numeric input', () => {
    expect(parseTimestampToMs('abc')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTimestampToMs('')).toBeNull();
  });

  it('handles edge case at 1e12 boundary', () => {
    const justBelow = parseTimestampToMs('999999999999');
    expect(justBelow).toBe(999999999999000); // treated as seconds
    const atBoundary = parseTimestampToMs('1000000000000');
    expect(atBoundary).toBe(1000000000000); // treated as ms
  });
});

describe('uniqueNonEmpty', () => {
  it('removes nulls and empty strings', () => {
    expect(uniqueNonEmpty([null, '', '  ', 'valid'])).toEqual(['valid']);
  });

  it('deduplicates values', () => {
    expect(uniqueNonEmpty(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace before dedup', () => {
    expect(uniqueNonEmpty([' a ', 'a'])).toEqual(['a']);
  });

  it('preserves order', () => {
    expect(uniqueNonEmpty(['c', 'b', 'a'])).toEqual(['c', 'b', 'a']);
  });

  it('returns empty for all-null input', () => {
    expect(uniqueNonEmpty([null, null])).toEqual([]);
  });
});
