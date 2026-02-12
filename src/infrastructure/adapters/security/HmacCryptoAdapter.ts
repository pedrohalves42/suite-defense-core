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
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      this.hexToBuffer(key.padEnd(64, '0').slice(0, 64)),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
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
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      this.hexToBuffer(key.padEnd(64, '0').slice(0, 64)),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  }

  private bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private hexToBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
  }
}
