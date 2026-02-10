import { AlertTriangle, Calendar, ShieldAlert } from 'lucide-react';
import { useRiskDebt, useRiskDebtSummary } from '@/hooks/useRiskDebt';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, formatDistanceToNow, ptBR } from '@/lib/date-utils';

const severityColors: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

export function RiskDebtCard() {
  const { data: riskDebt, isLoading } = useRiskDebt();
  const { summary } = useRiskDebtSummary();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={summary.expiringSoon > 0 ? 'border-orange-500/50' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-orange-500" />
              Débitos de Risco Ativos
            </CardTitle>
            <CardDescription>
              Riscos aceitos que precisam de reavaliação
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-orange-600 border-orange-500">
            {summary.total} ativo{summary.total !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {summary.total === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum risco aceito ativo</p>
          </div>
        ) : (
          <>
            {/* Summary badges */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {summary.bySeverity.critical > 0 && (
                <Badge variant="destructive">
                  {summary.bySeverity.critical} crítico{summary.bySeverity.critical > 1 ? 's' : ''}
                </Badge>
              )}
              {summary.bySeverity.high > 0 && (
                <Badge className="bg-orange-500">
                  {summary.bySeverity.high} alto{summary.bySeverity.high > 1 ? 's' : ''}
                </Badge>
              )}
              {summary.expiringSoon > 0 && (
                <Badge variant="outline" className="text-yellow-600 border-yellow-500">
                  <Calendar className="h-3 w-3 mr-1" />
                  {summary.expiringSoon} expirando em 7 dias
                </Badge>
              )}
            </div>

            {/* Risk list */}
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {riskDebt?.map((risk) => (
                  <div 
                    key={risk.id}
                    className={`p-3 rounded-lg border ${
                      risk.risk_status === 'expiring_soon'
                        ? 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${severityColors[risk.severity]}`} />
                        <p className="text-sm font-medium line-clamp-1">{risk.title}</p>
                      </div>
                      {risk.risk_status === 'expiring_soon' && (
                        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                      )}
                    </div>
                    
                    {risk.risk_expiry_at && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>
                          Expira {formatDistanceToNow(new Date(risk.risk_expiry_at), { 
                            locale: ptBR, 
                            addSuffix: true 
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
