import { useState } from 'react';
import { AlertOctagon, Shield, ShieldOff, Power, Loader2 } from 'lucide-react';
import { useSystemMode, useActivateKillSwitch, useDeactivateKillSwitch, type SystemMode } from '@/hooks/useSystemMode';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { format, ptBR } from '@/lib/date-utils';

const modeConfig: Record<SystemMode, { label: string; color: string; icon: React.ReactNode }> = {
  normal: { 
    label: 'Normal', 
    color: 'text-green-500 border-green-500', 
    icon: <Shield className="h-4 w-4" /> 
  },
  restricted: { 
    label: 'Restrito', 
    color: 'text-yellow-500 border-yellow-500', 
    icon: <AlertOctagon className="h-4 w-4" /> 
  },
  emergency_stop: { 
    label: 'Parada de Emergência', 
    color: 'text-red-500 border-red-500', 
    icon: <ShieldOff className="h-4 w-4" /> 
  },
};

export function KillSwitchControl() {
  const { data: systemState, isLoading } = useSystemMode();
  const activateKillSwitch = useActivateKillSwitch();
  const deactivateKillSwitch = useDeactivateKillSwitch();
  
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedMode, setSelectedMode] = useState<SystemMode>('restricted');
  const [reason, setReason] = useState('');

  const isNormal = systemState?.mode === 'normal';
  const currentMode = systemState?.mode || 'normal';
  const config = modeConfig[currentMode];

  const handleActivate = () => {
    if (reason.trim().length < 10) return;
    
    activateKillSwitch.mutate({
      mode: selectedMode,
      reason: reason.trim(),
    }, {
      onSuccess: () => {
        setShowConfirmDialog(false);
        setReason('');
      }
    });
  };

  const handleDeactivate = () => {
    deactivateKillSwitch.mutate();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={!isNormal ? 'border-destructive/50' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Power className="h-5 w-5" />
                Kill Switch Global
              </CardTitle>
              <CardDescription>
                Controle de emergência do sistema
              </CardDescription>
            </div>
            <Badge variant="outline" className={config.color}>
              {config.icon}
              <span className="ml-1">{config.label}</span>
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isNormal && systemState && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              {systemState.reason && (
                <div>
                  <p className="text-xs text-muted-foreground">Motivo:</p>
                  <p className="text-sm">{systemState.reason}</p>
                </div>
              )}
              {systemState.triggered_at && (
                <div className="text-xs text-muted-foreground">
                  Ativado em: {format(new Date(systemState.triggered_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {isNormal ? (
              <Button 
                variant="destructive" 
                onClick={() => setShowConfirmDialog(true)}
                className="w-full"
              >
                <ShieldOff className="h-4 w-4 mr-2" />
                Ativar Kill Switch
              </Button>
            ) : (
              <Button 
                variant="outline" 
                onClick={handleDeactivate}
                disabled={deactivateKillSwitch.isPending}
                className="w-full"
              >
                {deactivateKillSwitch.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4 mr-2" />
                )}
                Restaurar Operação Normal
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldOff className="h-5 w-5" />
              Ativar Kill Switch
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá restringir ou parar completamente as operações automáticas do sistema.
              Certifique-se de que esta é a ação correta.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nível de Restrição</Label>
              <Select value={selectedMode} onValueChange={(v) => setSelectedMode(v as SystemMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restricted">
                    <div className="flex items-center gap-2">
                      <AlertOctagon className="h-4 w-4 text-yellow-500" />
                      <span>Restrito - Bloqueia ações de alto risco</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="emergency_stop">
                    <div className="flex items-center gap-2">
                      <ShieldOff className="h-4 w-4 text-red-500" />
                      <span>Parada Total - Bloqueia todas as ações</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Motivo <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="Descreva o motivo para ativar o kill switch..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo 10 caracteres ({reason.length}/10)
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleActivate}
              disabled={reason.trim().length < 10 || activateKillSwitch.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {activateKillSwitch.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ShieldOff className="h-4 w-4 mr-2" />
              )}
              Confirmar Ativação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
