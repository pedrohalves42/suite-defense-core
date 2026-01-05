/**
 * Dialog para Dispensar Insight
 * Componente de fricção para evidenciar discordância com IA
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { XCircle, Loader2 } from 'lucide-react';
import { useDismissInsight } from '@/hooks/useDismissInsight';

interface DismissInsightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insightId: string;
  insightTitle: string;
}

const DISMISSAL_REASONS = [
  { value: 'false_positive', label: 'Falso positivo - não é um problema real' },
  { value: 'already_handled', label: 'Já foi tratado por outro meio' },
  { value: 'not_applicable', label: 'Não se aplica ao nosso contexto' },
  { value: 'low_priority', label: 'Baixa prioridade - não vale ação agora' },
  { value: 'other', label: 'Outro motivo' },
];

export function DismissInsightDialog({
  open,
  onOpenChange,
  insightId,
  insightTitle,
}: DismissInsightDialogProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const dismissInsight = useDismissInsight();

  const handleDismiss = () => {
    const reason = selectedReason === 'other' 
      ? customReason 
      : DISMISSAL_REASONS.find(r => r.value === selectedReason)?.label || selectedReason;

    dismissInsight.mutate(
      { insightId, dismissalReason: reason },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSelectedReason('');
          setCustomReason('');
        },
      }
    );
  };

  const isValid = selectedReason && (selectedReason !== 'other' || customReason.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-muted-foreground" />
            Dispensar Insight
          </DialogTitle>
          <DialogDescription>
            Você está prestes a dispensar: <strong>"{insightTitle}"</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Por que você está dispensando este insight?</Label>
            <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
              {DISMISSAL_REASONS.map((reason) => (
                <div key={reason.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={reason.value} id={reason.value} />
                  <Label htmlFor={reason.value} className="font-normal cursor-pointer">
                    {reason.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {selectedReason === 'other' && (
            <div className="space-y-2">
              <Label htmlFor="customReason">Descreva o motivo</Label>
              <Textarea
                id="customReason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Explique por que está dispensando este insight..."
                className="min-h-[80px]"
              />
            </div>
          )}

          <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            💡 Dispensar um insight cria um registro de que você discordou da recomendação da IA. 
            Isso é importante para auditoria e melhoria contínua do sistema.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleDismiss}
            disabled={!isValid || dismissInsight.isPending}
            variant="secondary"
          >
            {dismissInsight.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Dispensando...
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 mr-2" />
                Dispensar Insight
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
