import type { CryptoPort } from '@/domain/ports/CryptoPort';

/**
 * Infrastructure adapter: Web Crypto API implementation of CryptoPort.
 * Uses browser-native APIs for HMAC, SHA-256, and AES-GCM operations.
 */
export class HmacCryptoAdapter implements CryptoPort {
  async generateHmacSecret(): Promise<string> {
    const key = await crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      true,
      ['sign', 'verify']
    );
    const exported = await crypto.subtle.exportKey('raw', key);
    return this.bufferToHex(exported);
  }

  async verifyHmac(message: string, secret: string, signature: string): Promise<boolean> {
    const key = await crypto.subtle.importKey(
      'raw',
      this.hexToBuffer(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signatureBuffer = this.hexToBuffer(signature);
    const data = new TextEncoder().encode(message);
    return crypto.subtle.verify('HMAC', key, signatureBuffer, data);
  }

  async hashToken(token: string): Promise<string> {
    return this.computeSha256(token);
  }

  async computeSha256(data: string): Promise<string> {
    const encoded = new TextEncoder().encode(data);
    const hash = await crypto.subtle.digest('SHA-256', encoded);
    return this.bufferToHex(hash);
  }

  async encrypt(data: string, key: string): Promise<string> {
    const cryptoKey = await this.deriveAesKey(key, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encoded
    );
    // Prefix IV to ciphertext
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return this.bufferToHex(combined.buffer);
  }

  async decrypt(encryptedData: string, key: string): Promise<string> {
    const combined = new Uint8Array(this.hexToBuffer(encryptedData));
    if (combined.length < 13) {
      throw new Error('Invalid ciphertext: too short to contain IV + data');
    }
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const cryptoKey = await this.deriveAesKey(key, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  }

  /**
   * BUG FIX: Previously the key was treated as hex and padded with '0' chars
   * up to 64 hex digits, then sliced. That had two failure modes:
   *   1) Non-hex inputs silently produced an all-zero or partially-zero key
   *      (parseInt of non-hex returns NaN -> 0), gutting entropy.
   *   2) Short secrets were extended with deterministic zero bytes instead
   *      of being properly stretched.
   * We now derive a real 256-bit AES key by hashing the input with SHA-256,
   * which accepts any string and always yields full-entropy 32 bytes.
   */
  private async deriveAesKey(
    key: string,
    usages: KeyUsage[]
  ): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(key)
    );
    return crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'AES-GCM' },
      false,
      usages
    );
  }

  private bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private hexToBuffer(hex: string): ArrayBuffer {
    // BUG FIX: `String.prototype.substr` is deprecated (legacy). Use `substring`
    // for forward-compat. Also guards against odd-length hex strings, which
    // would silently produce a truncated buffer with the previous code.
    if (hex.length % 2 !== 0) {
      throw new Error('Invalid hex string: length must be even');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer;
  }
}
