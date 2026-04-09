import { useState } from 'react';
import { Trash2, AlertTriangle, CheckCircle, Loader2, Zap, ShieldAlert } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useJobCleanup } from '@/hooks/useJobCleanup';
import { cn } from '@/lib/utils';
import { STATUS_OPTIONS, DAYS_OPTIONS } from './constants';
import { CleanupPreview } from './CleanupPreview';

interface JobCleanupDialogProps {
  onCleanupComplete?: () => void;
}

export function JobCleanupDialog({ onCleanupComplete }: JobCleanupDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const {
    filters, setFilters, preview, isLoadingPreview,
    executeCleanup, executeQuickCleanup, isExecuting,
    cleanupResult, resetCleanup,
  } = useJobCleanup();

  const handleStatusToggle = (status: string, checked: boolean) => {
    setConfirmed(false);
    if (checked) {
      setFilters({ ...filters, status: [...filters.status, status] });
    } else {
      setFilters({ ...filters, status: filters.status.filter(s => s !== status) });
    }
  };

  const handleDaysChange = (value: string) => {
    setConfirmed(false);
    setFilters({ ...filters, older_than_days: parseInt(value) });
  };

  const handleSafeFilterToggle = (field: 'only_undelivered' | 'require_no_executions', checked: boolean) => {
    setConfirmed(false);
    setFilters({ ...filters, [field]: checked });
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setConfirmed(false);
      if (cleanupResult) {
        resetCleanup();
        onCleanupComplete?.();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Trash2 className="h-4 w-4" />
          Limpeza Avançada
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Limpeza de Jobs Antigos
          </DialogTitle>
          <DialogDescription>
            Remova jobs antigos para manter o banco de dados limpo e otimizado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Quick Cleanup */}
          <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="font-medium">Limpeza Rápida</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Remove jobs falhados não entregues com mais de 24h (modo seguro).
                </p>
              </div>
              <Button size="sm" onClick={() => executeQuickCleanup()} disabled={isExecuting} className="shrink-0">
                {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Executar'}
              </Button>
            </div>
          </div>

          {/* Safe Filters */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              Filtros de Segurança
            </Label>
            <div className="grid gap-3">
              {(['only_undelivered', 'require_no_executions'] as const).map((field) => (
                <div
                  key={field}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                    filters[field] ? "border-success/50 bg-success/5" : "border-border hover:border-warning/50"
                  )}
                  onClick={() => handleSafeFilterToggle(field, !filters[field])}
                >
                  <Checkbox checked={filters[field]} onCheckedChange={(checked) => handleSafeFilterToggle(field, !!checked)} />
                  <div>
                    <span className="text-sm font-medium">
                      {field === 'only_undelivered' ? 'Somente jobs não entregues' : 'Ignorar jobs com execuções'}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {field === 'only_undelivered'
                        ? 'Recomendado - Remove apenas jobs que nunca foram executados'
                        : 'Recomendado - Evita conflito com política de auditoria (30 dias)'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Status Selection */}
          <div className="space-y-3">
            <Label>Status dos Jobs</Label>
            <div className="grid grid-cols-2 gap-3">
              {STATUS_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isChecked = filters.status.includes(option.value);
                return (
                  <div
                    key={option.value}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      isChecked ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    )}
                    onClick={() => handleStatusToggle(option.value, !isChecked)}
                  >
                    <Checkbox checked={isChecked} onCheckedChange={(checked) => handleStatusToggle(option.value, !!checked)} />
                    <Icon className={cn("h-4 w-4", option.color)} />
                    <span className="text-sm font-medium">{option.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Age Selection */}
          <div className="space-y-2">
            <Label>Idade dos Jobs</Label>
            <Select value={filters.older_than_days.toString()} onValueChange={handleDaysChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CleanupPreview preview={preview} isLoading={isLoadingPreview} />

          {/* Warning */}
          {preview && preview.removable > 0 && (
            <div className="flex items-start gap-3 p-3 bg-warning/10 border border-warning/30 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Atenção: Esta ação é irreversível!</p>
                <p className="text-xs text-muted-foreground">
                  Os jobs removidos não poderão ser recuperados. Certifique-se de que não precisa mais desses dados.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox id="confirm" checked={confirmed} onCheckedChange={(checked) => setConfirmed(!!checked)} />
                  <label htmlFor="confirm" className="text-xs cursor-pointer">
                    Confirmo que quero remover esses jobs permanentemente
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {cleanupResult && (
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-lg border",
              cleanupResult.deleted_count > 0 ? "bg-success/10 border-success/30" : "bg-warning/10 border-warning/30"
            )}>
              {cleanupResult.deleted_count > 0 ? (
                <CheckCircle className="h-5 w-5 text-success" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-warning" />
              )}
              <div>
                <p className={cn("text-sm font-medium", cleanupResult.deleted_count > 0 ? "text-success" : "text-warning")}>
                  {cleanupResult.deleted_count > 0 ? 'Limpeza concluída!' : 'Nenhum job removido'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {cleanupResult.deleted_count > 0
                    ? `${cleanupResult.deleted_count} jobs foram removidos com sucesso.`
                    : cleanupResult.skipped_reason || 'Nenhum job corresponde aos filtros.'}
                  {cleanupResult.skipped_count > 0 && cleanupResult.deleted_count > 0 && (
                    <span className="block mt-1">{cleanupResult.skipped_count} jobs foram ignorados (política de auditoria).</span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {cleanupResult ? 'Fechar' : 'Cancelar'}
          </Button>
          {!cleanupResult && (
            <Button
              variant="destructive"
              onClick={() => executeCleanup()}
              disabled={isExecuting || !preview || preview.removable === 0 || filters.status.length === 0 || !confirmed}
              className="gap-2"
            >
              {isExecuting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Limpando...</>
              ) : (
                <><Trash2 className="h-4 w-4" />Limpar {preview?.removable.toLocaleString('pt-BR') || 0} Jobs</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
