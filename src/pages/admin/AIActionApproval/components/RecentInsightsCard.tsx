import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, AlertTriangle, Info } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import type { AIInsight } from '../types';

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'text-red-500 bg-red-500/10';
    case 'warning': return 'text-yellow-500 bg-yellow-500/10';
    default: return 'text-blue-500 bg-blue-500/10';
  }
};

interface RecentInsightsCardProps {
  insights: AIInsight[];
}

export function RecentInsightsCard({ insights }: RecentInsightsCardProps) {
  if (!insights || insights.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          O que o sistema detectou recentemente
        </CardTitle>
        <CardDescription>Descobertas e recomendações dos últimos 30 dias</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {insights.map((insight) => (
            <div key={insight.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <div className={`p-2 rounded-full ${getSeverityColor(insight.severity)}`}>
                {insight.severity === 'critical' || insight.severity === 'warning' ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Info className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{insight.title}</p>
                  <Badge variant="outline" className="text-xs">
                    {Math.round((insight.confidence_score || 0) * 100)}% confiança
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{insight.description}</p>
                {insight.recommendation && (
                  <p className="text-xs text-primary mt-2">💡 {insight.recommendation}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{formatBrazilDateTime(insight.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
