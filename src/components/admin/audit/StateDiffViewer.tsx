import { computeStateDiff } from '@/lib/audit-integrity';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ArrowRight, Minus, Plus, Equal } from 'lucide-react';

interface StateDiffViewerProps {
  stateBefore: any | null;
  stateAfter: any | null;
  compact?: boolean;
}

export function StateDiffViewer({ stateBefore, stateAfter, compact = false }: StateDiffViewerProps) {
  if (!stateBefore && !stateAfter) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Sem dados de mudança registrados
      </div>
    );
  }

  const diff = computeStateDiff(stateBefore, stateAfter);
  const changedItems = diff.filter(d => d.changed);
  const unchangedItems = diff.filter(d => !d.changed);

  if (changedItems.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Nenhuma alteração detectada
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {changedItems.slice(0, 3).map(item => (
          <Badge key={item.key} variant="outline" className="text-xs font-mono">
            {item.key}
          </Badge>
        ))}
        {changedItems.length > 3 && (
          <Badge variant="secondary" className="text-xs">
            +{changedItems.length - 3}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Changed items */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-primary" />
          Alterações ({changedItems.length})
        </h4>
        <div className="space-y-2">
          {changedItems.map(item => (
            <DiffRow key={item.key} item={item} />
          ))}
        </div>
      </div>

      {/* Unchanged items - collapsible */}
      {unchangedItems.length > 0 && (
        <details className="group">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
            <Equal className="h-3 w-3 inline mr-1" />
            {unchangedItems.length} campos sem alteração
          </summary>
          <div className="mt-2 pl-4 space-y-1 text-sm text-muted-foreground">
            {unchangedItems.map(item => (
              <div key={item.key} className="font-mono text-xs">
                {item.key}: {formatValue(item.after)}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function DiffRow({ item }: { item: { key: string; before: unknown; after: unknown; changed: boolean } }) {
  const isAddition = item.before === undefined;
  const isDeletion = item.after === undefined;

  return (
    <div className="rounded-lg border bg-muted/30 p-2 space-y-1">
      <div className="font-medium text-sm font-mono">{item.key}</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Before */}
        <div className={cn(
          "p-2 rounded border",
          isDeletion ? "bg-destructive/10 border-destructive/30" : "bg-muted"
        )}>
          <div className="flex items-center gap-1 text-muted-foreground mb-1">
            <Minus className="h-3 w-3" />
            Antes
          </div>
          <div className={cn(
            "font-mono break-all",
            isDeletion && "text-destructive line-through"
          )}>
            {formatValue(item.before)}
          </div>
        </div>

        {/* After */}
        <div className={cn(
          "p-2 rounded border",
          isAddition ? "bg-success/10 border-success/30" : "bg-muted"
        )}>
          <div className="flex items-center gap-1 text-muted-foreground mb-1">
            <Plus className="h-3 w-3" />
            Depois
          </div>
          <div className={cn(
            "font-mono break-all",
            isAddition && "text-success font-medium"
          )}>
            {formatValue(item.after)}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === undefined) return '(não existia)';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
