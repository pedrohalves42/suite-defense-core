import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Key, Plus, Trash2, Shield, AlertCircle, Fingerprint, Info } from 'lucide-react';
import { useWebAuthn } from '@/hooks/useWebAuthn';
import { useAuth } from '@/hooks/useAuth';
import { useMFA } from '@/hooks/useMFA';
import { toast } from '@/hooks/use-toast';

/**
 * Security Keys Manager — FIDO2/WebAuthn + TOTP
 * 
 * Currently uses Supabase TOTP MFA as primary 2FA.
 * WebAuthn hook is ready for future FIDO2 backend integration.
 */

export function SecurityKeysManager() {
  const { user } = useAuth();
  const { factors, hasMFA, startEnrollment, verifyEnrollment, unenrollFactor, enrollment, cancelEnrollment } = useMFA();
  const { isSupported: webAuthnSupported } = useWebAuthn();
  const [enrolling, setEnrolling] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const verifiedFactors = factors.filter((f) => f.status === 'verified');

  const handleStartEnrollment = async () => {
    setEnrolling(true);
    try {
      await startEnrollment('CyberShield Authenticator');
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível iniciar o registro.', variant: 'destructive' });
      setEnrolling(false);
    }
  };

  const handleVerifyEnrollment = async () => {
    if (!enrollment || verifyCode.length !== 6) return;
    setVerifying(true);
    try {
      await verifyEnrollment(enrollment.id, verifyCode);
      toast({ title: 'Sucesso', description: 'Autenticação de dois fatores ativada.' });
      setVerifyCode('');
      setEnrolling(false);
    } catch {
      toast({ title: 'Código inválido', description: 'Verifique o código e tente novamente.', variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await unenrollFactor(revokeTarget);
      toast({ title: 'Removido', description: 'Fator de autenticação removido com sucesso.' });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível remover o fator.', variant: 'destructive' });
    } finally {
      setRevokeTarget(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Autenticação de Dois Fatores</CardTitle>
            </div>
            {!hasMFA && (
              <Button size="sm" onClick={handleStartEnrollment} disabled={enrolling}>
                <Plus className="h-4 w-4 mr-1" />
                Configurar
              </Button>
            )}
          </div>
          <CardDescription>
            Proteja sua conta com autenticação TOTP ou chave de segurança física.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Active factors */}
          {verifiedFactors.length > 0 ? (
            <div className="space-y-3">
              {verifiedFactors.map((factor) => (
                <div
                  key={factor.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-cta-positive" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {factor.friendly_name || 'Authenticator App'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Registrado em {new Date(factor.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs border-green-500/30 text-green-600">
                      Ativo
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive/70 hover:text-destructive"
                      onClick={() => setRevokeTarget(factor.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {!enrolling && (
                <Button variant="outline" size="sm" onClick={handleStartEnrollment} className="w-full">
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar outro fator
                </Button>
              )}
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Nenhum fator de autenticação configurado. Configure agora para proteger sua conta.
              </AlertDescription>
            </Alert>
          )}

          {/* WebAuthn availability notice */}
          {webAuthnSupported && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-3 border border-border/20">
              <Fingerprint className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium text-foreground/80">Chaves de segurança FIDO2</p>
                <p className="text-xs text-muted-foreground">
                  Seu navegador suporta WebAuthn. Suporte a YubiKey e chaves físicas em breve.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enrollment dialog */}
      <Dialog
        open={!!enrollment}
        onOpenChange={(open) => {
          if (!open) {
            cancelEnrollment();
            setEnrolling(false);
            setVerifyCode('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Configurar Autenticador
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code com seu aplicativo autenticador (Google Authenticator, Authy, etc.)
            </DialogDescription>
          </DialogHeader>

          {enrollment?.totp?.qr_code && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-lg border border-border/50 p-2 bg-white">
                <img src={enrollment.totp.qr_code} alt="QR Code" className="w-48 h-48" />
              </div>

              <div className="w-full space-y-2">
                <Label htmlFor="totp-code" className="text-sm">Código de verificação</Label>
                <Input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && verifyCode.length === 6 && handleVerifyEnrollment()}
                  className="text-center text-xl tracking-widest font-mono"
                  autoFocus
                />
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-3 border border-border/20 w-full">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Chave manual: <code className="text-[10px] bg-muted px-1 py-0.5 rounded break-all">{enrollment.totp.secret}</code>
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={handleVerifyEnrollment}
              disabled={verifying || verifyCode.length !== 6}
              className="w-full"
            >
              {verifying ? 'Verificando...' : 'Ativar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fator de autenticação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este fator? Sua conta ficará menos protegida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
