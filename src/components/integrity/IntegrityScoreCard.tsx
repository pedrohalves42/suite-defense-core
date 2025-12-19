import { useEffect, useState } from "react";
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
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
  failed_jobs_score: number;
  global_integrity_score: number;
  active_releases: number;
  valid_active_releases: number;
  completed_jobs: number;
  valid_completed_jobs: number;
  failed_jobs: number;
  failed_with_error: number;
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
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setMetrics({
          supply_chain_score: Number(data.supply_chain_score) || 100,
          job_integrity_score: Number(data.job_integrity_score) || 100,
          failed_jobs_score: Number(data.failed_jobs_score) || 100,
          global_integrity_score: Number(data.global_integrity_score) || 100,
          active_releases: Number(data.active_releases) || 0,
          valid_active_releases: Number(data.valid_active_releases) || 0,
          completed_jobs: Number(data.completed_jobs) || 0,
          valid_completed_jobs: Number(data.valid_completed_jobs) || 0,
          failed_jobs: Number(data.failed_jobs) || 0,
          failed_with_error: Number(data.failed_with_error) || 0,
        });
      } else {
        // Default values if no data
        setMetrics({
          supply_chain_score: 100,
          job_integrity_score: 100,
          failed_jobs_score: 100,
          global_integrity_score: 100,
          active_releases: 0,
          valid_active_releases: 0,
          completed_jobs: 0,
          valid_completed_jobs: 0,
          failed_jobs: 0,
          failed_with_error: 0,
        });
      }
    } catch (error) {
      console.error('[IntegrityScoreCard] Error loading metrics:', error);
      setMetrics({
        supply_chain_score: 100,
        job_integrity_score: 100,
        failed_jobs_score: 100,
        global_integrity_score: 100,
        active_releases: 0,
        valid_active_releases: 0,
        completed_jobs: 0,
        valid_completed_jobs: 0,
        failed_jobs: 0,
        failed_with_error: 0,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 60000);
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

  const overallScore = Math.round(metrics.global_integrity_score);
  const invalidReleases = metrics.active_releases - metrics.valid_active_releases;
  const jobViolations = metrics.completed_jobs - metrics.valid_completed_jobs;
  const failedWithoutError = metrics.failed_jobs - metrics.failed_with_error;

  const getScoreStatus = (score: number) => {
    if (score >= 95) return { status: 'excellent', color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' };
    if (score >= 80) return { status: 'good', color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' };
    if (score >= 60) return { status: 'warning', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' };
    return { status: 'critical', color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30' };
  };

  const overallStatus = getScoreStatus(overallScore);
  const supplyChainStatus = getScoreStatus(metrics.supply_chain_score);
  const jobIntegrityStatus = getScoreStatus(metrics.job_integrity_score);
  const failedJobsStatus = getScoreStatus(metrics.failed_jobs_score);

  const StatusIcon = overallScore >= 95 ? ShieldCheck : 
                     overallScore >= 60 ? Shield : ShieldAlert;

  return (
    <Card className={cn("border-2 transition-all", overallStatus.border, overallStatus.bg)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <StatusIcon className={cn("h-5 w-5", overallStatus.color)} />
            Zero Trust Score
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={overallScore === 100 ? "default" : "secondary"} className="text-xs">
              {overallScore === 100 ? '100% COMPLIANT' : 'PARTIAL'}
            </Badge>
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
              {overallScore === 100 ? 'Sistema 100% Zero Trust - Nenhuma falha silenciosa possível' :
               overallScore >= 80 ? 'Pequenas melhorias recomendadas' :
               overallScore >= 60 ? 'Atenção necessária' :
               'Ação imediata requerida'}
            </p>
          </div>
        </div>

        {/* Breakdown - 3 columns now */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
          {/* Supply Chain Score */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "p-2 rounded-lg cursor-help",
                  supplyChainStatus.bg
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-muted-foreground">Supply Chain</span>
                    {invalidReleases > 0 ? (
                      <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                        {invalidReleases}
                      </Badge>
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-success" />
                    )}
                  </div>
                  <div className={cn("text-xl font-bold", supplyChainStatus.color)}>
                    {Math.round(metrics.supply_chain_score)}%
                  </div>
                  <Progress value={metrics.supply_chain_score} className="h-1 mt-1" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium mb-1">Validação de Releases</p>
                <p className="text-xs text-muted-foreground">
                  {metrics.valid_active_releases}/{metrics.active_releases} releases válidas.
                  Thresholds: Windows ≥50kb, Linux/macOS ≥30kb + SHA256
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Job Integrity Score */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "p-2 rounded-lg cursor-help",
                  jobIntegrityStatus.bg
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-muted-foreground">Completed</span>
                    {jobViolations > 0 ? (
                      <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                        {jobViolations}
                      </Badge>
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-success" />
                    )}
                  </div>
                  <div className={cn("text-xl font-bold", jobIntegrityStatus.color)}>
                    {Math.round(metrics.job_integrity_score)}%
                  </div>
                  <Progress value={metrics.job_integrity_score} className="h-1 mt-1" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium mb-1">Jobs Completed com Side Effects</p>
                <p className="text-xs text-muted-foreground">
                  {metrics.valid_completed_jobs}/{metrics.completed_jobs} jobs geraram dados.
                  Trigger impede completed sem side effects.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Failed Jobs Score */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "p-2 rounded-lg cursor-help",
                  failedJobsStatus.bg
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-muted-foreground">Failed</span>
                    {failedWithoutError > 0 ? (
                      <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                        {failedWithoutError}
                      </Badge>
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-success" />
                    )}
                  </div>
                  <div className={cn("text-xl font-bold", failedJobsStatus.color)}>
                    {Math.round(metrics.failed_jobs_score)}%
                  </div>
                  <Progress value={metrics.failed_jobs_score} className="h-1 mt-1" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium mb-1">Jobs Failed com Error Message</p>
                <p className="text-xs text-muted-foreground">
                  {metrics.failed_with_error}/{metrics.failed_jobs} jobs failed têm explicação.
                  Trigger impede failed sem error_message.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Warnings if any */}
        {(invalidReleases > 0 || jobViolations > 0 || failedWithoutError > 0) && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/30 text-xs">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="space-y-1">
              {invalidReleases > 0 && (
                <p className="text-warning-foreground">
                  {invalidReleases} release(s) abaixo do threshold mínimo
                </p>
              )}
              {jobViolations > 0 && (
                <p className="text-warning-foreground">
                  {jobViolations} job(s) completed sem side effects
                </p>
              )}
              {failedWithoutError > 0 && (
                <p className="text-warning-foreground">
                  {failedWithoutError} job(s) failed sem error_message
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};