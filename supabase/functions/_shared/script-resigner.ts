/**
 * Script Re-Signer: signs the post-hotfix SHA-256 with the same algorithm
 * expected by the agents, preferring Ed25519 and falling back to ECDSA.
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

interface SigningStrategy {
  envName: 'ED25519_PRIVATE_KEY' | 'ECDSA_PRIVATE_KEY';
  importParams: EcKeyImportParams | Algorithm;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signParams: any;
  signedBy: string;
  label: string;
}

const SIGNING_STRATEGIES: SigningStrategy[] = [
  {
    envName: 'ED25519_PRIVATE_KEY',
    importParams: { name: 'Ed25519' },
    signParams: 'Ed25519',
    signedBy: 'hotfix-resigner-ed25519',
    label: 'Ed25519',
  },
  {
    envName: 'ECDSA_PRIVATE_KEY',
    importParams: { name: 'ECDSA', namedCurve: 'P-256' },
    signParams: { name: 'ECDSA', hash: 'SHA-256' },
    signedBy: 'hotfix-resigner-ecdsa',
    label: 'ECDSA-P256',
  },
];

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

  const encoder = new TextEncoder();

  for (const strategy of SIGNING_STRATEGIES) {
    const privateKeyBase64 = Deno.env.get(strategy.envName);
    if (!privateKeyBase64) continue;

    try {
      const keyData = base64ToArrayBuffer(privateKeyBase64);
      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        keyData,
        strategy.importParams,
        false,
        ['sign'],
      );

      const signatureBuffer = await crypto.subtle.sign(
        strategy.signParams,
        privateKey,
        encoder.encode(sha256),
      );
      const signatureBase64 = arrayBufferToBase64(signatureBuffer);
      const signedAt = new Date().toISOString();

      logger.info('Re-signed post-hotfix script content', {
        ...logContext,
        algorithm: strategy.label,
        sha256: sha256.substring(0, 16) + '...',
      });

      return {
        signatureBase64,
        signedAt,
        signedBy: strategy.signedBy,
        resigned: true,
      };
    } catch (err) {
      logger.warn('Failed to re-sign post-hotfix script with available key', {
        ...logContext,
        algorithm: strategy.label,
        error: (err as Error).message,
      });
    }
  }

  logger.warn('Hotfix changed script but no signing key was available for re-signing', {
    ...logContext,
    attemptedKeys: SIGNING_STRATEGIES.map((strategy) => strategy.envName),
  });
  return { signatureBase64: null, signedAt: null, signedBy: null, resigned: false };
}
