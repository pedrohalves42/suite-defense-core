/**
 * Script Re-Signer: Signs the post-hotfix script content with ECDSA/Ed25519.
 * Used across all delivery channels to eliminate stale signature warnings.
 * 
 * Flow: If hotfix changed content AND a signing key is available,
 * re-compute signature over the new normalized content's SHA-256.
 */
import { logger } from './logger.ts';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export interface ResignResult {
  signatureBase64: string | null;
  signedAt: string | null;
  signedBy: string | null;
  resigned: boolean;
}

/**
 * Attempt to re-sign a script's SHA-256 hash after hotfix modifications.
 * Falls back gracefully to null if no key is available.
 *
 * @param sha256 - The SHA-256 hex hash of the normalized post-hotfix content
 * @param originalSignature - Original signature_base64 from agent_releases
 * @param originalSignedAt - Original signed_at from agent_releases
 * @param originalSignedBy - Original signed_by from agent_releases
 * @param contentChanged - Whether hotfix modified the content
 * @param logContext - Context for structured logging
 */
export async function resignIfNeeded(params: {
  sha256: string;
  originalSignature: string | null;
  originalSignedAt: string | null;
  originalSignedBy: string | null;
  contentChanged: boolean;
  logContext: Record<string, unknown>;
}): Promise<ResignResult> {
  const { sha256, originalSignature, originalSignedAt, originalSignedBy, contentChanged, logContext } = params;

  // No change — original signature is valid
  if (!contentChanged) {
    return {
      signatureBase64: originalSignature || null,
      signedAt: originalSignedAt || null,
      signedBy: originalSignedBy || null,
      resigned: false,
    };
  }

  // Content changed — try to re-sign
  const ecdsaKey = Deno.env.get('ECDSA_PRIVATE_KEY');
  if (!ecdsaKey) {
    logger.warn('Hotfix changed script but ECDSA_PRIVATE_KEY not available for re-signing', logContext);
    return { signatureBase64: null, signedAt: null, signedBy: null, resigned: false };
  }

  try {
    const keyData = base64ToArrayBuffer(ecdsaKey);
    const privateKey = await crypto.subtle.importKey(
      'pkcs8', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
    );

    const encoder = new TextEncoder();
    const signatureBuffer = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoder.encode(sha256),
    );
    const signatureBase64 = arrayBufferToBase64(signatureBuffer);
    const signedAt = new Date().toISOString();

    logger.info('Re-signed post-hotfix script content', { ...logContext, sha256: sha256.substring(0, 16) + '...' });

    return { signatureBase64, signedAt, signedBy: 'hotfix-resigner', resigned: true };
  } catch (err) {
    logger.warn('Failed to re-sign post-hotfix script', { ...logContext, error: (err as Error).message });
    return { signatureBase64: null, signedAt: null, signedBy: null, resigned: false };
  }
}
