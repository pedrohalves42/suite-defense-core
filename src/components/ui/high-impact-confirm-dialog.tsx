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
import { AlertTriangle } from 'lucide-react';

interface HighImpactConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  impactCount: number;
  impactType?: 'computers' | 'agents' | 'groups';
  actionLabel: string;
  actionDescription?: string;
  onConfirm: () => void;
  destructive?: boolean;
}

const IMPACT_TYPE_LABELS = {
  computers: { singular: 'computador', plural: 'computadores' },
  agents: { singular: 'agente', plural: 'agentes' },
  groups: { singular: 'grupo', plural: 'grupos' },
} as const;

/**
 * Dialog de confirmação para ações de alto impacto.
 * Exibe aviso quando a ação afeta muitos recursos.
 * 
 * Threshold padrão: 10 recursos (configurável via prop threshold)
 */
export function HighImpactConfirmDialog({
  open,
  onOpenChange,
  impactCount,
  impactType = 'computers',
  actionLabel,
  actionDescription,
  onConfirm,
  destructive = false,
}: HighImpactConfirmDialogProps) {
  const labels = IMPACT_TYPE_LABELS[impactType];
  const impactLabel = impactCount === 1 ? labels.singular : labels.plural;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Confirmar Ação de Alto Impacto
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Esta ação afetará <strong className="text-foreground">{impactCount} {impactLabel}</strong>.
            </p>
            {actionDescription && (
              <p className="text-sm">{actionDescription}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja continuar?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Threshold padrão para considerar "alto impacto"
export const HIGH_IMPACT_THRESHOLD = 10;

// Helper para verificar se precisa de confirmação
export function needsHighImpactConfirmation(count: number, threshold = HIGH_IMPACT_THRESHOLD): boolean {
  return count > threshold;
}
