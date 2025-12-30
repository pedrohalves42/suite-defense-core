/**
 * HMAC Signing Helper for E2E Tests
 * 
 * Provides real HMAC-SHA256 signature generation for agent authentication tests.
 * This replaces all mock signatures to ensure tests validate actual auth flows.
 */

import * as crypto from 'crypto';

export interface HmacHeaders {
  signature: string;
  timestamp: string;
  nonce: string;
}

/**
 * Generates HMAC-SHA256 signature with timestamp and nonce for agent requests.
 * 
 * @param hmacSecretHex - The agent's HMAC secret in hexadecimal format (64 chars)
 * @param body - The request body as a string (default: empty string)
 * @returns Object containing signature, timestamp, and nonce for request headers
 */
export function signHmac(
  hmacSecretHex: string,
  body: string = ''
): HmacHeaders {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  
  return signHmacWithTimestamp(hmacSecretHex, body, timestamp, nonce);
}

/**
 * Generates HMAC-SHA256 signature with explicit timestamp and nonce.
 * Useful for testing edge cases like expired timestamps.
 * 
 * @param hmacSecretHex - The agent's HMAC secret in hexadecimal format
 * @param body - The request body as a string
 * @param timestamp - Unix timestamp in milliseconds as string
 * @param nonce - Unique nonce for replay protection
 * @returns Object containing signature, timestamp, and nonce for request headers
 */
export function signHmacWithTimestamp(
  hmacSecretHex: string,
  body: string,
  timestamp: string,
  nonce: string
): HmacHeaders {
  const payload = `${timestamp}:${nonce}:${body}`;
  
  const keyBytes = Buffer.from(hmacSecretHex, 'hex');
  const signature = crypto
    .createHmac('sha256', keyBytes)
    .update(payload)
    .digest('hex');
  
  return { signature, timestamp, nonce };
}

/**
 * Generates a valid 64-character hex HMAC secret for testing.
 * 
 * @returns A random 32-byte hex string (64 characters)
 */
export function generateTestHmacSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validates that an HMAC secret is properly formatted.
 * 
 * @param secret - The secret to validate
 * @returns true if valid 64-char hex string
 */
export function isValidHmacSecret(secret: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(secret);
}
