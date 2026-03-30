import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, AlertTriangle, Info, Loader2, Shield, AlertOctagon } from 'lucide-react';
import { requiresFormalApproval } from '@/hooks/useAiActionApproval';
import { cn } from '@/lib/utils';
import type { AIAction, ActionConfig } from '../types';

interface PendingActionCardProps {
  action: AIAction;
  config: ActionConfig | undefined;
  isExecuting: boolean;
  isSuspiciousPattern: boolean;
  isPending: boolean;
  isBlastRadiusPending: boolean;
  onApprove: (actionId: string, riskLevel: string | null, action?: AIAction) => void;
  onReject: (actionId: string) => void;
}

function getRiskBadge(riskLevel: string) {
  const variants: Record<string, any> = {
    low: { variant: 'default', icon: Info },
    medium: { variant: 'secondary', icon: AlertTriangle },
    high: { variant: 'destructive', icon: AlertTriangle },
  };
  const cfg = variants[riskLevel] || variants.medium;
  const Icon = cfg.icon;
  return <Badge variant={cfg.variant} className="gap-1"><Icon className="h-3 w-3" />{riskLevel.toUpperCase()}</Badge>;
}

function getSeverityBadge(severity: string) {
  const variants: Record<string, any> = { low: 'default', medium: 'secondary', high: 'destructive', critical: 'destructive' };
  return <Badge variant={variants[severity] || 'default'}>{severity}</Badge>;
}

export function PendingActionCard({ action, config, isExecuting, isSuspiciousPattern, isPending, isBlastRadiusPending, onApprove, onReject }: PendingActionCardProps) {
  const isHighRisk = config?.risk_level === 'high' || config?.risk_level === 'critical';

  return (
    <Card className={cn(isHighRisk && "border-2 border-orange-500/50 bg-orange-500/5")}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              {action.ai_insights?.title || 'Acao Sugerida'}
              <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Pendente</Badge>
            </CardTitle>
            <CardDescription>{action.ai_insights?.description}</CardDescription>
          </div>
          <div className="flex gap-2">
            {config && getRiskBadge(config.risk_level)}
            {action.ai_insights && getSeverityBadge(action.ai_insights.severity)}
          </div>
        </div>
        {isHighRisk && (
          <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-orange-500" />
            <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
              ⚠️ Ação crítica — revisão atenta recomendada antes de aprovar
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-semibold text-sm mb-2">Tipo de Acao</h3>
          <div className="flex items-center gap-2">
            <code className="text-sm bg-muted px-2 py-1 rounded">{action.action_type}</code>
            {config && <span className="text-sm text-muted-foreground">{config.description}</span>}
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-sm mb-2">Detalhes da Acao</h3>
          <div className="bg-muted p-3 rounded text-sm">
            <pre className="whitespace-pre-wrap">{JSON.stringify(action.action_payload, null, 2)}</pre>
          </div>
        </div>
        {action.ai_insights?.evidence && (
          <div>
            <h3 className="font-semibold text-sm mb-2">Evidencias</h3>
            <div className="bg-muted p-3 rounded text-sm">
              <pre className="whitespace-pre-wrap">{JSON.stringify(action.ai_insights.evidence, null, 2)}</pre>
            </div>
          </div>
        )}
        {action.ai_insights?.confidence_score && (
          <div>
            <h3 className="font-semibold text-sm mb-2">Confianca da IA</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: `${action.ai_insights.confidence_score}%` }} />
              </div>
              <span className="text-sm font-medium">{action.ai_insights.confidence_score}%</span>
            </div>
          </div>
        )}
        {config && (
          <div>
            <h3 className="font-semibold text-sm mb-2">Limite de Execucoes</h3>
            <p className="text-sm text-muted-foreground">Maximo de {config.max_executions_per_day} execucoes por dia</p>
          </div>
        )}
        <div className="flex gap-2 pt-4 border-t flex-wrap">
          {(requiresFormalApproval(config?.risk_level || null) || isSuspiciousPattern) && (
            <Badge variant="outline" className={cn("gap-1 mr-2", isSuspiciousPattern && "border-amber-500 text-amber-600")}>
              <Shield className="h-3 w-3" />
              {isSuspiciousPattern ? 'Revisão Obrigatória (Padrão 100%)' : 'Aprovação Formal Requerida'}
            </Badge>
          )}
          <Button onClick={() => onApprove(action.id, config?.risk_level || null, action)} disabled={isExecuting || isPending || isBlastRadiusPending} className="gap-2">
            {isExecuting ? <><Loader2 className="h-4 w-4 animate-spin" />Executando...</> : <><CheckCircle className="h-4 w-4" />Aprovar e Executar</>}
          </Button>
          <Button variant="outline" onClick={() => onReject(action.id)} disabled={isExecuting || isPending} className="gap-2">
            <XCircle className="h-4 w-4" />Rejeitar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
