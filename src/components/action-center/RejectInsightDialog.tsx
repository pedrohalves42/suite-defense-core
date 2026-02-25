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
import { Loader2, XCircle, AlertTriangle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { hToast } from '@/lib/humanized-toast';
import { useTenant } from '@/hooks/useTenant';

interface RejectInsightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insightId: string;
  insightTitle: string;
  insightType: string;
  agentName?: string;
  onRejected?: () => void;
}

const REJECTION_REASONS = [
  { value: 'false_positive', label: 'Falso positivo', description: 'A detecção não corresponde a um problema real' },
  { value: 'not_relevant', label: 'Não relevante', description: 'O insight não é útil para esta situação' },
  { value: 'already_resolved', label: 'Já resolvido', description: 'O problema foi resolvido manualmente' },
  { value: 'expected_behavior', label: 'Comportamento esperado', description: 'Este comportamento é normal/esperado' },
  { value: 'other', label: 'Outro motivo', description: 'Especifique abaixo' },
] as const;

export function RejectInsightDialog({
  open,
  onOpenChange,
  insightId,
  insightTitle,
  insightType,
  agentName,
  onRejected,
}: RejectInsightDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customReason, setCustomReason] = useState('');
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  const rejectMutation = useMutation({
    mutationFn: async () => {
      // Validar que é um insight real da IA (não alertas de sistema)
      if (insightId.startsWith('offline_') || insightId.startsWith('alert_') || insightId.startsWith('system_')) {
        throw new Error('Alertas de sistema não podem ser rejeitados como insights da IA. Use "Entendido" para marcá-los como revisados.');
      }

      const reasonLabel = REJECTION_REASONS.find(r => r.value === selectedReason)?.label || selectedReason;
      const fullReason = selectedReason === 'other' 
        ? customReason 
        : `${reasonLabel}${customReason ? `: ${customReason}` : ''}`;

      // Use the edge function handler for reject action (uses service role, handles audit trail)
      const { data, error } = await supabase.functions.invoke('action-center-feed', {
        method: 'POST',
        headers: {
          'x-tenant-id': tenant?.id || '',
        },
        body: {
          item_id: insightId,
          source_type: 'ai_insight',
          action: 'reject',
          reason: fullReason,
          reason_category: selectedReason,
        },
      });

      if (error) {
        // Try to extract meaningful error from edge function response
        let errorMsg = error.message || 'Erro ao rejeitar insight';
        try {
          if (error.context) {
            const body = await error.context.json();
            errorMsg = body?.error || errorMsg;
          }
        } catch { /* ignore parse errors */ }
        throw new Error(errorMsg);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-center'] });
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      queryClient.invalidateQueries({ queryKey: ['decision-events'] });
      queryClient.invalidateQueries({ queryKey: ['critical-insights-count'] });
      hToast.success('Insight rejeitado e registrado para auditoria');
      onOpenChange(false);
      setSelectedReason('');
      setCustomReason('');
      onRejected?.();
    },
    onError: (error) => {
      console.error('[RejectInsightDialog] Error:', error);
      hToast.error(error instanceof Error ? error.message : 'Erro ao rejeitar insight');
    },
  });

  const handleReject = () => {
    if (!selectedReason) return;
    if (selectedReason === 'other' && !customReason.trim()) return;
    rejectMutation.mutate();
  };

  const isValid = selectedReason && (selectedReason !== 'other' || customReason.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            Rejeitar Insight da IA
          </DialogTitle>
          <DialogDescription>
            Você está rejeitando: <strong className="text-foreground">{insightTitle}</strong>
            {agentName && (
              <>
                <br />
                <span className="text-muted-foreground">Agente: {agentName}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Sua rejeição será registrada para melhorar a precisão das detecções futuras.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Por que você está rejeitando?</Label>
            <RadioGroup
              value={selectedReason}
              onValueChange={setSelectedReason}
              className="space-y-2"
            >
              {REJECTION_REASONS.map((reason) => (
                <div
                  key={reason.value}
                  className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                >
                  <RadioGroupItem value={reason.value} id={reason.value} className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor={reason.value} className="font-medium cursor-pointer">
                      {reason.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{reason.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {(selectedReason === 'other' || selectedReason) && (
            <div className="space-y-2">
              <Label htmlFor="custom-reason" className="text-sm">
                {selectedReason === 'other' ? 'Descreva o motivo *' : 'Detalhes adicionais (opcional)'}
              </Label>
              <Textarea
                id="custom-reason"
                placeholder="Ex: O servidor estava em manutenção programada durante este período..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={!isValid || rejectMutation.isPending}
          >
            {rejectMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <XCircle className="h-4 w-4 mr-2" />
            )}
            Confirmar Rejeição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
