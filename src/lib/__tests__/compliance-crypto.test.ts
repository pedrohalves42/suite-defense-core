import { describe, it, expect } from 'vitest';
import { generateSHA256, generateHMAC, verifySHA256, verifyHMAC, generateAuditId, generateEvidenceHash, serializeForHash } from '../compliance/crypto';

describe('compliance/crypto', () => {
  describe('generateSHA256', () => {
    it('returns 64-char hex hash', async () => {
      const hash = await generateSHA256('hello');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic', async () => {
      const h1 = await generateSHA256('test');
      const h2 = await generateSHA256('test');
      expect(h1).toBe(h2);
    });

    it('different inputs give different hashes', async () => {
      const h1 = await generateSHA256('a');
      const h2 = await generateSHA256('b');
      expect(h1).not.toBe(h2);
    });

    it('handles empty string', async () => {
      const hash = await generateSHA256('');
      expect(hash).toHaveLength(64);
    });
  });

  describe('generateHMAC', () => {
    it('returns 64-char hex signature', async () => {
      const sig = await generateHMAC('message', 'secret');
      expect(sig).toHaveLength(64);
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic with same key', async () => {
      const s1 = await generateHMAC('msg', 'key');
      const s2 = await generateHMAC('msg', 'key');
      expect(s1).toBe(s2);
    });

    it('different keys give different signatures', async () => {
      const s1 = await generateHMAC('msg', 'key1');
      const s2 = await generateHMAC('msg', 'key2');
      expect(s1).not.toBe(s2);
    });
  });

  describe('verifySHA256', () => {
    it('returns true for matching hash', async () => {
      const hash = await generateSHA256('data');
      expect(await verifySHA256('data', hash)).toBe(true);
    });

    it('returns false for wrong hash', async () => {
      expect(await verifySHA256('data', 'wrong')).toBe(false);
    });
  });

  describe('verifyHMAC', () => {
    it('returns true for valid signature', async () => {
      const sig = await generateHMAC('content', 'secret');
      expect(await verifyHMAC('content', 'secret', sig)).toBe(true);
    });

    it('returns false for invalid signature', async () => {
      expect(await verifyHMAC('content', 'secret', 'invalid')).toBe(false);
    });

    it('returns false for wrong secret', async () => {
      const sig = await generateHMAC('content', 'secret1');
      expect(await verifyHMAC('content', 'secret2', sig)).toBe(false);
    });
  });

  describe('generateAuditId', () => {
    it('matches LAUDO-{hex}-{timestamp} format', () => {
      const id = generateAuditId();
      expect(id).toMatch(/^LAUDO-[A-F0-9]{8}-\d+$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 10 }, () => generateAuditId()));
      expect(ids.size).toBe(10);
    });
  });

  describe('generateEvidenceHash', () => {
    it('returns 16-char truncated hash', async () => {
      const hash = await generateEvidenceHash({ key: 'value' });
      expect(hash).toHaveLength(16);
    });

    it('is deterministic', async () => {
      const h1 = await generateEvidenceHash({ a: 1 });
      const h2 = await generateEvidenceHash({ a: 1 });
      expect(h1).toBe(h2);
    });
  });

  describe('serializeForHash', () => {
    it('removes sha256 and hmac_signature', () => {
      const result = serializeForHash({ name: 'test', sha256: 'abc', hmac_signature: 'xyz', extra: 1 });
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ name: 'test', extra: 1 });
      expect(parsed.sha256).toBeUndefined();
      expect(parsed.hmac_signature).toBeUndefined();
    });

    it('handles object without hash fields', () => {
      const result = serializeForHash({ a: 1, b: 2 });
      expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
    });
  });
});
