import { useState } from 'react';
import { format, ptBR } from '@/lib/date-utils';
import { addDays } from 'date-fns';
import { AlertTriangle, Calendar, Loader2, ShieldAlert } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Task } from '@/hooks/useTasks';

interface AcceptRiskDialogProps {
  task: Task;
  open: boolean;
  onClose: () => void;
  onConfirm: (justification: string, expiryDate: Date) => void;
  isPending: boolean;
}

export function AcceptRiskDialog({ 
  task, 
  open, 
  onClose, 
  onConfirm,
  isPending 
}: AcceptRiskDialogProps) {
  const [justification, setJustification] = useState('');
  const [expiryDate, setExpiryDate] = useState<Date>(addDays(new Date(), 30));
  const [confirmed, setConfirmed] = useState(false);

  const minDate = addDays(new Date(), 7);
  const maxDate = addDays(new Date(), 365);

  const canSubmit = justification.trim().length >= 20 && confirmed && expiryDate >= minDate;

  const handleConfirm = () => {
    if (canSubmit) {
      onConfirm(justification, expiryDate);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-500">
            <ShieldAlert className="h-5 w-5" />
            Aceitar Risco
          </DialogTitle>
          <DialogDescription>
            Você está aceitando o risco associado a esta task. Isso significa que a vulnerabilidade
            ou problema não será resolvido agora, mas será reavaliado na data de expiração.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Task info */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">{task.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Severidade: {task.severity.toUpperCase()}
            </p>
          </div>

          {/* Justification */}
          <div className="space-y-2">
            <Label htmlFor="justification">
              Justificativa <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="justification"
              placeholder="Explique por que este risco está sendo aceito e quais mitigações alternativas estão em vigor..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Mínimo 20 caracteres ({justification.length}/20)
            </p>
          </div>

          {/* Expiry date */}
          <div className="space-y-2">
            <Label>
              Data de Reavaliação <span className="text-destructive">*</span>
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !expiryDate && "text-muted-foreground"
                  )}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {expiryDate ? format(expiryDate, "PPP", { locale: ptBR }) : "Selecione uma data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={expiryDate}
                  onSelect={(date) => date && setExpiryDate(date)}
                  disabled={(date) => date < minDate || date > maxDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Mínimo 7 dias, máximo 365 dias. Uma task de reavaliação será criada automaticamente.
            </p>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-orange-700 dark:text-orange-300">Atenção</p>
              <p className="text-orange-600 dark:text-orange-400 mt-1">
                Aceitar um risco significa que você assume responsabilidade por quaisquer 
                consequências até a data de reavaliação.
              </p>
            </div>
          </div>

          {/* Confirmation checkbox */}
          <div className="flex items-start gap-3">
            <Checkbox
              id="confirm-responsibility"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label 
              htmlFor="confirm-responsibility" 
              className="text-sm font-normal cursor-pointer"
            >
              Confirmo que estou ciente dos riscos e assumo responsabilidade por esta decisão.
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!canSubmit || isPending}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              'Aceitar Risco'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
