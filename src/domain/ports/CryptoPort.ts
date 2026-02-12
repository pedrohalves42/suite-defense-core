/**
 * Domain port: Cryptographic operations.
 * Keeps security logic decoupled from infrastructure.
 */
export interface CryptoPort {
  generateHmacSecret(): Promise<string>;
  verifyHmac(message: string, secret: string, signature: string): Promise<boolean>;
  hashToken(token: string): Promise<string>;
  computeSha256(data: string): Promise<string>;
  encrypt(data: string, key: string): Promise<string>;
  decrypt(encryptedData: string, key: string): Promise<string>;
}
