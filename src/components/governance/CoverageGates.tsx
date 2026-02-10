import { CheckCircle2, XCircle, RefreshCw, Shield, AlertTriangle } from 'lucide-react';
import { useCoverageGates } from '@/hooks/useCoverageGates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueryClient } from '@tanstack/react-query';
import { format, ptBR } from '@/lib/date-utils';

const gateLabels: Record<string, { label: string; description: string }> = {
  'all_critical_alerts_have_tasks': {
    label: 'Alertas Críticos → Tasks',
    description: 'Todos os alertas críticos/altos têm tasks associadas',
  },
  'all_critical_insights_have_tasks': {
    label: 'Insights Críticos → Tasks',
    description: 'Todos os insights críticos/altos têm tasks associadas',
  },
  'all_critical_tasks_have_owner': {
    label: 'Tasks Críticas → Owner',
    description: 'Todas as tasks críticas têm um responsável atribuído',
  },
};

export function CoverageGates() {
  const { data: coverage, isLoading, refetch, isFetching } = useCoverageGates();
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['coverage-gates'] });
    refetch();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={coverage?.is_compliant ? 'border-green-500/50' : 'border-destructive/50'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Gates de Cobertura
            </CardTitle>
            <CardDescription>
              Validação de governança em tempo real
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {coverage?.is_compliant ? (
              <Badge variant="outline" className="text-green-600 border-green-500">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Compliant
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                Gaps Detectados
              </Badge>
            )}
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {coverage?.gates.map((gate) => {
          const gateInfo = gateLabels[gate.gate] || { 
            label: gate.gate, 
            description: '' 
          };
          
          return (
            <div 
              key={gate.gate}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                gate.passed 
                  ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
                  : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
              }`}
            >
              <div className="flex items-center gap-3">
                {gate.passed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <p className="text-sm font-medium">{gateInfo.label}</p>
                  <p className="text-xs text-muted-foreground">{gateInfo.description}</p>
                </div>
              </div>
              {!gate.passed && gate.count > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {gate.count} gap{gate.count > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          );
        })}
        
        {coverage?.timestamp && (
          <p className="text-xs text-muted-foreground text-right pt-2">
            Última verificação: {format(new Date(coverage.timestamp), "HH:mm:ss", { locale: ptBR })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
