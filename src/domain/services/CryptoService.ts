import type { CryptoPort } from '../ports/CryptoPort';

/**
 * Domain service: Crypto operations delegated to port.
 * Provides high-level crypto methods used by use cases.
 */
export class CryptoService {
  constructor(private readonly crypto: CryptoPort) {}

  /**
   * Generate a new HMAC secret for agent enrollment.
   */
  async generateAgentSecret(): Promise<string> {
    return this.crypto.generateHmacSecret();
  }

  /**
   * Verify an agent's HMAC signature.
   */
  async verifyAgentSignature(payload: string, signature: string, secret: string): Promise<boolean> {
    return this.crypto.verifyHmac(payload, signature, secret);
  }

  /**
   * Hash a payload for integrity verification (e.g., job payload hash).
   */
  async hashPayload(payload: string): Promise<string> {
    return this.crypto.computeSha256(payload);
  }

  /**
   * Hash a token for secure storage.
   */
  async hashToken(token: string): Promise<string> {
    return this.crypto.hashToken(token);
  }
}
