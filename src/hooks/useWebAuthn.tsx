import { useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

/**
 * WebAuthn/FIDO2 Browser API Hook
 * Provides low-level WebAuthn credential creation and assertion.
 * Ready for future FIDO2 backend integration.
 */

interface WebAuthnRegistrationOptions {
  challenge: string;
  rpId: string;
  rpName: string;
  userId: string;
  userName: string;
  userDisplayName: string;
  attestation?: AttestationConveyancePreference;
}

interface WebAuthnAuthenticationOptions {
  challenge: string;
  rpId: string;
  allowCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
  userVerification?: UserVerificationRequirement;
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

  const register = useCallback(
    async (options: WebAuthnRegistrationOptions) => {
      if (!isSupported) throw new Error('WebAuthn não é suportado neste navegador');

      setLoading(true);
      setError(null);

      try {
        const publicKey: PublicKeyCredentialCreationOptions = {
          challenge: base64UrlToBuffer(options.challenge),
          rp: { id: options.rpId, name: options.rpName },
          user: {
            id: base64UrlToBuffer(options.userId),
            name: options.userName,
            displayName: options.userDisplayName,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },   // ES256
            { type: 'public-key', alg: -257 },  // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'cross-platform',
            residentKey: 'required',
            userVerification: 'required',
          },
          attestation: options.attestation ?? 'none',
          timeout: 60000,
        };

        const credential = (await navigator.credentials.create({
          publicKey,
        })) as PublicKeyCredential;
        const response = credential.response as AuthenticatorAttestationResponse;

        return {
          id: credential.id,
          rawId: bufferToBase64Url(credential.rawId),
          type: credential.type,
          response: {
            clientDataJSON: bufferToBase64Url(response.clientDataJSON),
            attestationObject: bufferToBase64Url(response.attestationObject),
          },
        };
      } catch (err: unknown) {
        const msg =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Operação cancelada pelo usuário'
            : err instanceof Error
              ? err.message
              : 'Falha ao registrar chave de segurança';
        setError(msg);
        logger.error('useWebAuthn register error', err);
        throw new Error(msg);
      } finally {
        setLoading(false);
      }
    },
    [isSupported],
  );

  const authenticate = useCallback(
    async (options: WebAuthnAuthenticationOptions) => {
      if (!isSupported) throw new Error('WebAuthn não é suportado neste navegador');

      setLoading(true);
      setError(null);

      try {
        const publicKey: PublicKeyCredentialRequestOptions = {
          challenge: base64UrlToBuffer(options.challenge),
          rpId: options.rpId,
          allowCredentials: options.allowCredentials?.map((c) => ({
            id: base64UrlToBuffer(c.id),
            type: c.type as PublicKeyCredentialType,
            transports: c.transports as AuthenticatorTransport[] | undefined,
          })),
          userVerification: options.userVerification ?? 'required',
          timeout: 60000,
        };

        const credential = (await navigator.credentials.get({
          publicKey,
        })) as PublicKeyCredential;
        const response = credential.response as AuthenticatorAssertionResponse;

        return {
          id: credential.id,
          rawId: bufferToBase64Url(credential.rawId),
          type: credential.type,
          response: {
            clientDataJSON: bufferToBase64Url(response.clientDataJSON),
            authenticatorData: bufferToBase64Url(response.authenticatorData),
            signature: bufferToBase64Url(response.signature),
            userHandle: response.userHandle
              ? bufferToBase64Url(response.userHandle)
              : null,
          },
        };
      } catch (err: unknown) {
        const msg =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Operação cancelada pelo usuário'
            : err instanceof Error
              ? err.message
              : 'Falha na autenticação';
        setError(msg);
        logger.error('useWebAuthn authenticate error', err);
        throw new Error(msg);
      } finally {
        setLoading(false);
      }
    },
    [isSupported],
  );

  return { isSupported, loading, error, register, authenticate };
};
