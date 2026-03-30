import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
      <ConfirmDialog
        open={!!agentToCleanup}
        onOpenChange={() => onCloseAgentCleanup()}
        title="Confirmar Limpeza"
        description={`Isso irá remover o registro de "${agentToCleanup?.agent_name}" e permitir uma nova instalação. Esta ação não pode ser desfeita.`}
        confirmLabel={cleanupPending ? 'Limpando...' : 'Confirmar Limpeza'}
        onConfirm={() => agentToCleanup && onConfirmAgentCleanup(agentToCleanup.id)}
        destructive
        loading={cleanupPending}
      />

      <ConfirmDialog
        open={showBulkCleanupDialog}
        onOpenChange={onCloseBulkCleanup}
        title="Confirmar Limpeza em Massa"
        description={`Isso irá remover os registros de ${problematicCount} computadores problemáticos. Esta ação não pode ser desfeita.`}
        confirmLabel={bulkCleanupPending ? 'Limpando...' : `Limpar ${problematicCount} Computadores`}
        onConfirm={onConfirmBulkCleanup}
        destructive
        loading={bulkCleanupPending}
      />
    </>
  );
}
