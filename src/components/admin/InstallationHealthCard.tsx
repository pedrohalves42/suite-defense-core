import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { logger } from '@/lib/logger';

type HealthRow = {
  os_type: "windows" | "linux" | "macos" | string;
  total_events: number;
  successful_events: number;
  failed_events: number;
  success_rate: number;
  window_interval: string;
};

type HealthStatus = {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
};

export function InstallationHealthCard() {
  const [data, setData] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: result, error: fetchError } = await (supabase
        .rpc('installation_health_summary') as unknown as Promise<{ 
          data: HealthRow[] | null; 
          error: { message: string } | null 
        }>);

      if (fetchError) {
        logger.error('[InstallationHealthCard] Error fetching health:', fetchError);
        setError(fetchError.message);
        toast.error('Erro ao carregar metricas de instalacao', {
          description: fetchError.message
        });
      } else {
        setData(result || []);
        setLastUpdate(new Date());
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
      logger.error('[InstallationHealthCard] Exception:', err);
      setError(errorMsg);
      toast.error('Erro ao carregar metricas', { description: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();

    // Auto-refresh a cada 5min (COST-OPT: 60s → 5min)
    const interval = setInterval(() => {
      fetchHealth();
    }, 300_000);

    return () => clearInterval(interval);
  }, []);

  const getStatus = (successRate: number): HealthStatus => {
    if (successRate >= 95) {
      return {
        label: "Healthy",
        color: "bg-emerald-500",
        bgColor: "bg-emerald-50",
        textColor: "text-emerald-700"
      };
    }
    if (successRate >= 80) {
      return {
        label: "Warning",
        color: "bg-amber-500",
        bgColor: "bg-amber-50",
        textColor: "text-amber-700"
      };
    }
    return {
      label: "Critical",
      color: "bg-red-500",
      bgColor: "bg-red-50",
      textColor: "text-red-700"
    };
  };

  const macosRow = data.find((row) => row.os_type === "macos");
  const windowsRow = data.find((row) => row.os_type === "windows");
  const linuxRow = data.find((row) => row.os_type === "linux");

  // Calcular taxa global
  const totalEvents = data.reduce((sum, row) => sum + row.total_events, 0);
  const totalSuccessful = data.reduce((sum, row) => sum + row.successful_events, 0);
  const globalSuccessRate = totalEvents > 0 
    ? Math.round((totalSuccessful / totalEvents) * 100 * 10) / 10
    : 0;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              Status das Instalações
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Taxa de sucesso de instalações por sistema operacional (histórico completo)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Histórico Completo • Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          
          {loading && (
            <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>Erro ao carregar dados: {error}</span>
            </div>
          </div>
        )}

        {/* Global Stats */}
        {!loading && totalEvents > 0 && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Taxa de Sucesso</span>
              <Badge variant="outline" className="text-xs">
                {totalEvents} instalacoes
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-foreground">{globalSuccessRate}%</span>
              <Badge className={getStatus(globalSuccessRate).color}>
                {getStatus(globalSuccessRate).label === 'Healthy' ? 'Saudavel' : 
                 getStatus(globalSuccessRate).label === 'Warning' ? 'Atencao' : 'Critico'}
              </Badge>
            </div>
          </div>
        )}

        {/* OS Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <OsCard
            label="macOS"
            emoji="🍎"
            row={macosRow}
            highlight
            getStatus={getStatus}
          />
          <OsCard
            label="Windows"
            emoji="🪟"
            row={windowsRow}
            getStatus={getStatus}
          />
          <OsCard
            label="Linux"
            emoji="🐧"
            row={linuxRow}
            getStatus={getStatus}
          />
        </div>

        {!loading && totalEvents === 0 && !error && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Nenhuma instalação registrada ainda. Instale seu primeiro agente para ver as métricas.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type OsCardProps = {
  label: string;
  emoji: string;
  row?: HealthRow;
  highlight?: boolean;
  getStatus: (s: number) => HealthStatus;
};

function OsCard({ label, emoji, row, highlight, getStatus }: OsCardProps) {
  const successRate = row?.success_rate ?? 0;
  const total = row?.total_events ?? 0;
  const successful = row?.successful_events ?? 0;
  const failed = row?.failed_events ?? 0;
  const status = getStatus(successRate);
  const statusLabel = status.label === 'Healthy' ? 'Saudavel' : 
                      status.label === 'Warning' ? 'Atencao' : 'Critico';

  const hasData = total > 0;

  return (
    <div
      className={`
        flex flex-col rounded-lg border p-3 transition-all
        ${highlight && hasData
          ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm'
          : 'border-border bg-card'
        }
        ${!hasData ? 'opacity-60' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <span className="font-medium text-sm text-foreground">{label}</span>
        </div>
        {hasData && (
          <Badge className={`${status.color} text-white text-[10px] px-2 py-0.5`}>
            {statusLabel}
          </Badge>
        )}
      </div>

      {hasData ? (
        <>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-2xl font-bold text-foreground">
              {successRate.toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">sucesso</span>
          </div>

          <div className="flex justify-between text-[11px] text-muted-foreground">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <span className="cursor-help">Total: {total}</span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">✅ {successful} sucesso • ❌ {failed} falhas</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {failed > 0 && (
              <span className="text-destructive font-medium">
                Falhas: {failed}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${status.color}`}
              style={{ width: `${successRate}%` }}
            />
          </div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground py-4 text-center">
          Sem dados
        </div>
      )}
    </div>
  );
}
