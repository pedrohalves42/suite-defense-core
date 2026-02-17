import { formatBrazilDateTime } from '@/lib/date-utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, AlertTriangle, Shield, FileWarning, Link2Off } from 'lucide-react';

interface AuditTrailIntegrity {
  orphan_actions: Array<{ id: string; action_type: string; created_at: string }>;
  orphan_actions_count: number;
  executions_without_audit: number;
  decisions_without_insight: number;
  integrity_score: number;
}

interface AuditTrailValidatorProps {
  integrity: AuditTrailIntegrity | null;
  isLoading: boolean;
}

export function AuditTrailValidator({ integrity, isLoading }: AuditTrailValidatorProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Integridade do Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!integrity) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Integridade do Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Dados de integridade indisponíveis</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const score = integrity.integrity_score;
  const isHealthy = score >= 95;
  const isWarning = score >= 80 && score < 95;
  const isCritical = score < 80;

  const getScoreColor = () => {
    if (isHealthy) return 'text-green-500';
    if (isWarning) return 'text-amber-500';
    return 'text-red-500';
  };

  const getProgressColor = () => {
    if (isHealthy) return 'bg-green-500';
    if (isWarning) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const issues = [
    {
      label: 'Ações Órfãs',
      count: integrity.orphan_actions_count,
      description: 'Ações sem insight associado',
      icon: Link2Off,
      severity: integrity.orphan_actions_count > 0 ? 'warning' : 'ok',
    },
    {
      label: 'Execuções sem Audit',
      count: integrity.executions_without_audit,
      description: 'Execuções sem registro de auditoria',
      icon: FileWarning,
      severity: integrity.executions_without_audit > 0 ? 'error' : 'ok',
    },
    {
      label: 'Decisões sem Insight',
      count: integrity.decisions_without_insight,
      description: 'Decisões sem insight de origem',
      icon: AlertTriangle,
      severity: integrity.decisions_without_insight > 0 ? 'warning' : 'ok',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Integridade do Audit Trail
        </CardTitle>
        <CardDescription>
          Validação da rastreabilidade das ações autônomas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Score */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Score de Integridade</span>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getScoreColor()}`}>
                {score}%
              </span>
              {isHealthy && <CheckCircle className="h-5 w-5 text-green-500" />}
              {isWarning && <AlertTriangle className="h-5 w-5 text-amber-500" />}
              {isCritical && <AlertTriangle className="h-5 w-5 text-red-500" />}
            </div>
          </div>
          <Progress
            value={score}
            className="h-2"
            style={{
              ['--progress-background' as string]: getProgressColor(),
            }}
          />
          <p className="text-xs text-muted-foreground">
            {isHealthy && 'Excelente! Todas as ações possuem rastreabilidade completa.'}
            {isWarning && 'Atenção: Algumas ações podem não ter rastreabilidade completa.'}
            {isCritical && 'Crítico: Problemas de integridade detectados no audit trail.'}
          </p>
        </div>

        {/* Issues */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Verificações</h4>
          <div className="space-y-2">
            {issues.map((issue) => (
              <div
                key={issue.label}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <issue.icon
                    className={`h-4 w-4 ${
                      issue.severity === 'ok'
                        ? 'text-green-500'
                        : issue.severity === 'warning'
                        ? 'text-amber-500'
                        : 'text-red-500'
                    }`}
                  />
                  <div>
                    <span className="text-sm font-medium">{issue.label}</span>
                    <p className="text-xs text-muted-foreground">{issue.description}</p>
                  </div>
                </div>
                <Badge
                  variant={issue.count === 0 ? 'secondary' : 'destructive'}
                  className={
                    issue.count === 0
                      ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                      : undefined
                  }
                >
                  {issue.count === 0 ? (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  ) : null}
                  {issue.count}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Orphan Actions Detail */}
        {integrity.orphan_actions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-amber-500">Ações Órfãs (últimas 10)</h4>
            <div className="space-y-1 text-xs">
              {integrity.orphan_actions.slice(0, 5).map((action) => (
                <div key={action.id} className="flex justify-between p-2 bg-amber-500/5 rounded">
                  <span className="font-mono">{action.action_type}</span>
                  <span className="text-muted-foreground">
                    {formatBrazilDateTime(action.created_at, 'date')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
