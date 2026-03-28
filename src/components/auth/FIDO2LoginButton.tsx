import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KeyRound, Fingerprint, Loader2 } from 'lucide-react';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

interface FIDO2LoginButtonProps {
  email: string;
  onSuccess: () => void;
  disabled?: boolean;
}

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

export function FIDO2LoginButton({ email, onSuccess, disabled }: FIDO2LoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const isSupported =
    typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

  const handleFIDOLogin = async () => {
    if (!email) {
      setError('Insira seu email primeiro');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Begin authentication — get options from server
      const options = await callEdgeFunction('fido2-authenticate', {
        action: 'begin',
        email,
      });

      // 2. Build WebAuthn request
      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: base64UrlToBuffer(options.challenge),
        rpId: options.rpId,
        allowCredentials: options.allowCredentials?.map((cred: Record<string, unknown>) => ({
          id: base64UrlToBuffer(cred.id),
          type: cred.type as PublicKeyCredentialType,
          transports: cred.transports as AuthenticatorTransport[],
        })),
        userVerification: options.userVerification as UserVerificationRequirement,
        timeout: options.timeout,
      };

      // 3. Authenticate with WebAuthn API (browser prompts for key)
      const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
      const response = credential.response as AuthenticatorAssertionResponse;

      // 4. Complete authentication on server
      const result = await callEdgeFunction('fido2-authenticate', {
        action: 'complete',
        email,
        authResponse: {
          id: credential.id,
          rawId: bufferToBase64Url(credential.rawId),
          type: credential.type,
          response: {
            clientDataJSON: bufferToBase64Url(response.clientDataJSON),
            authenticatorData: bufferToBase64Url(response.authenticatorData),
            signature: bufferToBase64Url(response.signature),
            userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
          },
        },
        expectedChallenge: options.challenge,
      });

      if (!result.success) {
        throw new Error(result.error || 'Falha na autenticação');
      }

      // 5. Exchange the token_hash for a real session
      if (result.token_hash && result.email) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: result.token_hash,
          type: 'magiclink',
        });

        if (otpError) {
          logger.error('FIDO2 session exchange failed', otpError);
          throw new Error('Falha ao estabelecer sessão');
        }
      }

      setShowDialog(false);
      onSuccess();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Operação cancelada pelo usuário');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Falha ao autenticar com chave de segurança');
      }
      logger.error('FIDO2 login error', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isSupported) return null;

  return (
    <>
      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => setShowDialog(true)}
        disabled={disabled || !email}
      >
        <KeyRound className="h-4 w-4" />
        Entrar com Chave de Segurança
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Autenticação com Chave de Segurança
            </DialogTitle>
            <DialogDescription>
              Insira sua chave e toque quando ela piscar
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-6">
            <Fingerprint className="h-16 w-16 text-primary opacity-60" />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              size="lg"
              className="w-full gap-2"
              onClick={handleFIDOLogin}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aguardando chave...
                </>
              ) : (
                <>
                  <Fingerprint className="h-4 w-4" />
                  Autenticar
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Compatível com: YubiKey, Google Titan, Touch ID, Windows Hello
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
