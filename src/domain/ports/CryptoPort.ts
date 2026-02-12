/**
 * Domain port: Cryptographic operations.
 * Keeps security logic decoupled from infrastructure.
 */
export interface CryptoPort {
  /**
   * Generate a new HMAC secret for agent authentication.
   */
  generateHmacSecret(): Promise<string>;

  /**
   * Verify an HMAC signature against a payload.
   */
  verifyHmac(payload: string, signature: string, secret: string): Promise<boolean>;

  /**
   * Hash a token (e.g., session token, API key) using SHA-256.
   */
  hashToken(token: string): Promise<string>;

  /**
   * Compute SHA-256 hash of arbitrary data.
   */
  computeSha256(data: string): Promise<string>;
}
