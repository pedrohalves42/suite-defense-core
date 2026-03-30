import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Info, CheckCircle, TrendingUp, Sparkles, XCircle } from "lucide-react";
import { AIInsightExplainer } from "@/components/admin/AIInsightExplainer";
import { InsightFeedbackButtons } from "@/components/insights/InsightFeedbackButtons";
import { formatInsightDate, getSeverityColor, getTypeLabel, type AIInsight } from "../hooks/useAIInsightsData";

interface InsightCardProps {
  insight: AIInsight;
  onAcknowledge: (id: string) => void;
  onDismiss: (insight: { id: string; title: string }) => void;
  onExecuteSolution: (params: { actionId: string; solutionType: string }) => void;
  isAcknowledging: boolean;
  isExecuting: boolean;
  variant?: 'pending' | 'acknowledged';
}

export function InsightCard({ 
  insight, onAcknowledge, onDismiss, onExecuteSolution, 
  isAcknowledging, isExecuting, variant = 'pending' 
}: InsightCardProps) {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-warning" />;
      default: return <Info className="h-5 w-5 text-info" />;
    }
  };

  if (variant === 'acknowledged') {
    return (
      <Card className="opacity-75">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              {getSeverityIcon(insight.severity)}
              <div className="flex-1">
                <CardTitle className="text-lg">{insight.title}</CardTitle>
                <CardDescription className="mt-1">{insight.description}</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="gap-1">
              <CheckCircle className="h-3 w-3" />Reconhecido
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <InsightFeedbackButtons insightId={insight.id} compact />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatInsightDate(insight.created_at)}</span>
            {insight.acknowledged_at && <span>Reconhecido em {formatInsightDate(insight.acknowledged_at)}</span>}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4" style={{
      borderLeftColor: insight.severity === 'critical' ? 'hsl(var(--destructive))' : 
                       insight.severity === 'warning' ? 'hsl(var(--warning))' : 'hsl(var(--info))'
    }}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            {getSeverityIcon(insight.severity)}
            <div className="flex-1">
              <CardTitle className="text-lg">{insight.title}</CardTitle>
              <CardDescription className="mt-1">{insight.description}</CardDescription>
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <Badge variant={getSeverityColor(insight.severity) as any}>{insight.severity}</Badge>
            <Badge variant="outline">{getTypeLabel(insight.insight_type)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recommendation */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <div className="flex items-start gap-2">
            <TrendingUp className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-semibold text-sm mb-1">Recomendacao:</p>
              <p className="text-sm text-muted-foreground">{insight.recommendation}</p>
            </div>
          </div>
        </div>

        {/* Evidence */}
        {insight.evidence && Object.keys(insight.evidence).length > 0 && (
          <div className="border rounded-lg p-4 space-y-3">
            <p className="font-semibold text-sm">Evidências:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {insight.evidence.failureRate !== undefined && (
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground text-xs block">Taxa de Falha</span>
                  <span className="font-semibold">{Number(insight.evidence.failureRate).toFixed(1)}%</span>
                </div>
              )}
              {insight.evidence.avgCpuUsage !== undefined && (
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground text-xs block">CPU Média</span>
                  <span className="font-semibold">{Number(insight.evidence.avgCpuUsage).toFixed(1)}%</span>
                </div>
              )}
              {insight.evidence.avgMemoryUsage !== undefined && (
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground text-xs block">Memória Média</span>
                  <span className="font-semibold">{Number(insight.evidence.avgMemoryUsage).toFixed(1)}%</span>
                </div>
              )}
              {insight.evidence.problematicJobsCount !== undefined && (
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground text-xs block">Jobs Problemáticos</span>
                  <span className="font-semibold">{insight.evidence.problematicJobsCount}</span>
                </div>
              )}
              {insight.evidence.systemAlertsCount !== undefined && (
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground text-xs block">Alertas do Sistema</span>
                  <span className="font-semibold text-destructive">{insight.evidence.systemAlertsCount}</span>
                </div>
              )}
            </div>

            {Array.isArray(insight.evidence.evidence_pack) && insight.evidence.evidence_pack.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold text-xs text-muted-foreground">Pontos de Dados Detalhados:</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {insight.evidence.evidence_pack.map((ep: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-xs bg-muted/30 rounded p-2">
                      <Badge variant={ep.severity === 'critical' ? 'destructive' : ep.severity === 'warning' ? 'outline' : 'secondary'} className="text-[10px] shrink-0 mt-0.5">
                        {ep.severity}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{ep.data_point}</span>
                        {ep.value !== undefined && (
                          <span className="text-muted-foreground ml-1">
                            {typeof ep.value === 'object' ? Object.entries(ep.value).map(([k, v]) => `${k}: ${v}`).join(', ') : typeof ep.value === 'number' ? Number(ep.value).toFixed(1) : String(ep.value)}
                          </span>
                        )}
                        {ep.source_table && <span className="text-muted-foreground/60 ml-1 text-[10px]">({ep.source_table})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(insight.evidence.data_sources) && (
              <div className="text-xs text-muted-foreground">
                <span>Fontes: </span>
                {insight.evidence.data_sources.map((src: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-[10px] mr-1">{src}</Badge>
                ))}
              </div>
            )}

            {insight.evidence.reasoning_summary && (
              <p className="text-xs text-muted-foreground italic border-t pt-2">{insight.evidence.reasoning_summary}</p>
            )}
          </div>
        )}

        {/* Feedback */}
        <div className="pt-2 border-t">
          <InsightFeedbackButtons insightId={insight.id} />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t flex-wrap gap-2">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Confiança: {(insight.confidence_score * 100).toFixed(0)}%</span>
            <span>•</span>
            <span>{formatInsightDate(insight.created_at)}</span>
            <AIInsightExplainer
              insightId={insight.id}
              title={insight.title}
              description={insight.description}
              evidence={insight.evidence}
              confidence={insight.confidence_score}
              insightType={insight.insight_type}
              severity={insight.severity}
            />
          </div>
          <div className="flex items-center gap-2">
            {insight.insight_type === 'agent_health' && (
              <Button size="sm" variant="outline" onClick={() => onExecuteSolution({ actionId: insight.id, solutionType: 'cleanup_stuck_jobs' })} disabled={isExecuting}>
                <Sparkles className="h-4 w-4 mr-2" />Limpar Jobs Travados
              </Button>
            )}
            {insight.insight_type === 'system_alerts' && (
              <Button size="sm" variant="outline" onClick={() => onExecuteSolution({ actionId: insight.id, solutionType: 'acknowledge_alerts' })} disabled={isExecuting}>
                <Sparkles className="h-4 w-4 mr-2" />Reconhecer Alertas
              </Button>
            )}
            {insight.insight_type === 'missing_data' && (
              <Button size="sm" variant="outline" onClick={() => onExecuteSolution({ actionId: insight.id, solutionType: 'create_security_jobs' })} disabled={isExecuting}>
                <Sparkles className="h-4 w-4 mr-2" />Criar Jobs de Coleta
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onDismiss({ id: insight.id, title: insight.title })} className="text-muted-foreground hover:text-foreground">
              <XCircle className="h-4 w-4 mr-2" />Dispensar
            </Button>
            <Button size="sm" onClick={() => onAcknowledge(insight.id)} disabled={isAcknowledging}>
              <CheckCircle className="h-4 w-4 mr-2" />Reconhecer
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
