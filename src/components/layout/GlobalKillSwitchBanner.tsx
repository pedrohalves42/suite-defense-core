import { AlertOctagon, ShieldOff, AlertTriangle, X } from 'lucide-react';
import { useSystemMode } from '@/hooks/useSystemMode';
import { Button } from '@/components/ui/button';
import { format, ptBR } from '@/lib/date-utils';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function GlobalKillSwitchBanner() {
  const { data: systemState, isLoading } = useSystemMode();
  const [showDetails, setShowDetails] = useState(false);

  if (isLoading || !systemState || systemState.mode === 'normal') {
    return null;
  }

  const isEmergencyStop = systemState.mode === 'emergency_stop';
  const isRestricted = systemState.mode === 'restricted';

  return (
    <>
      <div 
        className={`w-full py-3 px-4 flex items-center justify-between gap-4 ${
          isEmergencyStop 
            ? 'bg-destructive text-destructive-foreground' 
            : 'bg-yellow-500 text-yellow-950'
        }`}
      >
        <div className="flex items-center gap-3">
          {isEmergencyStop ? (
            <AlertOctagon className="h-5 w-5 animate-pulse" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
          <div>
            <span className="font-semibold">
              {isEmergencyStop 
                ? '🔴 PARADA DE EMERGÊNCIA ATIVA' 
                : '🟠 MODO RESTRITO ATIVO'}
            </span>
            <span className="ml-2 opacity-90">
              {isEmergencyStop 
                ? 'Nenhuma ação automática será executada.' 
                : 'Ações de alto risco estão bloqueadas.'}
            </span>
          </div>
        </div>
        
        <Button 
          variant={isEmergencyStop ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowDetails(true)}
          className="shrink-0"
        >
          Ver Detalhes
        </Button>
      </div>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isEmergencyStop ? (
                <>
                  <ShieldOff className="h-5 w-5 text-destructive" />
                  Parada de Emergência
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Modo Restrito
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Detalhes do estado atual do sistema
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-medium">
                  {isEmergencyStop ? 'Parada Total' : 'Restrito'}
                </span>
              </div>
              
              {systemState.triggered_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ativado em:</span>
                  <span>
                    {format(new Date(systemState.triggered_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              )}
              
              {systemState.expires_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Expira em:</span>
                  <span>
                    {format(new Date(systemState.expires_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              )}
            </div>
            
            {systemState.reason && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-1">Motivo:</p>
                <p className="text-sm text-muted-foreground">{systemState.reason}</p>
              </div>
            )}
            
            <div className="p-3 border rounded-lg">
              <p className="text-sm font-medium mb-2">Impacto:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {isEmergencyStop ? (
                  <>
                    <li>• IA não executa ações</li>
                    <li>• Automações bloqueadas</li>
                    <li>• Mutations críticas negadas</li>
                    <li>• Leitura e auditoria continuam</li>
                  </>
                ) : (
                  <>
                    <li>• IA pode propor, mas não executar</li>
                    <li>• Ações de alto risco bloqueadas</li>
                    <li>• Agents apenas reportam</li>
                    <li>• Tasks continuam abertas</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
