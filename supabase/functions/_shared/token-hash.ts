/**
 * Hashes a token using SHA-256
 * Used for secure token storage and comparison
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extracts a safe prefix from a token for display purposes
 */
export function getTokenPrefix(token: string, length: number = 8): string {
  return token.substring(0, length);
}

/**
 * Validates that a token matches a stored hash
 */
export async function validateTokenHash(token: string, storedHash: string): Promise<boolean> {
  const computedHash = await hashToken(token);
  return computedHash === storedHash;
}
