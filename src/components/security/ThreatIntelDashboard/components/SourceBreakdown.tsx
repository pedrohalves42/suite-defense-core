import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useThreatIntelStats } from '@/hooks/useThreatIntel';
import { sourceLabels } from '../constants';

export function SourceBreakdown() {
  const { data: stats } = useThreatIntelStats();
  const bySource = stats?.by_source ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Feeds Ativos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(bySource).map(([source, count]) => (
          <div key={source} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{sourceLabels[source] ?? source}</span>
            <Badge variant="secondary">{count}</Badge>
          </div>
        ))}
        {Object.keys(bySource).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum feed sincronizado ainda. Clique em "Sincronizar Feeds" para começar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
