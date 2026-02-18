import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AuditDimension, DIMENSION_LABELS } from '@/hooks/useSystemAudit';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface AuditDimensionCardProps {
  dimensionKey: string;
  dimension: AuditDimension;
  previousScore?: number;
}

export function AuditDimensionCard({ dimensionKey, dimension, previousScore }: AuditDimensionCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();
  
  const label = DIMENSION_LABELS[dimensionKey] || { name: dimensionKey, description: '' };
  const trend = previousScore !== undefined ? dimension.score - previousScore : 0;
  
  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-500';
    if (score >= 6) return 'text-yellow-500';
    if (score >= 4) return 'text-orange-500';
    return 'text-red-500';
  };

  const getScoreBadgeVariant = (score: number): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (score >= 8) return 'default';
    if (score >= 6) return 'secondary';
    if (score >= 4) return 'outline';
    return 'destructive';
  };

  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? 'text-green-500' : trend < 0 ? 'text-red-500' : 'text-muted-foreground';

  return (
    <Card className="transition-all hover:shadow-md">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-medium">{label.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{label.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={getScoreBadgeVariant(dimension.score)} className={cn('text-lg font-bold', getScoreColor(dimension.score))}>
                {dimension.score}/10
              </Badge>
              {previousScore !== undefined && (
                <div className={cn('flex items-center gap-0.5', trendColor)}>
                  <TrendIcon className="h-4 w-4" />
                  <span className="text-xs font-medium">
                    {trend > 0 ? '+' : ''}{trend.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
              <span>{isOpen ? t('adminPages.audit.hideAnalysis') : t('adminPages.audit.showAnalysis')}</span>
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{dimension.analysis}</ReactMarkdown>
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
