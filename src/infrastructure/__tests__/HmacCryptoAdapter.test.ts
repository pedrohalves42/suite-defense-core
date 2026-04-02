import { describe, it, expect } from 'vitest';
import { HmacCryptoAdapter } from '@/infrastructure/adapters/security/HmacCryptoAdapter';

describe('HmacCryptoAdapter', () => {
  const adapter = new HmacCryptoAdapter();

  describe('generateHmacSecret', () => {
    it('returns a hex string', async () => {
      const secret = await adapter.generateHmacSecret();
      expect(secret).toMatch(/^[0-9a-f]+$/);
      expect(secret.length).toBeGreaterThan(0);
    });

    it('generates unique secrets', async () => {
      const s1 = await adapter.generateHmacSecret();
      const s2 = await adapter.generateHmacSecret();
      expect(s1).not.toBe(s2);
    });
  });

  describe('computeSha256', () => {
    it('produces consistent hashes', async () => {
      const h1 = await adapter.computeSha256('hello');
      const h2 = await adapter.computeSha256('hello');
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different inputs', async () => {
      const h1 = await adapter.computeSha256('hello');
      const h2 = await adapter.computeSha256('world');
      expect(h1).not.toBe(h2);
    });

    it('returns a 64-char hex string (256 bits)', async () => {
      const hash = await adapter.computeSha256('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('hashToken', () => {
    it('delegates to computeSha256', async () => {
      const hash = await adapter.hashToken('my-token');
      const sha = await adapter.computeSha256('my-token');
      expect(hash).toBe(sha);
    });
  });

  describe('verifyHmac', () => {
    it('returns false for invalid signature', async () => {
      const secret = await adapter.generateHmacSecret();
      const result = await adapter.verifyHmac('message', secret, 'deadbeef'.repeat(8));
      expect(result).toBe(false);
    });
  });

  describe('encrypt / decrypt', () => {
    it('roundtrips data correctly', async () => {
      const key = 'a'.repeat(64);
      const plaintext = 'sensitive data here!';
      const encrypted = await adapter.encrypt(plaintext, key);
      const decrypted = await adapter.decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertexts for same input (random IV)', async () => {
      const key = 'b'.repeat(64);
      const e1 = await adapter.encrypt('same', key);
      const e2 = await adapter.encrypt('same', key);
      expect(e1).not.toBe(e2);
    });

    it('handles short keys by padding', async () => {
      const key = 'abc';
      const plaintext = 'data';
      const encrypted = await adapter.encrypt(plaintext, key);
      const decrypted = await adapter.decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });
  });
});
