import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FileText, Quote, Target, Sparkles } from 'lucide-react';
import { AuditResult, RECOMMENDATION_LABELS } from '@/hooks/useSystemAudit';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface AuditExecutiveSummaryProps {
  audit: AuditResult;
}

export function AuditExecutiveSummary({ audit }: AuditExecutiveSummaryProps) {
  const recommendation = RECOMMENDATION_LABELS[audit.recommendation];

  const getRecommendationBadgeClasses = () => {
    switch (recommendation.color) {
      case 'success':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'warning':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'destructive':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  return (
    <div className="space-y-4">
      {/* Recommendation Card */}
      <Card className={cn(
        'border-2',
        recommendation.color === 'success' && 'border-green-500/30',
        recommendation.color === 'warning' && 'border-yellow-500/30',
        recommendation.color === 'destructive' && 'border-red-500/30',
        recommendation.color === 'primary' && 'border-primary/30'
      )}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Target className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Recomendação</p>
                <Badge 
                  variant="outline" 
                  className={cn('text-lg px-3 py-1 mt-1', getRecommendationBadgeClasses())}
                >
                  {recommendation.label}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Score Geral</p>
              <p className="text-4xl font-bold">{audit.overall_score}<span className="text-lg text-muted-foreground">/100</span></p>
            </div>
          </div>
          <Separator className="my-4" />
          <p className="text-sm text-muted-foreground">{recommendation.description}</p>
        </CardContent>
      </Card>

      {/* Final Sentence - The Layman Test */}
      <Card className="bg-accent/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Quote className="h-4 w-4" />
            Teste do Leigo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg italic">"{audit.final_sentence}"</p>
        </CardContent>
      </Card>

      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Resumo Executivo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{audit.executive_summary}</ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Snapshot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Métricas Coletadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(audit.metrics_snapshot).map(([key, value]) => (
              <div key={key} className="p-2 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground capitalize">
                  {key.replace(/_/g, ' ')}
                </p>
                <p className="text-lg font-semibold">{String(value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
