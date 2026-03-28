import { useTranslation } from 'react-i18next';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
      <AlertDialog open={!!agentToDelete} onOpenChange={() => onDeleteOpenChange(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('agentManagementPage.deleteAgent')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('agentManagementPage.deleteConfirm', { name: agentToDelete?.agent_name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('agentManagementPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('agentManagementPage.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!agentToDisable} onOpenChange={() => onDisableOpenChange(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('agentManagementPage.disableAgent')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('agentManagementPage.disableConfirm', { name: agentToDisable?.agent_name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('agentManagementPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onDisableConfirm}>
              {t('agentManagementPage.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
