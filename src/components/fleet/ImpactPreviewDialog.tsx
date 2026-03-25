import { useState } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Server } from 'lucide-react';

/**
 * ImpactPreviewDialog — HUM-001 mitigation
 * Shows how many agents will be affected before batch actions
 */

interface Agent {
  id: string;
  hostname?: string;
  name?: string;
}

interface ImpactPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  affectedAgents: Agent[];
  action: string;
  loading?: boolean;
}

export function ImpactPreviewDialog({
  open,
  onClose,
  onConfirm,
  affectedAgents,
  action,
  loading,
}: ImpactPreviewDialogProps) {
  const isHighImpact = affectedAgents.length > 100;
  const isCritical = affectedAgents.length > 500;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${isCritical ? 'text-destructive' : 'text-warning'}`} />
            Prévia de Impacto
          </AlertDialogTitle>
          <AlertDialogDescription>
            Revise o impacto antes de executar a ação.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <Alert variant={isCritical ? 'destructive' : 'default'}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>{affectedAgents.length}</strong> agente(s) serão afetados pela ação:{' '}
              <Badge variant="outline" className="ml-1">{action}</Badge>
              {isHighImpact && (
                <p className="mt-2 text-xs font-medium">
                  ⚠️ Alto impacto: mais de {isCritical ? '500' : '100'} agentes serão afetados.
                </p>
              )}
            </AlertDescription>
          </Alert>

          <div>
            <p className="text-sm font-medium mb-2 text-foreground">Agentes afetados:</p>
            <ScrollArea className="max-h-48 rounded-md border border-border/50">
              <div className="p-2 space-y-1">
                {affectedAgents.slice(0, 20).map((agent) => (
                  <div key={agent.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/30">
                    <Server className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm truncate">
                      {agent.hostname || agent.name || agent.id.slice(0, 12)}
                    </span>
                  </div>
                ))}
                {affectedAgents.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    ... e mais {affectedAgents.length - 20} agentes
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className={isCritical ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {loading ? 'Executando...' : 'Confirmar Execução'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
