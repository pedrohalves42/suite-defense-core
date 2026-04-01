import { useState } from 'react';
import { useInsightFeedback, FeedbackType } from '@/hooks/useInsightFeedback';
import { type ActionHistoryItem } from '@/hooks/useActionCenterHistory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Clock, CheckCircle2, XCircle, Bot, User, ChevronDown, ShieldCheck, BookOpen, AlertTriangle, ThumbsUp, ThumbsDown, Ban } from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';
import { explainInsight, explainEffectiveness, type EffectivenessStatus } from '@/lib/explain-insight';
import { getEducationalMoment } from '@/lib/education-mapping';
import { mapInsightToAction } from '@/lib/insight-action-mapping';
import { EffectivenessBadge } from './EffectivenessBadge';

const riskColors: Record<string, string> = {
  critical: 'text-red-600 bg-red-50 border-red-200',
  high: 'text-orange-600 bg-orange-50 border-orange-200',
  medium: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  low: 'text-blue-600 bg-blue-50 border-blue-200',
};

export function HistoryItemCard({ item }: { item: ActionHistoryItem }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showEducation, setShowEducation] = useState(false);
  const [showEffectiveness, setShowEffectiveness] = useState(false);
  const { feedback, hasFeedback, submitFeedback } = useInsightFeedback(item.id);

  const handleFeedback = (type: FeedbackType) => {
    submitFeedback.mutate({ insightId: item.id, feedbackType: type });
  };

  const isResolved = item.status === 'resolved';
  const wasAutoExecuted = item.auto_action_executed;
  const mapping = mapInsightToAction(item.insight_type);
  const explanation = explainInsight(item, mapping);
  const education = getEducationalMoment(item.insight_type);

  const action = item.ai_actions?.[0];
  const effectivenessStatus = (action?.effectiveness_status || item.final_outcome || 'pending') as EffectivenessStatus;
  const effectivenessEvidence = action?.effectiveness_evidence as Record<string, unknown> | null;
  const effectivenessExplanation = explainEffectiveness(
    effectivenessStatus, item.insight_type, effectivenessEvidence || undefined
  );

  return (
    <Card className="border-l-4 overflow-hidden" style={{ borderLeftColor: isResolved ? 'hsl(142.1 76.2% 36.3%)' : 'hsl(var(--muted))' }}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {isResolved ? (
                  <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="font-medium">{explanation.human_title}</span>
                <Badge variant={isResolved ? 'default' : 'secondary'} className="shrink-0">
                  {isResolved ? 'Resolvido' : 'Ignorado'}
                </Badge>
                <EffectivenessBadge status={effectivenessStatus} />
              </div>
              <p className="text-sm text-muted-foreground mb-2">{explanation.what_happened}</p>
              <p className="text-sm font-medium" style={{
                color: effectivenessStatus === 'resolved' ? 'hsl(142.1 76.2% 36.3%)'
                  : effectivenessStatus === 'failed' ? 'hsl(0 84.2% 60.2%)'
                  : effectivenessStatus === 'partial' ? 'hsl(38 92% 50%)'
                  : 'inherit'
              }}>
                {effectivenessExplanation.human_text}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Badge variant="outline" className={`capitalize ${riskColors[mapping.risk] || ''}`}>
                {mapping.risk}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {wasAutoExecuted ? 'Auto' : 'Manual'}
              </Badge>
            </div>
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground border-t pt-3">
            {item.agent && (
              <span className="flex items-center gap-1">
                <span className="font-medium">{item.agent.agent_name}</span>
                {item.agent.hostname && <span>({item.agent.hostname})</span>}
              </span>
            )}
            <span className="flex items-center gap-1">
              {wasAutoExecuted ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
              <span>{wasAutoExecuted ? 'Sistema' : 'Manual'}</span>
            </span>
            {item.resolved_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(item.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 bg-muted rounded">
              Política: {explanation.policy_reference}
            </span>
          </div>

          {/* Expandable sections */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Collapsible open={showEducation} onOpenChange={setShowEducation}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  <BookOpen className="h-3 w-3" />
                  Por que é importante?
                  <ChevronDown className={`h-3 w-3 transition-transform ${showEducation ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-blue-600" />
                    {education.title}
                  </h4>
                  <p className="text-sm text-muted-foreground">{education.explanation}</p>
                  <p className="text-sm"><strong>Por que importa:</strong> {education.why_it_matters}</p>
                  {education.what_to_do_next && (
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Próximos passos:</strong> {education.what_to_do_next}
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {effectivenessEvidence && Object.keys(effectivenessEvidence).length > 0 && (
              <Collapsible open={showEffectiveness} onOpenChange={setShowEffectiveness}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Ver verificação
                    <ChevronDown className={`h-3 w-3 transition-transform ${showEffectiveness ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <h4 className="font-medium text-xs mb-2 text-muted-foreground">Evidências da verificação</h4>
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono bg-background p-2 rounded border">
                      {JSON.stringify(effectivenessEvidence, null, 2)}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {item.evidence && (
              <Collapsible open={showDetails} onOpenChange={setShowDetails}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Ver evidências originais
                    <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <h4 className="font-medium text-xs mb-2 text-muted-foreground">Evidências técnicas originais</h4>
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono bg-background p-2 rounded border">
                      {JSON.stringify(item.evidence, null, 2)}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          {/* Feedback buttons */}
          <div className="flex items-center gap-2 border-t pt-3 mt-3">
            <span className="text-xs text-muted-foreground">Esta ação foi útil?</span>
            {hasFeedback ? (
              <Badge variant="outline" className="text-xs">
                {feedback?.feedback_type === 'useful' && '👍 Útil'}
                {feedback?.feedback_type === 'noise' && '👎 Ruído'}
                {feedback?.feedback_type === 'false_positive' && '🚫 Falso positivo'}
              </Badge>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 hover:bg-green-50 hover:text-green-700"
                  onClick={() => handleFeedback('useful')} disabled={submitFeedback.isPending}>
                  <ThumbsUp className="h-3 w-3" /> Útil
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 hover:bg-yellow-50 hover:text-yellow-700"
                  onClick={() => handleFeedback('noise')} disabled={submitFeedback.isPending}>
                  <ThumbsDown className="h-3 w-3" /> Ruído
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 hover:bg-red-50 hover:text-red-700"
                  onClick={() => handleFeedback('false_positive')} disabled={submitFeedback.isPending}>
                  <Ban className="h-3 w-3" /> Falso positivo
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
