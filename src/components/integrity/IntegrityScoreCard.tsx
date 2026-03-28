import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, AlertTriangle, RefreshCw, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { logger } from '@/lib/logger';

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
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  const loadMetrics = async () => {
    try {
      const { data, error } = await supabase
        .from('v_integrity_score')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        // Cast to unknown first since the view schema has been updated
        const record = data as unknown as any;
        setMetrics({
          supply_chain_score: Number(record.supply_chain_score) || 100,
          job_integrity_score: Number(record.job_integrity_score) || 100,
          failed_jobs_score: Number(record.failed_jobs_score) || 100,
          global_integrity_score: Number(record.global_integrity_score) || 100,
          active_releases: Number(record.active_releases) || 0,
          valid_active_releases: Number(record.valid_active_releases) || 0,
          completed_jobs: Number(record.completed_jobs) || 0,
          valid_completed_jobs: Number(record.valid_completed_jobs) || 0,
          failed_jobs: Number(record.failed_jobs) || 0,
          failed_with_error: Number(record.failed_with_error) || 0,
        });
      } else {
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
      setLastChecked(new Date());
    } catch (error) {
      logger.error('[IntegrityScoreCard] Error loading metrics:', error);
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
    const interval = setInterval(loadMetrics, 300_000); // COST-OPT: 60s → 5min
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadMetrics();
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Verificando integridade...
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
  const hasIssues = invalidReleases > 0 || jobViolations > 0 || failedWithoutError > 0;

  // Determine status and message
  const getStatusConfig = () => {
    if (overallScore >= 95) {
      return {
        icon: ShieldCheck,
        title: 'Sistema íntegro',
        message: 'Todos os programas são originais e as verificações funcionam corretamente.',
        color: 'text-success',
        bg: 'bg-success/10',
        border: 'border-success/30'
      };
    }
    if (overallScore >= 80) {
      return {
        icon: ShieldCheck,
        title: 'Sistema em bom estado',
        message: 'Pequenas melhorias recomendadas, mas tudo funciona corretamente.',
        color: 'text-primary',
        bg: 'bg-primary/10',
        border: 'border-primary/30'
      };
    }
    if (overallScore >= 60) {
      return {
        icon: ShieldAlert,
        title: 'Atenção necessária',
        message: 'Alguns pontos precisam de verificação para garantir a integridade.',
        color: 'text-warning',
        bg: 'bg-warning/10',
        border: 'border-warning/30'
      };
    }
    return {
      icon: ShieldAlert,
      title: 'Ação requerida',
      message: 'Problemas detectados que precisam de atenção imediata.',
      color: 'text-destructive',
      bg: 'bg-destructive/10',
      border: 'border-destructive/30'
    };
  };

  const status = getStatusConfig();
  const StatusIcon = status.icon;

  const timeAgo = () => {
    const diff = Math.floor((new Date().getTime() - lastChecked.getTime()) / 1000);
    if (diff < 60) return 'agora';
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    return `há ${Math.floor(diff / 3600)}h`;
  };

  return (
    <Card className={cn("border-2 transition-all", status.border, status.bg)}>
      <CardContent className="py-5">
        <div className="flex items-start gap-4">
          <div className={cn("p-2.5 rounded-lg", status.bg)}>
            <StatusIcon className={cn("h-6 w-6", status.color)} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground">{status.title}</h3>
              <div className="flex items-center gap-1.5">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleRefresh}
                        disabled={refreshing}
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Atualizar verificação</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">O que isso significa?</p>
                      <p className="text-xs text-muted-foreground">
                        Verifica se os programas são originais, se as tarefas estão sendo executadas 
                        corretamente e se erros estão sendo documentados.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mt-1">
              {status.message}
            </p>
            
            <p className="text-xs text-muted-foreground/70 mt-2">
              Verificado {timeAgo()}
            </p>
          </div>
        </div>

        {/* Warnings - only show if there are issues */}
        {hasIssues && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/30 text-xs">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                {invalidReleases > 0 && (
                  <p className="text-foreground">
                    {invalidReleases} programa(s) precisam de verificação de origem
                  </p>
                )}
                {jobViolations > 0 && (
                  <p className="text-foreground">
                    {jobViolations} tarefa(s) concluídas sem gerar resultado
                  </p>
                )}
                {failedWithoutError > 0 && (
                  <p className="text-foreground">
                    {failedWithoutError} erro(s) sem explicação documentada
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
