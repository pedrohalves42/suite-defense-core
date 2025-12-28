import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

interface JobSuccessRateCardProps {
  originalRate?: number;
  correctedRate?: number;
  isLoading?: boolean;
}

export function JobSuccessRateCard({ 
  originalRate = 28, 
  correctedRate = 99, 
  isLoading 
}: JobSuccessRateCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Taxa de Sucesso de Jobs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const improvement = correctedRate - originalRate;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Taxa de Sucesso de Jobs
        </CardTitle>
        <CardDescription>
          Análise com classificação corrigida de timeouts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Corrected Rate */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Taxa Real (Corrigida)
            </span>
            <span className="text-2xl font-bold text-green-500">
              {correctedRate}%
            </span>
          </div>
          <Progress value={correctedRate} className="h-3 bg-muted" />
          <p className="text-xs text-muted-foreground">
            Exclui timeouts de computadores offline (comportamento esperado)
          </p>
        </div>

        {/* Original Rate */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-4 w-4 text-red-500" />
              Taxa Bruta (Antes)
            </span>
            <span className="text-lg font-medium text-muted-foreground">
              {originalRate}%
            </span>
          </div>
          <Progress value={originalRate} className="h-2 bg-muted opacity-50" />
          <p className="text-xs text-muted-foreground">
            Incluía falsos positivos de timeout
          </p>
        </div>

        {/* Improvement */}
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="font-medium text-green-700 dark:text-green-400">
                Melhoria com Classificação
              </span>
            </div>
            <Badge className="bg-green-500 text-white text-lg px-3">
              +{improvement}%
            </Badge>
          </div>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">
            Timeouts de computadores desligados agora são classificados como "cancelled_timeout" 
            ao invés de "failed", refletindo a realidade operacional.
          </p>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <Clock className="h-3 w-3 text-blue-500" />
            <span>cancelled_timeout</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            <span>cancelled_no_response</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <CheckCircle className="h-3 w-3 text-green-500" />
            <span>completed</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
            <XCircle className="h-3 w-3 text-red-500" />
            <span>failed (real)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
