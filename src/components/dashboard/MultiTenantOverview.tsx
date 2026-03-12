import { Briefcase, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TenantEntry {
  tenantId: string;
  name: string;
  agentCount: number;
  offlineCount: number;
  failedJobsCount: number;
  severity: 'critical' | 'warning' | 'healthy';
}

interface MultiTenantOverviewProps {
  tenants: TenantEntry[];
  agentsByTenant: Record<string, number>;
}

export function MultiTenantOverview({ tenants, agentsByTenant }: MultiTenantOverviewProps) {
  return (
    <Card className="bg-gradient-card border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          Visão Multi-Empresa
        </CardTitle>
        <CardDescription>
          {Object.keys(agentsByTenant).length} empresas • Ordenado por prioridade de atenção
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tenants.map(({ tenantId, name, agentCount, offlineCount, failedJobsCount, severity }) => (
            <div key={tenantId} className={cn(
              "p-4 rounded-lg border transition-all hover:shadow-md",
              severity === 'critical' ? "bg-destructive/10 border-destructive/30" :
              severity === 'warning' ? "bg-warning/10 border-warning/30" :
              "bg-success/10 border-success/30"
            )}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-foreground truncate">{name}</p>
                <Badge 
                  variant={severity === 'critical' ? 'destructive' : severity === 'warning' ? 'outline' : 'default'}
                  className={cn("text-xs", severity === 'healthy' && "bg-success text-success-foreground")}
                >
                  {severity === 'critical' ? '🔴 Atenção' : severity === 'warning' ? '🟡 Atenção leve' : '🟢 Ok'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{agentCount} computador{agentCount !== 1 ? 'es' : ''}</p>
              
              {(offlineCount > 0 || failedJobsCount > 0) && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {offlineCount > 0 && (
                    <p className="text-xs text-warning flex items-center gap-1">
                      <XCircle className="h-3 w-3" />{offlineCount} offline
                    </p>
                  )}
                  {failedJobsCount > 0 && (
                    <p className="text-xs text-orange-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />{failedJobsCount} erro{failedJobsCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )}
              
              {severity === 'healthy' && (
                <p className="mt-3 text-xs text-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />Funcionando normalmente
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
