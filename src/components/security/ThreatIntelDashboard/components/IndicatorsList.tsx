import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Target, Loader2 } from 'lucide-react';
import { useThreatIndicators } from '@/hooks/useThreatIntel';
import { severityColors, typeIcons, sourceLabels } from '../constants';

export function IndicatorsList() {
  const { data: indicators, isLoading } = useThreatIndicators({ limit: 100 });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-2">
        {(indicators ?? []).map((ind: any) => (
          <Card key={ind.id as string} className="border-border/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {typeIcons[ind.indicator_type as string] ?? <Target className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate">{ind.indicator_value as string}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {(ind.indicator_type as string).replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${severityColors[ind.severity as string] ?? ''}`}>
                      {(ind.severity as string).toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {sourceLabels[ind.source as string] ?? ind.source as string}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Confiança: {ind.confidence_score as number}%
                </div>
              </div>
              {((ind.tags as string[]) ?? []).length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {(ind.tags as string[]).slice(0, 5).map((tag: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {(indicators ?? []).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum indicador de ameaça encontrado.</p>
            <p className="text-sm">Sincronize os feeds para começar a monitorar.</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
