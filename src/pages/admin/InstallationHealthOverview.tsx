import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgentLifecycle, usePipelineMetrics, useFailureRate } from "@/hooks/useAgentLifecycle";
import { useTenant } from "@/hooks/useTenant";
import { useState, useMemo } from "react";
import { 
  TrendingUp, 
  CheckCircle, 
  AlertTriangle, 
  Activity,
  Clock,
  XCircle,
  RefreshCw,
  Download,
  Wifi,
  WifiOff,
  Package
} from "lucide-react";
import { formatBrazilDateTime } from "@/lib/date-utils";
import {
  FunnelChart,
  Funnel,
  LabelList,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import { ErrorState } from "@/components/ErrorState";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function InstallationHealthOverview() {
  const { tenant } = useTenant();
  const [hoursBack] = useState<number | null>(null);

  const { data: agents, isLoading: agentsLoading, isError: agentsError, error: agentsErrorData, refetch: refetchAgents } = useAgentLifecycle(tenant?.id);
  const { data: metrics, isLoading: metricsLoading, isError: metricsError, error: metricsErrorData, refetch: refetchMetrics } = usePipelineMetrics(tenant?.id, hoursBack);
  const { data: failureRate } = useFailureRate(tenant?.id, 1);

  // Calcular estado global
  const globalHealth = useMemo(() => {
    const successRate = metrics?.success_rate_pct || 0;
    const stuckCount = agents?.filter(a => a.flags?.is_stuck).length || 0;
    const errorCount = agents?.filter(a => a.flags?.has_errors).length || 0;
    const activeCount = metrics?.total_active || 0;

    if (successRate >= 90 && stuckCount === 0 && errorCount === 0) {
      return { status: 'healthy', emoji: '🟢', label: 'Instalações Funcionando Normalmente', sublabel: 'Todas as métricas estão saudáveis' };
    } else if (successRate >= 70 && stuckCount <= 2) {
      return { status: 'attention', emoji: '🟡', label: 'Algumas Instalações Precisam de Atenção', sublabel: 'Verifique os itens pendentes abaixo' };
    } else {
      return { status: 'critical', emoji: '🔴', label: 'Problemas Críticos em Instalações', sublabel: 'Ação imediata necessária' };
    }
  }, [metrics, agents]);

  // Problemas silenciosos
  const silentProblems = useMemo(() => {
    const problems = [];
    
    const stuckAgents = agents?.filter(a => a.flags?.is_stuck) || [];
    const errorAgents = agents?.filter(a => a.flags?.has_errors) || [];
    const offlineAgents = agents?.filter(a => {
      if (!a.metrics?.last_seen) return false;
      const lastSeen = new Date(a.metrics.last_seen);
      return (Date.now() - lastSeen.getTime()) > 48 * 60 * 60 * 1000;
    }) || [];

    if (stuckAgents.length > 0) {
      problems.push({
        icon: '⏳',
        text: `${stuckAgents.length} instalação(ões) travada(s) no pipeline há mais de 30 min`,
        severity: 'high',
        agents: stuckAgents.map(a => a.agent_name)
      });
    }

    if (errorAgents.length > 0) {
      problems.push({
        icon: '❌',
        text: `${errorAgents.length} instalação(ões) com erro`,
        severity: 'high',
        agents: errorAgents.map(a => a.agent_name)
      });
    }

    if (offlineAgents.length > 0) {
      problems.push({
        icon: '📴',
        text: `${offlineAgents.length} agente(s) offline há mais de 48h`,
        severity: 'medium',
        agents: offlineAgents.map(a => a.agent_name)
      });
    }

    return problems;
  }, [agents]);

  // Funnel data
  const funnelData = metrics ? [
    { name: 'Comandos Gerados', value: metrics.total_generated, fill: 'hsl(var(--primary))' },
    { name: 'Downloads', value: metrics.total_downloaded, fill: 'hsl(var(--accent))' },
    { name: 'Copiados', value: metrics.total_command_copied, fill: 'hsl(var(--warning))' },
    { name: 'Instalados', value: metrics.total_installed, fill: 'hsl(var(--success))' },
    { name: 'Ativos', value: metrics.total_active, fill: 'hsl(142.1 76.2% 36.3%)' },
  ] : [];

  const handleRefresh = () => {
    refetchAgents();
    refetchMetrics();
    toast.success("Dados atualizados");
  };

  if (agentsLoading || metricsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (agentsError || metricsError) {
    return (
      <ErrorState 
        error={agentsErrorData || metricsErrorData!} 
        onRetry={handleRefresh}
        title="Erro ao Carregar Dados de Instalação"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com Refresh */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Visão Geral do Pipeline</h2>
          <p className="text-sm text-muted-foreground">Histórico completo de instalações</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* ESTADO GLOBAL DOMINANTE */}
      <Card className={cn(
        "border-2 transition-all",
        globalHealth.status === 'healthy' ? "bg-success/5 border-success/30" :
        globalHealth.status === 'attention' ? "bg-warning/5 border-warning/30" :
        "bg-destructive/5 border-destructive/30"
      )}>
        <CardContent className="py-8 text-center">
          <div className="text-5xl mb-3">{globalHealth.emoji}</div>
          <h2 className="text-2xl font-bold">{globalHealth.label}</h2>
          <p className="text-muted-foreground mt-2">{globalHealth.sublabel}</p>
          <div className="flex justify-center gap-6 mt-4 text-sm">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              Taxa de sucesso: <strong>{metrics?.success_rate_pct || 0}%</strong>
            </span>
            <span className="flex items-center gap-1">
              <Activity className="w-4 h-4" />
              Ativos: <strong>{metrics?.total_active || 0}</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* MÉTRICAS PRINCIPAIS */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              Comandos Gerados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics?.total_generated || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Instaladores criados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" />
              Instalados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">{metrics?.total_installed || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Instalações concluídas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wifi className="h-4 w-4 text-success" />
              Ativos Agora
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics?.total_active || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Enviando heartbeats</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Tempo Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{Math.round(metrics?.avg_install_time_seconds || 0)}s</div>
            <p className="text-xs text-muted-foreground mt-1">Para instalar</p>
          </CardContent>
        </Card>
      </div>

      {/* ALERTA DE FALHA SE EXISTIR */}
      {failureRate && failureRate.exceeds_threshold && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              Alta Taxa de Falha na Última Hora
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm">
                  {failureRate.failed_attempts} de {failureRate.total_attempts} tentativas falharam
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBrazilDateTime(failureRate.period_start, 'time')} - {formatBrazilDateTime(failureRate.period_end, 'time')}
                </p>
              </div>
              <Badge variant="destructive" className="text-lg px-3 py-1">
                {failureRate.failure_rate_pct}% falha
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PROBLEMAS SILENCIOSOS */}
      {silentProblems.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              Problemas Silenciosos
            </CardTitle>
            <CardDescription>
              Situações que precisam de atenção mas não geram alarmes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {silentProblems.map((problem, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-card border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{problem.icon}</span>
                    <div>
                      <span className="font-medium">{problem.text}</span>
                      {problem.agents.length <= 3 && (
                        <p className="text-xs text-muted-foreground">
                          {problem.agents.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant={problem.severity === 'high' ? 'destructive' : 'secondary'}>
                    {problem.severity === 'high' ? 'Urgente' : 'Atenção'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* FUNIL DE CONVERSÃO */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Funil de Instalação
          </CardTitle>
          <CardDescription>
            Conversão de comandos gerados até agentes ativos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {funnelData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <FunnelChart>
                <Tooltip 
                  formatter={(value: number) => [value, 'Quantidade']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Funnel
                  dataKey="value"
                  data={funnelData}
                  isAnimationActive
                >
                  <LabelList 
                    position="right" 
                    fill="hsl(var(--foreground))" 
                    stroke="none" 
                    dataKey="name" 
                  />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">Nenhuma instalação ainda</p>
              <p className="text-sm">Gere seu primeiro comando de instalação na aba "Instalar Agentes"</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* TAXA DE CONVERSÃO */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Conversão: Gerado → Instalado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{metrics?.conversion_rate_generated_to_installed_pct || 0}%</span>
              <span className="text-sm text-muted-foreground">
                ({metrics?.total_installed || 0} de {metrics?.total_generated || 0})
              </span>
            </div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all"
                style={{ width: `${metrics?.conversion_rate_generated_to_installed_pct || 0}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Conversão: Copiado → Instalado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{metrics?.conversion_rate_copied_to_installed_pct || 0}%</span>
              <span className="text-sm text-muted-foreground">
                ({metrics?.total_installed || 0} de {metrics?.total_command_copied || 0})
              </span>
            </div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-success transition-all"
                style={{ width: `${metrics?.conversion_rate_copied_to_installed_pct || 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Frase Âncora */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground">
            💡 Os dados são atualizados automaticamente a cada 30 segundos.
            <br />
            <span className="text-primary font-medium">Clique em "Atualizar" para ver as últimas instalações.</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
