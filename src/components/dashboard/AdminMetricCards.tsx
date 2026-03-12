import { Key, ShieldAlert, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IntegrityScoreCard } from "@/components/integrity/IntegrityScoreCard";
import { JobWasteCard } from "@/components/dashboard/JobWasteCard";
import { useNavigate } from "react-router-dom";
import type { DashboardAgent, DashboardJob, DashboardAgentToken, DashboardRateLimit } from "@/hooks/useDashboardData";

interface AdminMetricCardsProps {
  agents: DashboardAgent[];
  jobs: DashboardJob[];
  agentTokens: DashboardAgentToken[];
  rateLimits: DashboardRateLimit[];
}

export function AdminMetricCards({ agents, jobs, agentTokens, rateLimits }: AdminMetricCardsProps) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <IntegrityScoreCard />
      <JobWasteCard jobs={jobs} agents={agents} />
      
      <Card className="bg-gradient-card border-primary/20 cursor-pointer hover:border-primary/40 transition-all group" onClick={() => navigate('/admin/members')}>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              Credenciais
            </span>
            <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">
            {agentTokens.filter(t => t.is_active).length || agents.length} ativas
          </div>
          <p className="text-xs text-success mt-1">✓ Acessos autorizados</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-card border-primary/20 cursor-pointer hover:border-primary/40 transition-all group" onClick={() => navigate('/admin/rate-limiting')}>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Proteção
            </span>
            <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">
            {rateLimits.filter(r => r.blocked_until && new Date(r.blocked_until) > new Date()).length} bloqueados
          </div>
          <p className="text-xs text-success mt-1">✓ Rate limiting ativo</p>
        </CardContent>
      </Card>
    </div>
  );
}
