import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, TrendingUp, TrendingDown, Minus, Eye } from 'lucide-react';
import { SystemAudit, RECOMMENDATION_LABELS } from '@/hooks/useSystemAudit';
import { cn } from '@/lib/utils';

interface AuditTimelineProps {
  audits: SystemAudit[];
  selectedAuditId?: string;
  onSelectAudit: (auditId: string) => void;
}

export function AuditTimeline({ audits, selectedAuditId, onSelectAudit }: AuditTimelineProps) {
  if (audits.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Auditorias</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma auditoria realizada ainda
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Histórico de Auditorias
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {audits.map((audit, index) => {
              const previousAudit = audits[index + 1];
              const scoreDiff = previousAudit 
                ? audit.overall_score - previousAudit.overall_score 
                : 0;
              
              const TrendIcon = scoreDiff > 0 ? TrendingUp : scoreDiff < 0 ? TrendingDown : Minus;
              const trendColor = scoreDiff > 0 ? 'text-green-500' : scoreDiff < 0 ? 'text-red-500' : 'text-muted-foreground';
              
              const recommendation = audit.recommendation 
                ? RECOMMENDATION_LABELS[audit.recommendation] 
                : null;

              const isSelected = audit.id === selectedAuditId;

              return (
                <div 
                  key={audit.id}
                  className={cn(
                    'relative border rounded-lg p-3 transition-all cursor-pointer hover:bg-accent/50',
                    isSelected && 'border-primary bg-accent/30'
                  )}
                  onClick={() => onSelectAudit(audit.id)}
                >
                  {/* Timeline connector */}
                  {index < audits.length - 1 && (
                    <div className="absolute left-6 top-full h-3 w-px bg-border" />
                  )}
                  
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold">{audit.overall_score}</span>
                        <span className="text-muted-foreground">/100</span>
                        {previousAudit && (
                          <div className={cn('flex items-center gap-0.5 text-xs', trendColor)}>
                            <TrendIcon className="h-3 w-3" />
                            <span>{scoreDiff > 0 ? '+' : ''}{scoreDiff}</span>
                          </div>
                        )}
                      </div>
                      
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(audit.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                      
                      {audit.final_sentence && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          "{audit.final_sentence}"
                        </p>
                      )}
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                      {recommendation && (
                        <Badge 
                          variant={
                            recommendation.color === 'success' ? 'default' :
                            recommendation.color === 'warning' ? 'secondary' :
                            recommendation.color === 'destructive' ? 'destructive' :
                            'outline'
                          }
                          className="text-xs whitespace-nowrap"
                        >
                          {recommendation.label}
                        </Badge>
                      )}
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAudit(audit.id);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Ver
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
