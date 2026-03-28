import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ProblematicAgent } from './types';

interface CleanupDialogsProps {
  agentToCleanup: ProblematicAgent | null;
  onCloseAgentCleanup: () => void;
  onConfirmAgentCleanup: (agentId: string) => void;
  cleanupPending: boolean;
  showBulkCleanupDialog: boolean;
  onCloseBulkCleanup: (open: boolean) => void;
  onConfirmBulkCleanup: () => void;
  bulkCleanupPending: boolean;
  problematicCount: number;
}

export function CleanupDialogs({
  agentToCleanup,
  onCloseAgentCleanup,
  onConfirmAgentCleanup,
  cleanupPending,
  showBulkCleanupDialog,
  onCloseBulkCleanup,
  onConfirmBulkCleanup,
  bulkCleanupPending,
  problematicCount,
}: CleanupDialogsProps) {
  return (
    <>
      <AlertDialog open={!!agentToCleanup} onOpenChange={() => onCloseAgentCleanup()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Limpeza</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá remover o registro de "{agentToCleanup?.agent_name}" e permitir uma nova instalação.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => agentToCleanup && onConfirmAgentCleanup(agentToCleanup.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cleanupPending ? 'Limpando...' : 'Confirmar Limpeza'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkCleanupDialog} onOpenChange={onCloseBulkCleanup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Limpeza em Massa</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá remover os registros de {problematicCount} computadores problemáticos.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmBulkCleanup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkCleanupPending ? 'Limpando...' : `Limpar ${problematicCount} Computadores`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
