import type { CryptoPort } from '@/domain/ports/CryptoPort';

/**
 * Infrastructure adapter: Web Crypto API implementation of CryptoPort.
 * Uses browser-native APIs for HMAC and SHA-256 operations.
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

  async verifyHmac(payload: string, signature: string, secret: string): Promise<boolean> {
    const key = await crypto.subtle.importKey(
      'raw',
      this.hexToBuffer(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signatureBuffer = this.hexToBuffer(signature);
    const data = new TextEncoder().encode(payload);
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
