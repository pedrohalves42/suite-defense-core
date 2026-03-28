import { useState, useCallback } from 'react';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { logger } from '@/lib/logger';

/**
 * WebAuthn/FIDO2 Hook — Connected to fido2-register Edge Function
 * Supports: register, list, revoke security keys
 */

interface WebAuthnCredential {
  credential_id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
  aaguid: string;
  backed_up: boolean;
}

// Base64url helpers
function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const useWebAuthn = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined';

  const registerKey = useCallback(
    async (deviceName: string): Promise<boolean> => {
      if (!isSupported) {
        setError('WebAuthn não é suportado neste navegador');
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        // 1. Get registration options from backend
        const options = await callEdgeFunction('fido2-register', {
          action: 'begin',
          deviceName,
        });

        // 2. Create credential via WebAuthn API
        const publicKey: PublicKeyCredentialCreationOptions = {
          challenge: base64UrlToBuffer(options.challenge),
          rp: options.rp,
          user: {
            id: base64UrlToBuffer(options.user.id),
            name: options.user.name,
            displayName: options.user.displayName,
          },
          pubKeyCredParams: options.pubKeyCredParams as PublicKeyCredentialParameters[],
          authenticatorSelection: {
            authenticatorAttachment: options.authenticatorSelection.authenticatorAttachment as AuthenticatorAttachment,
            residentKey: options.authenticatorSelection.residentKey as ResidentKeyRequirement,
            userVerification: options.authenticatorSelection.userVerification as UserVerificationRequirement,
          },
          attestation: options.attestation as AttestationConveyancePreference,
          timeout: options.timeout,
        };

        const credential = (await navigator.credentials.create({
          publicKey,
        })) as PublicKeyCredential;
        const response = credential.response as AuthenticatorAttestationResponse;

        // 3. Complete registration on backend
        await callEdgeFunction('fido2-register', {
          action: 'complete',
          registrationResponse: {
            id: credential.id,
            rawId: bufferToBase64Url(credential.rawId),
            type: credential.type,
            response: {
              clientDataJSON: bufferToBase64Url(response.clientDataJSON),
              attestationObject: bufferToBase64Url(response.attestationObject),
              transports: (credential as any as Record<string, unknown>).transports || [],
            },
          },
          expectedChallenge: options.challenge,
        });

        return true;
      } catch (err) {
        const msg =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Operação cancelada pelo usuário'
            : err instanceof Error
              ? err.message
              : 'Falha ao registrar chave de segurança';
        setError(msg);
        logger.error('useWebAuthn registerKey error', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [isSupported],
  );

  const listKeys = useCallback(async (): Promise<WebAuthnCredential[]> => {
    try {
      const data = await callEdgeFunction('fido2-register', {
        action: 'keys',
      });
      return data || [];
    } catch (err) {
      logger.error('useWebAuthn listKeys error', err);
      setError(err instanceof Error ? err.message : 'Falha ao listar chaves');
      return [];
    }
  }, []);

  const revokeKey = useCallback(async (credentialId: string): Promise<boolean> => {
    try {
      await callEdgeFunction('fido2-register', {
        action: 'keys',
        credentialId,
      });
      return true;
    } catch (err) {
      logger.error('useWebAuthn revokeKey error', err);
      setError(err instanceof Error ? err.message : 'Falha ao revogar chave');
      return false;
    }
  }, []);

  return { isSupported, loading, error, registerKey, listKeys, revokeKey };
};
