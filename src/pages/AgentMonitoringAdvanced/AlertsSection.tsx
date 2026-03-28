import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertCircle, AlertTriangle, CheckCircle, ChevronDown, Clock } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import type { GroupedAlert, SilentProblem, SystemAlert } from './types';

interface SilentProblemsProps {
  silentProblems: SilentProblem[];
}

export function SilentProblemsCard({ silentProblems }: SilentProblemsProps) {
  if (silentProblems.length === 0) return null;

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-warning">
          <AlertTriangle className="w-5 h-5" />
          Problemas Silenciosos
        </CardTitle>
        <CardDescription>
          Situações que precisam de atenção mas não geram alarmes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {silentProblems.map((problem, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-card border rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-xl">{problem.icon}</span>
                <div>
                  <span className="font-medium">{problem.text}</span>
                  {problem.agents.length <= 3 && (
                    <p className="text-xs text-muted-foreground">
                      {problem.agents.join(', ')}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant={problem.severity === 'high' ? 'destructive' : 'secondary'}>
                {problem.severity === 'high' ? 'Urgente' : 'Atenção'}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface GroupedAlertsProps {
  groupedAlerts: GroupedAlert[];
  totalAlerts: number;
  onResolveGroup: (alertType: string, title: string) => void;
}

export function GroupedAlertsCard({ groupedAlerts, totalAlerts, onResolveGroup }: GroupedAlertsProps) {
  if (groupedAlerts.length === 0) return null;

  return (
    <Collapsible defaultOpen={true}>
      <Card className="border-l-4 border-l-red-500 bg-red-500/5">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full p-4 h-auto justify-between hover:bg-transparent"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🔴</span>
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-lg font-semibold">Alertas Pendentes</span>
              <Badge className="bg-red-500 text-white">
                {totalAlerts}
              </Badge>
              <span className="text-xs text-muted-foreground ml-2">
                ({groupedAlerts.length} grupos)
              </span>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-4">
              Alertas similares foram agrupados para facilitar a gestão
            </p>
            <div className="space-y-3">
              {groupedAlerts.slice(0, 5).map((alert) => (
                <div key={alert.groupKey || `${alert.alert_type}-${alert.title}`} className="flex items-center justify-between p-4 bg-card border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                        {alert.severity === 'critical' ? '🔴 Crítico' : alert.severity === 'high' ? '🟠 Alto' : '🟡 Médio'}
                      </Badge>
                      <span className="font-semibold">{alert.title}</span>
                      {alert.count > 1 && (
                        <Badge variant="outline" className="ml-2">
                          {alert.count} ocorrências
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {alert.message}
                      {alert.latestValue && (
                        <span className="font-mono ml-2 text-destructive">({alert.latestValue.toFixed(1)}%)</span>
                      )}
                    </p>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium">
                      Impacto: {alert.severity === 'critical' ? 'Pode causar indisponibilidade' : 'Requer atenção preventiva'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Último: {formatBrazilDateTime(alert.created_at, 'datetime')}
                    </p>
                  </div>
                  <Button 
                    onClick={() => onResolveGroup(alert.alert_type, alert.title)} 
                    variant="outline" 
                    size="sm"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    {alert.count > 1 ? 'Aplicar correções' : 'Aplicar correção'}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
