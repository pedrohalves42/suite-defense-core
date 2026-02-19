import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, TrendingDown, Zap } from "lucide-react";

interface Job {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  created_at: string;
  error_message?: string | null;
  failure_class?: string | null;
}

interface Agent {
  id: string;
  agent_name: string;
  last_heartbeat: string | null;
}

interface JobWasteCardProps {
  jobs: Job[];
  agents: Agent[];
}

/**
 * Dashboard widget showing wasted jobs:
 * - Jobs sent to offline agents (AGENT_STALLED)
 * - Jobs expired before delivery (EXPIRED)
 * - Downgrade attempts
 */
export function JobWasteCard({ jobs, agents }: JobWasteCardProps) {
  const wasteMetrics = useMemo(() => {
    const now = new Date();
    const last24h = 24 * 60 * 60 * 1000;

    const recentFailed = jobs.filter(
      (j) =>
        j.status === "failed" &&
        j.created_at &&
        now.getTime() - new Date(j.created_at).getTime() < last24h
    );

    const stalled = recentFailed.filter(
      (j) =>
        j.error_message?.includes("AGENT_STALLED") ||
        j.error_message?.includes("CLEANUP")
    );

    const expired = recentFailed.filter(
      (j) =>
        j.error_message?.includes("EXPIRED") ||
        j.error_message?.includes("TTL")
    );

    const downgrade = recentFailed.filter(
      (j) =>
        j.error_message?.includes("Downgrade") ||
        j.error_message?.includes("Unknown job type")
    );

    const totalWasted = stalled.length + expired.length + downgrade.length;
    const totalJobs = jobs.filter(
      (j) => j.created_at && now.getTime() - new Date(j.created_at).getTime() < last24h
    ).length;

    const wasteRate =
      totalJobs > 0 ? ((totalWasted / totalJobs) * 100).toFixed(1) : "0";

    // Top wasted agents
    const agentWaste: Record<string, number> = {};
    [...stalled, ...expired, ...downgrade].forEach((j) => {
      agentWaste[j.agent_name] = (agentWaste[j.agent_name] || 0) + 1;
    });

    const topWastedAgents = Object.entries(agentWaste)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    return {
      stalled: stalled.length,
      expired: expired.length,
      downgrade: downgrade.length,
      totalWasted,
      wasteRate,
      topWastedAgents,
    };
  }, [jobs]);

  const severity =
    wasteMetrics.totalWasted > 20
      ? "destructive"
      : wasteMetrics.totalWasted > 5
        ? "warning"
        : "secondary";

  const severityColor =
    severity === "destructive"
      ? "text-destructive"
      : severity === "warning"
        ? "text-accent-foreground"
        : "text-muted-foreground";

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium flex items-center justify-between text-muted-foreground">
          <span className="flex items-center gap-2">
            <TrendingDown className={`h-4 w-4 ${severityColor}`} />
            Job Waste (24h)
          </span>
          <Badge variant={severity === "destructive" ? "destructive" : "outline"} className="text-[10px]">
            {wasteMetrics.wasteRate}% desperdício
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Breakdown */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-md bg-muted/50 p-2">
                  <div className="text-lg font-bold text-foreground">{wasteMetrics.stalled}</div>
                  <div className="text-[10px] text-muted-foreground">Stalled</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Jobs entregues mas agente não respondeu</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-md bg-muted/50 p-2">
                  <div className="text-lg font-bold text-foreground">{wasteMetrics.expired}</div>
                  <div className="text-[10px] text-muted-foreground">Expirados</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Jobs que expiraram antes do agente buscar</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-md bg-muted/50 p-2">
                  <div className="text-lg font-bold text-foreground">{wasteMetrics.downgrade}</div>
                  <div className="text-[10px] text-muted-foreground">Rejeitados</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Jobs rejeitados pelo agente (tipo desconhecido ou downgrade)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Top wasted agents */}
        {wasteMetrics.topWastedAgents.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Maiores desperdícios
            </div>
            {wasteMetrics.topWastedAgents.map(([name, count]) => (
              <div
                key={name}
                className="flex items-center justify-between text-xs px-2 py-1 rounded bg-muted/30"
              >
                <span className="text-foreground truncate max-w-[140px]">{name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {count} jobs
                </Badge>
              </div>
            ))}
          </div>
        )}

        {wasteMetrics.totalWasted === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center py-2">
            <Zap className="h-4 w-4 text-primary" />
            Zero desperdício — eficiência máxima
          </div>
        )}
      </CardContent>
    </Card>
  );
}
