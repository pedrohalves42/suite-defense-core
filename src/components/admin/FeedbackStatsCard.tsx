import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Brain, ThumbsUp, ThumbsDown, Flag, TrendingUp } from 'lucide-react';
import { useFeedbackStats } from '@/hooks/useInsightFeedback';
import { Skeleton } from '@/components/ui/skeleton';

export function FeedbackStatsCard() {
  const { data: stats, isLoading } = useFeedbackStats();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <Skeleton className="h-4 w-32" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            Qualidade dos Insights IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum feedback registrado ainda</p>
            <p className="text-xs">Avalie os insights para melhorar a IA</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const usefulPercent = Math.round((stats.useful / stats.total) * 100);
  const noisePercent = Math.round((stats.noise / stats.total) * 100);
  const falsePositivePercent = Math.round((stats.false_positive / stats.total) * 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Qualidade dos Insights IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main metric */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-bold text-green-600">{usefulPercent}%</span>
            <p className="text-xs text-muted-foreground">Taxa de utilidade</p>
          </div>
          <div className="flex items-center gap-1 text-green-600">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm font-medium">{stats.useful}/{stats.total}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <Progress 
            value={usefulPercent} 
            className="h-2"
          />
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-1 text-green-600">
              <ThumbsUp className="h-3 w-3" />
              <span>{stats.useful} úteis</span>
            </div>
            <div className="flex items-center gap-1 text-orange-600">
              <ThumbsDown className="h-3 w-3" />
              <span>{stats.noise} ruído</span>
            </div>
            <div className="flex items-center gap-1 text-red-600">
              <Flag className="h-3 w-3" />
              <span>{stats.false_positive} falso+</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
