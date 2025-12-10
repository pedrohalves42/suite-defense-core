import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMFA, MFAEnrollmentResult } from '@/hooks/useMFA';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield, Copy, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react';

interface MFAEnrollmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function MFAEnrollmentDialog({ open, onOpenChange, onSuccess }: MFAEnrollmentDialogProps) {
  const { startEnrollment, verifyEnrollment, cancelEnrollment, enrolling } = useMFA();
  const { toast } = useToast();
  const [step, setStep] = useState<'intro' | 'scan' | 'verify'>('intro');
  const [enrollment, setEnrollment] = useState<MFAEnrollmentResult | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleStartEnrollment = async () => {
    try {
      setError('');
      const result = await startEnrollment();
      if (result) {
        setEnrollment(result);
        setStep('scan');
      }
    } catch (err) {
      setError('Falha ao iniciar configuração do MFA. Tente novamente.');
    }
  };

  const handleCopySecret = async () => {
    if (enrollment?.totp.secret) {
      await navigator.clipboard.writeText(enrollment.totp.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: 'Código copiado',
        description: 'Código secreto copiado para a área de transferência.',
      });
    }
  };

  const handleVerify = async () => {
    if (!enrollment || verifyCode.length !== 6) {
      setError('Digite o código de 6 dígitos do seu aplicativo autenticador.');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      await verifyEnrollment(enrollment.id, verifyCode);
      toast({
        title: 'MFA ativado com sucesso!',
        description: 'Sua conta agora está protegida com autenticação de dois fatores.',
      });
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError('Código inválido. Verifique e tente novamente.');
    } finally {
      setVerifying(false);
    }
  };

  const handleClose = () => {
    setStep('intro');
    setEnrollment(null);
    setVerifyCode('');
    setError('');
    cancelEnrollment();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Ativar Autenticação de Dois Fatores
          </DialogTitle>
          <DialogDescription>
            Proteja sua conta com uma camada extra de segurança.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 'intro' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border border-border/50">
              <Smartphone className="h-5 w-5 text-primary mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-sm">Você precisará de um aplicativo autenticador</p>
                <p className="text-sm text-muted-foreground">
                  Recomendamos o Google Authenticator, Microsoft Authenticator ou Authy.
                </p>
              </div>
            </div>
            <Button 
              onClick={handleStartEnrollment} 
              className="w-full"
              disabled={enrolling}
            >
              {enrolling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparando...
                </>
              ) : (
                'Começar Configuração'
              )}
            </Button>
          </div>
        )}

        {step === 'scan' && enrollment && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Escaneie o QR Code com seu aplicativo autenticador
              </p>
              <div className="flex justify-center p-4 bg-white rounded-lg inline-block mx-auto">
                <img 
                  src={enrollment.totp.qr_code} 
                  alt="QR Code para MFA" 
                  className="w-48 h-48"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Ou digite o código manualmente:
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-xs font-mono break-all">
                  {enrollment.totp.secret}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopySecret}
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Button 
              onClick={() => setStep('verify')} 
              className="w-full"
            >
              Já escaneei, continuar
            </Button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="verify-code">
                Digite o código de 6 dígitos do seu aplicativo
              </Label>
              <Input
                id="verify-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-2xl tracking-widest font-mono"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('scan')}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button 
                onClick={handleVerify}
                disabled={verifying || verifyCode.length !== 6}
                className="flex-1"
              >
                {verifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Verificar e Ativar'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
