import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useThreatIntelStats } from '@/hooks/useThreatIntel';
import { severityColors } from '../constants';

export function SeverityBreakdown() {
  const { data: stats } = useThreatIntelStats();
  const bySeverity = stats?.by_severity ?? {};
  const total = Object.values(bySeverity).reduce((a, b) => a + b, 0);
  const severityOrder = ['critical', 'high', 'medium', 'low', 'unknown'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Distribuição por Severidade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {severityOrder.map(sev => {
          const count = bySeverity[sev] ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={sev} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <Badge variant="outline" className={severityColors[sev]}>
                  {sev.toUpperCase()}
                </Badge>
                <span className="text-muted-foreground">{count}</span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
