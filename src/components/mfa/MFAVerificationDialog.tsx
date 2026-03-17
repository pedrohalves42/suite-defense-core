import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMFA } from '@/hooks/useMFA';
import { Loader2, Shield, AlertCircle, Check, Monitor, MapPin } from 'lucide-react';

interface MFAVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function MFAVerificationDialog({ 
  open, 
  onOpenChange, 
  onSuccess,
  onCancel 
}: MFAVerificationDialogProps) {
  const { verifyMFA } = useMFA();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError('Digite o código de 6 dígitos do seu aplicativo autenticador.');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      await verifyMFA(code);
      setCode('');
      setAttempts(0);
      onSuccess();
    } catch (err) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      
      if (newAttempts >= 3) {
        setError(`Código inválido. ${5 - newAttempts} tentativas restantes.`);
      } else {
        setError('Código inválido. Verifique seu aplicativo autenticador.');
      }
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const handleCancel = () => {
    setCode('');
    setError('');
    setAttempts(0);
    onCancel?.();
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && code.length === 6) {
      handleVerify();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md border-border/50 bg-card" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-2.5 text-foreground">
            <Shield className="h-5 w-5 text-cta-positive" />
            Confirmação de segurança
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/70 text-sm">
            Para sua proteção, precisamos confirmar este acesso.
          </DialogDescription>
        </DialogHeader>

        {/* Trust indicators */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground/60 bg-muted/20 p-3 rounded-lg border border-border/20">
          <span className="flex items-center gap-1.5">
            <Check className="h-3 w-3 text-green-500/70" />
            <Monitor className="h-3 w-3" />
            Dispositivo reconhecido
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-3 w-3 text-green-500/70" />
            <MapPin className="h-3 w-3" />
            Localização consistente
          </span>
        </div>

        {error && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-code" className="text-sm text-foreground/80">Código de verificação</Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={handleKeyDown}
              className="text-center text-2xl tracking-widest font-mono h-14 border-border/40 focus:border-primary/40 focus:ring-2 focus:ring-primary/15 bg-background/50"
              autoFocus
              disabled={verifying}
            />
            <p className="text-[11px] text-muted-foreground/50 text-center">
              Abra seu aplicativo autenticador para obter o código
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="flex-1 border-border/40 text-muted-foreground hover:text-foreground"
              disabled={verifying}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleVerify}
              disabled={verifying || code.length !== 6}
              className="flex-1 bg-primary/90 hover:bg-primary"
            >
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin opacity-80" />
                  Verificando...
                </>
              ) : (
                'Confirmar'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
