/**
 * ECDSA Digital Signature Module for Release Signing
 * 
 * Uses P-256 (secp256r1) curve with SHA-256 for:
 * - Non-repudiation: Proves who signed the release
 * - Integrity: Ensures release wasn't modified
 * - Supply chain security: Agent validates before execution
 * 
 * Works in browser (Web Crypto API) and Deno
 */

export interface ECDSAKeyPair {
  publicKey: string;   // Base64 encoded SPKI
  privateKey: string;  // Base64 encoded PKCS8
}

export interface SignatureResult {
  signature_base64: string;
  signed_at: string;
  algorithm: 'ECDSA-P256-SHA256';
  public_key_fingerprint: string;
}

export interface VerificationResult {
  valid: boolean;
  signed_at?: string;
  public_key_fingerprint?: string;
  error?: string;
}

/**
 * Generate a new ECDSA P-256 keypair
 * @returns Base64 encoded public and private keys
 */
export async function generateKeyPair(): Promise<ECDSAKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['sign', 'verify']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

/**
 * Sign content with ECDSA private key
 * @param content - Content to sign (typically SHA256 hash of script)
 * @param privateKeyBase64 - Base64 encoded PKCS8 private key
 * @returns Signature result with base64 signature
 */
export async function signContent(
  content: string,
  privateKeyBase64: string
): Promise<SignatureResult> {
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
  
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const data = encoder.encode(content);

  const signatureBuffer = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    privateKey,
    data
  );

  // Calculate public key fingerprint from private key
  const fingerprint = await calculateKeyFingerprint(privateKeyBase64);

  return {
    signature_base64: arrayBufferToBase64(signatureBuffer),
    signed_at: new Date().toISOString(),
    algorithm: 'ECDSA-P256-SHA256',
    public_key_fingerprint: fingerprint,
  };
}

/**
 * Verify ECDSA signature
 * @param content - Original content that was signed
 * @param signatureBase64 - Base64 encoded signature
 * @param publicKeyBase64 - Base64 encoded SPKI public key
 * @returns Verification result
 */
export async function verifySignature(
  content: string,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<VerificationResult> {
  try {
    const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
    const signatureBuffer = base64ToArrayBuffer(signatureBase64);

    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBuffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['verify']
    );

    const encoder = new TextEncoder();
    const data = encoder.encode(content);

    const valid = await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      publicKey,
      signatureBuffer,
      data
    );

    const fingerprint = await calculatePublicKeyFingerprint(publicKeyBase64);

    return {
      valid,
      public_key_fingerprint: fingerprint,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Signature verification failed',
    };
  }
}

/**
 * Calculate SHA256 fingerprint of public key
 * @param publicKeyBase64 - Base64 encoded SPKI public key
 * @returns First 16 chars of SHA256 hash
 */
export async function calculatePublicKeyFingerprint(publicKeyBase64: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(publicKeyBase64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fullHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return fullHash.substring(0, 16).toUpperCase();
}

/**
 * Calculate fingerprint from private key (derives public key first)
 */
async function calculateKeyFingerprint(privateKeyBase64: string): Promise<string> {
  try {
    const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
    
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBuffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['sign']
    );

    // Export to JWK to get public key components
    const jwk = await crypto.subtle.exportKey('jwk', privateKey);
    
    // Create public-only JWK
    const publicJwk = {
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
    };
    
    // Import as public key and export as SPKI
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['verify']
    );
    
    const publicKeyBuffer = await crypto.subtle.exportKey('spki', publicKey);
    const publicKeyBase64 = arrayBufferToBase64(publicKeyBuffer);
    
    return calculatePublicKeyFingerprint(publicKeyBase64);
  } catch {
    return 'UNKNOWN';
  }
}

/**
 * Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Sign a release script's SHA256 hash
 * @param sha256 - SHA256 hash of the script content
 * @param privateKeyBase64 - Base64 encoded ECDSA private key
 * @returns Signature result
 */
export async function signRelease(
  sha256: string,
  privateKeyBase64: string
): Promise<SignatureResult> {
  // Sign the SHA256 hash, not the full content (more efficient)
  return signContent(sha256, privateKeyBase64);
}

/**
 * Verify a release signature
 * @param sha256 - SHA256 hash of the script content
 * @param signatureBase64 - Base64 encoded signature
 * @param publicKeyBase64 - Base64 encoded public key
 * @returns Verification result
 */
export async function verifyRelease(
  sha256: string,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<VerificationResult> {
  return verifySignature(sha256, signatureBase64, publicKeyBase64);
}
