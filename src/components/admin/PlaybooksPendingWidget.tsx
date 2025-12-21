import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ArrowRight, Bell, CheckCircle2 } from 'lucide-react';
import { usePendingPlaybookExecutions } from '@/hooks/usePlaybooks';
import { PlaybookRecommendation } from './PlaybookRecommendation';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface PlaybooksPendingWidgetProps {
  className?: string;
  maxItems?: number;
  compact?: boolean;
}

export function PlaybooksPendingWidget({ 
  className, 
  maxItems = 3,
  compact = false,
}: PlaybooksPendingWidgetProps) {
  const { data: executions, isLoading, refetch } = usePendingPlaybookExecutions();

  const pendingCount = executions?.length || 0;
  const displayExecutions = executions?.slice(0, maxItems) || [];
  const hasMore = pendingCount > maxItems;

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pendingCount === 0) {
    return (
      <Card className={cn('border-dashed', className)}>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="rounded-full bg-green-500/10 p-3 mb-3">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
          </div>
          <p className="text-sm font-medium">Nenhuma ação pendente</p>
          <p className="text-xs text-muted-foreground mt-1">
            Todas as recomendações foram processadas
          </p>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className={cn('border-orange-500/30 bg-orange-500/5', className)}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-orange-500/20 p-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {pendingCount} {pendingCount === 1 ? 'ação recomendada' : 'ações recomendadas'}
              </p>
              <p className="text-xs text-muted-foreground">
                Aguardando sua decisão
              </p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link to="/admin/playbooks">
              Ver todas
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Respostas Recomendadas</CardTitle>
            <Badge variant="destructive" className="ml-2">
              {pendingCount}
            </Badge>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/playbooks">
              Ver todas
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
        <CardDescription>
          Ações de segurança sugeridas pelo sistema
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-4">
            {displayExecutions.map((execution) => (
              <PlaybookRecommendation
                key={execution.id}
                execution={execution}
                onExecuted={() => refetch()}
              />
            ))}
          </div>
        </ScrollArea>
        
        {hasMore && (
          <div className="mt-4 pt-4 border-t text-center">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/playbooks">
                Ver mais {pendingCount - maxItems} recomendações
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
