import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMFA } from '@/hooks/useMFA';
import { Loader2, Shield, AlertCircle } from 'lucide-react';

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
        setError(`Código inválido. ${5 - newAttempts} tentativas restantes antes do bloqueio.`);
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
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Verificação de Dois Fatores
          </DialogTitle>
          <DialogDescription>
            Digite o código do seu aplicativo autenticador para continuar.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Código de verificação</Label>
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
              className="text-center text-2xl tracking-widest font-mono"
              autoFocus
              disabled={verifying}
            />
            <p className="text-xs text-muted-foreground text-center">
              Abra seu aplicativo autenticador para obter o código
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="flex-1"
              disabled={verifying}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleVerify}
              disabled={verifying || code.length !== 6}
              className="flex-1"
            >
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Verificar'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
