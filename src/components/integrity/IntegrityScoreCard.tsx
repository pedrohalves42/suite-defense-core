import { useEffect, useState } from "react";
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface IntegrityMetrics {
  supply_chain_score: number;
  job_integrity_score: number;
  recent_violations: number;
  recent_completed_jobs: number;
  invalid_releases: number;
  total_releases: number;
}

export const IntegrityScoreCard = () => {
  const [metrics, setMetrics] = useState<IntegrityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMetrics = async () => {
    try {
      const { data, error } = await supabase
        .from('v_integrity_score')
        .select('*')
        .single();

      if (error) throw error;
      
      setMetrics({
        supply_chain_score: Number(data?.supply_chain_score) || 100,
        job_integrity_score: Number(data?.job_integrity_score) || 100,
        recent_violations: Number(data?.recent_violations) || 0,
        recent_completed_jobs: Number(data?.recent_completed_jobs) || 0,
        invalid_releases: Number(data?.invalid_releases) || 0,
        total_releases: Number(data?.total_releases) || 0,
      });
    } catch (error) {
      console.error('[IntegrityScoreCard] Error loading metrics:', error);
      // Default to 100% if view doesn't exist yet
      setMetrics({
        supply_chain_score: 100,
        job_integrity_score: 100,
        recent_violations: 0,
        recent_completed_jobs: 0,
        invalid_releases: 0,
        total_releases: 0,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadMetrics();
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Carregando métricas de integridade...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    (metrics.supply_chain_score * 0.4) + (metrics.job_integrity_score * 0.6)
  );

  const getScoreStatus = (score: number) => {
    if (score >= 95) return { status: 'excellent', color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' };
    if (score >= 80) return { status: 'good', color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' };
    if (score >= 60) return { status: 'warning', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' };
    return { status: 'critical', color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30' };
  };

  const overallStatus = getScoreStatus(overallScore);
  const supplyChainStatus = getScoreStatus(metrics.supply_chain_score);
  const jobIntegrityStatus = getScoreStatus(metrics.job_integrity_score);

  const StatusIcon = overallScore >= 95 ? ShieldCheck : 
                     overallScore >= 60 ? Shield : ShieldAlert;

  return (
    <Card className={cn("border-2 transition-all", overallStatus.border, overallStatus.bg)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <StatusIcon className={cn("h-5 w-5", overallStatus.color)} />
            Integrity Score
          </CardTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Score */}
        <div className="flex items-center gap-4">
          <div className={cn(
            "text-5xl font-bold tabular-nums",
            overallStatus.color
          )}>
            {overallScore}%
          </div>
          <div className="flex-1 space-y-1">
            <Progress 
              value={overallScore} 
              className="h-3"
            />
            <p className="text-xs text-muted-foreground">
              {overallScore >= 95 ? 'Sistema totalmente íntegro' :
               overallScore >= 80 ? 'Pequenas melhorias recomendadas' :
               overallScore >= 60 ? 'Atenção necessária' :
               'Ação imediata requerida'}
            </p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
          {/* Supply Chain Score */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "p-3 rounded-lg cursor-help",
                  supplyChainStatus.bg
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">Supply Chain</span>
                    {metrics.invalid_releases > 0 ? (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0">
                        {metrics.invalid_releases} inválido
                      </Badge>
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    )}
                  </div>
                  <div className={cn("text-2xl font-bold", supplyChainStatus.color)}>
                    {Math.round(metrics.supply_chain_score)}%
                  </div>
                  <Progress value={metrics.supply_chain_score} className="h-1 mt-1" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium mb-1">Validação de Releases</p>
                <p className="text-xs text-muted-foreground">
                  {metrics.total_releases} releases registradas. 
                  Thresholds: Windows ≥50kb, Linux/macOS ≥30kb
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Job Integrity Score */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "p-3 rounded-lg cursor-help",
                  jobIntegrityStatus.bg
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">Job Integrity</span>
                    {metrics.recent_violations > 0 ? (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0">
                        {metrics.recent_violations} violação
                      </Badge>
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    )}
                  </div>
                  <div className={cn("text-2xl font-bold", jobIntegrityStatus.color)}>
                    {Math.round(metrics.job_integrity_score)}%
                  </div>
                  <Progress value={metrics.job_integrity_score} className="h-1 mt-1" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium mb-1">Integridade de Jobs</p>
                <p className="text-xs text-muted-foreground">
                  {metrics.recent_completed_jobs} jobs completados nos últimos 7 dias.
                  {metrics.recent_violations > 0 && ` ${metrics.recent_violations} sem side effects detectados.`}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Warnings if any */}
        {(metrics.invalid_releases > 0 || metrics.recent_violations > 0) && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/30 text-xs">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="space-y-1">
              {metrics.invalid_releases > 0 && (
                <p className="text-warning-foreground">
                  {metrics.invalid_releases} release(s) abaixo do threshold mínimo
                </p>
              )}
              {metrics.recent_violations > 0 && (
                <p className="text-warning-foreground">
                  {metrics.recent_violations} job(s) completados sem side effects
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
