import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useMFA } from '@/hooks/useMFA';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { MFAEnrollmentDialog } from './MFAEnrollmentDialog';
import { Shield, ShieldCheck, ShieldAlert, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-utils';

export function MFASettings() {
  const { factors, hasMFA, loading, unenrollFactor } = useMFA();
  const { isAdmin, isSuperAdmin } = useUserRole();
  const { toast } = useToast();
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [factorToDisable, setFactorToDisable] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  const isPrivilegedUser = isAdmin || isSuperAdmin;

  const handleDisableMFA = async () => {
    if (!factorToDisable) return;

    setDisabling(true);
    try {
      await unenrollFactor(factorToDisable);
      toast({
        title: 'MFA desativado',
        description: 'A autenticação de dois fatores foi desativada.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao desativar MFA',
        description: 'Não foi possível desativar o MFA. Tente novamente.',
      });
    } finally {
      setDisabling(false);
      setDisableDialogOpen(false);
      setFactorToDisable(null);
    }
  };

  const confirmDisable = (factorId: string) => {
    setFactorToDisable(factorId);
    setDisableDialogOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasMFA ? (
                <ShieldCheck className="h-5 w-5 text-success" />
              ) : (
                <Shield className="h-5 w-5 text-muted-foreground" />
              )}
              <CardTitle>Autenticação de Dois Fatores (MFA)</CardTitle>
            </div>
            {hasMFA ? (
              <Badge variant="default" className="bg-success text-success-foreground">
                Ativo
              </Badge>
            ) : (
              <Badge variant="secondary">Desativado</Badge>
            )}
          </div>
          <CardDescription>
            Adicione uma camada extra de segurança à sua conta usando um aplicativo autenticador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPrivilegedUser && !hasMFA && (
            <Alert className="border-warning/50 bg-warning/10">
              <ShieldAlert className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning-foreground">
                <strong>Recomendado para administradores:</strong> Ative o MFA para proteger sua conta 
                com acesso privilegiado ao sistema.
              </AlertDescription>
            </Alert>
          )}

          {hasMFA ? (
            <div className="space-y-3">
              {factors.filter(f => f.status === 'verified').map((factor) => (
                <div 
                  key={factor.id} 
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-success" />
                    <div>
                      <p className="font-medium text-sm">
                        {factor.friendly_name || 'Aplicativo Autenticador'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Adicionado {formatRelativeTime(factor.created_at)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => confirmDisable(factor.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                O MFA não está configurado para sua conta.
              </p>
              <Button onClick={() => setEnrollDialogOpen(true)}>
                <Shield className="mr-2 h-4 w-4" />
                Ativar MFA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <MFAEnrollmentDialog
        open={enrollDialogOpen}
        onOpenChange={setEnrollDialogOpen}
        onSuccess={() => setEnrollDialogOpen(false)}
      />

      <AlertDialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Desativar MFA?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá a autenticação de dois fatores da sua conta. 
              Você precisará configurar novamente se quiser reativar.
              {isPrivilegedUser && (
                <span className="block mt-2 font-medium text-warning">
                  ⚠️ Como administrador, é altamente recomendado manter o MFA ativo.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disabling}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableMFA}
              disabled={disabling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disabling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Desativando...
                </>
              ) : (
                'Desativar MFA'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
