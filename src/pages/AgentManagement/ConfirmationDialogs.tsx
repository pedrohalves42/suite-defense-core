import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { Agent } from './types';

interface ConfirmationDialogsProps {
  agentToDelete: Agent | null;
  onDeleteOpenChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
  agentToDisable: Agent | null;
  onDisableOpenChange: (open: boolean) => void;
  onDisableConfirm: () => void;
}

export function ConfirmationDialogs({
  agentToDelete, onDeleteOpenChange, onDeleteConfirm,
  agentToDisable, onDisableOpenChange, onDisableConfirm,
}: ConfirmationDialogsProps) {
  const { t } = useTranslation();

  return (
    <>
      <ConfirmDialog
        open={!!agentToDelete}
        onOpenChange={() => onDeleteOpenChange(false)}
        title={t('agentManagementPage.deleteAgent')}
        description={t('agentManagementPage.deleteConfirm', { name: agentToDelete?.agent_name })}
        confirmLabel={t('agentManagementPage.confirm')}
        cancelLabel={t('agentManagementPage.cancel')}
        onConfirm={onDeleteConfirm}
        destructive
      />

      <ConfirmDialog
        open={!!agentToDisable}
        onOpenChange={() => onDisableOpenChange(false)}
        title={t('agentManagementPage.disableAgent')}
        description={t('agentManagementPage.disableConfirm', { name: agentToDisable?.agent_name })}
        confirmLabel={t('agentManagementPage.confirm')}
        cancelLabel={t('agentManagementPage.cancel')}
        onConfirm={onDisableConfirm}
      />
    </>
  );
}
