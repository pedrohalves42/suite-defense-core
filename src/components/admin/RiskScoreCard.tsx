import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, RefreshCw, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRiskScore } from '@/hooks/useRiskScore';

export function RiskScoreCard() {
  const { 
    riskScore, 
    isLoading, 
    recalculate, 
    isRecalculating,
    getScoreColor,
    getScoreStatus,
    getTrendInfo,
  } = useRiskScore();

  if (isLoading) {
    return (
      <Card className="border-2">
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If no score exists yet, show prompt to calculate
  if (!riskScore) {
    return (
      <Card className="border-2 border-dashed border-muted-foreground/30">
        <CardContent className="py-6 text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Risk Score não calculado</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Calcule o nível de risco da sua empresa com base em todos os fatores de segurança.
          </p>
          <Button onClick={() => recalculate()} disabled={isRecalculating}>
            {isRecalculating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Calculando...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                Calcular Risk Score
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const score = riskScore.score;
  const status = getScoreStatus(score);
  const trendInfo = getTrendInfo(riskScore.trend);

  const TrendIcon = riskScore.trend === 'up' ? TrendingUp : riskScore.trend === 'down' ? TrendingDown : Minus;

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cn(
        "border-2 transition-colors",
        status.variant === 'success' && "bg-green-500/10 border-green-500/30",
        status.variant === 'warning' && "bg-yellow-500/10 border-yellow-500/30",
        status.variant === 'danger' && "bg-red-500/10 border-red-500/30"
      )}>
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            {/* Left: Score Display */}
            <div className="flex items-center gap-4">
              {/* Circular Score Gauge */}
              <div className="relative">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 100 100">
                  {/* Background circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-muted/20"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${score * 2.51} 251`}
                    className={cn(
                      score >= 80 && "text-green-500",
                      score >= 60 && score < 80 && "text-yellow-500",
                      score < 60 && "text-red-500"
                    )}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={cn("text-2xl font-bold", getScoreColor(score))}>
                    {score}
                  </span>
                </div>
              </div>

              {/* Score Info */}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className={cn(
                    "text-lg font-bold",
                    status.variant === 'success' && "text-green-600 dark:text-green-400",
                    status.variant === 'warning' && "text-yellow-600 dark:text-yellow-400",
                    status.variant === 'danger' && "text-red-600 dark:text-red-400"
                  )}>
                    {status.label}
                  </h2>
                  {riskScore.trend && (
                    <span className={cn("flex items-center gap-1 text-sm", trendInfo.color)}>
                      <TrendIcon className="h-4 w-4" />
                      {trendInfo.label}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Esse score resume a saúde de segurança da sua empresa
                </p>
                {riskScore.previous_score !== null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Score anterior: {riskScore.previous_score}/100
                  </p>
                )}
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => recalculate()}
                disabled={isRecalculating}
              >
                <RefreshCw className={cn("h-4 w-4", isRecalculating && "animate-spin")} />
              </Button>
              <Link to="/admin/risk-score">
                <Button variant="outline" size="sm">
                  Ver detalhes
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
