import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getJobTypeLabel, getJobStatusLabel } from '@/lib/job-labels';
import { formatBrazilDateTime } from '@/lib/date-utils';

interface CleanupPreviewProps {
  preview: {
    total: number;
    removable: number;
    blockedByExecutions: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    oldestDate: string | null;
    newestDate: string | null;
  } | null;
  isLoading: boolean;
}

export function CleanupPreview({ preview, isLoading }: CleanupPreviewProps) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return formatBrazilDateTime(dateStr, 'datetime');
  };

  return (
    <div className="space-y-3">
      <Label>Preview da Limpeza</Label>
      <div className={cn(
        "p-4 rounded-lg border",
        preview && preview.removable > 0
          ? "bg-destructive/5 border-destructive/30"
          : "bg-muted/50 border-border"
      )}>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Calculando...</span>
          </div>
        ) : preview ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-background border">
                <div className="text-xs text-muted-foreground">Encontrados</div>
                <div className="text-xl font-bold">{preview.total.toLocaleString('pt-BR')}</div>
              </div>
              <div className={cn(
                "text-center p-3 rounded-lg border",
                preview.removable > 0 ? "bg-destructive/10 border-destructive/30" : "bg-background"
              )}>
                <div className="text-xs text-muted-foreground">Removíveis</div>
                <div className={cn("text-xl font-bold", preview.removable > 0 ? "text-destructive" : "text-muted-foreground")}>
                  {preview.removable.toLocaleString('pt-BR')}
                </div>
              </div>
            </div>

            {preview.blockedByExecutions > 0 && (
              <div className="flex items-center gap-2 p-2 rounded bg-warning/10 text-xs">
                <ShieldAlert className="h-4 w-4 text-warning shrink-0" />
                <span>{preview.blockedByExecutions} jobs têm execuções e não podem ser removidos (auditoria ~30 dias)</span>
              </div>
            )}

            {preview.removable > 0 && (
              <>
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
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  Período: {formatDate(preview.oldestDate)} até {formatDate(preview.newestDate)}
                </div>
              </>
            )}

            {preview.removable === 0 && preview.total === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Nenhum job encontrado com os filtros selecionados.
              </p>
            )}
            {preview.removable === 0 && preview.total > 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Todos os {preview.total} jobs encontrados estão bloqueados por política de auditoria.
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
  );
}
