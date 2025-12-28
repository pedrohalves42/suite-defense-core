import { useState } from 'react';
import { Trash2, AlertTriangle, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useJobCleanup } from '@/hooks/useJobCleanup';
import { getJobTypeLabel, getJobStatusLabel } from '@/lib/job-labels';
import { cn } from '@/lib/utils';

interface JobCleanupDialogProps {
  onCleanupComplete?: () => void;
}

const STATUS_OPTIONS = [
  { value: 'failed', label: 'Falhados', icon: XCircle, color: 'text-destructive' },
  { value: 'cancelled', label: 'Cancelados', icon: XCircle, color: 'text-muted-foreground' },
  { value: 'completed', label: 'Concluídos', icon: CheckCircle, color: 'text-success' },
  { value: 'queued', label: 'Na Fila', icon: Clock, color: 'text-warning' },
];

const DAYS_OPTIONS = [
  { value: 1, label: 'Mais de 1 dia' },
  { value: 3, label: 'Mais de 3 dias' },
  { value: 7, label: 'Mais de 7 dias' },
  { value: 14, label: 'Mais de 14 dias' },
  { value: 30, label: 'Mais de 30 dias' },
];

export function JobCleanupDialog({ onCleanupComplete }: JobCleanupDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  
  const {
    filters,
    setFilters,
    preview,
    isLoadingPreview,
    executeCleanup,
    isExecuting,
    cleanupResult
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

  const handleExecute = async () => {
    executeCleanup();
  };

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setConfirmed(false);
      if (cleanupResult) {
        onCleanupComplete?.();
      }
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Trash2 className="h-4 w-4" />
          Limpeza Avançada
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
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
                      isChecked 
                        ? "border-primary bg-primary/5" 
                        : "border-border hover:border-primary/50"
                    )}
                    onClick={() => handleStatusToggle(option.value, !isChecked)}
                  >
                    <Checkbox 
                      checked={isChecked}
                      onCheckedChange={(checked) => handleStatusToggle(option.value, !!checked)}
                    />
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
            <Select 
              value={filters.older_than_days.toString()} 
              onValueChange={handleDaysChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <Label>Preview da Limpeza</Label>
            <div className={cn(
              "p-4 rounded-lg border",
              preview && preview.total > 0 
                ? "bg-destructive/5 border-destructive/30" 
                : "bg-muted/50 border-border"
            )}>
              {isLoadingPreview ? (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Calculando...</span>
                </div>
              ) : preview ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Jobs a serem removidos:</span>
                    <span className={cn(
                      "text-2xl font-bold",
                      preview.total > 0 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {preview.total.toLocaleString('pt-BR')}
                    </span>
                  </div>

                  {preview.total > 0 && (
                    <>
                      {/* By Status */}
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Por status:</span>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(preview.byStatus).map(([status, count]) => (
                            <Badge key={status} variant="outline" className="text-xs">
                              {getJobStatusLabel(status)}: {count}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* By Type */}
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Por tipo (top 5):</span>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(preview.byType)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 5)
                            .map(([type, count]) => (
                              <Badge key={type} variant="secondary" className="text-xs">
                                {getJobTypeLabel(type)}: {count}
                              </Badge>
                            ))}
                        </div>
                      </div>

                      {/* Date Range */}
                      <div className="text-xs text-muted-foreground pt-2 border-t">
                        Período: {formatDate(preview.oldestDate)} até {formatDate(preview.newestDate)}
                      </div>
                    </>
                  )}

                  {preview.total === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Nenhum job encontrado com os filtros selecionados.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Selecione os filtros para ver o preview.
                </p>
              )}
            </div>
          </div>

          {/* Warning */}
          {preview && preview.total > 0 && (
            <div className="flex items-start gap-3 p-3 bg-warning/10 border border-warning/30 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Atenção: Esta ação é irreversível!</p>
                <p className="text-xs text-muted-foreground">
                  Os jobs removidos não poderão ser recuperados. Certifique-se de que não precisa mais desses dados.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox 
                    id="confirm" 
                    checked={confirmed} 
                    onCheckedChange={(checked) => setConfirmed(!!checked)}
                  />
                  <label htmlFor="confirm" className="text-xs cursor-pointer">
                    Confirmo que quero remover esses jobs permanentemente
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {cleanupResult && (
            <div className="flex items-center gap-3 p-3 bg-success/10 border border-success/30 rounded-lg">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="text-sm font-medium text-success">Limpeza concluída!</p>
                <p className="text-xs text-muted-foreground">
                  {cleanupResult.deleted_count} jobs foram removidos com sucesso.
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
              onClick={handleExecute}
              disabled={
                isExecuting || 
                !preview || 
                preview.total === 0 || 
                filters.status.length === 0 ||
                !confirmed
              }
              className="gap-2"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Limpando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Limpar {preview?.total.toLocaleString('pt-BR') || 0} Jobs
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
