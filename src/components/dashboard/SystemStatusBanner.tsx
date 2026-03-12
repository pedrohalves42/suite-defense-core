import { CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface SystemStatusBannerProps {
  systemState: 'healthy' | 'warning' | 'critical';
  onlinePercentage: string;
  offlineCount: number;
  failedJobs: number;
  tenantsWithIssues: number;
  totalAgents: number;
  totalTenants: number;
}

export function SystemStatusBanner({
  systemState, onlinePercentage, offlineCount, failedJobs,
  tenantsWithIssues, totalAgents, totalTenants,
}: SystemStatusBannerProps) {
  const navigate = useNavigate();

  return (
    <Card className={cn(
      "border-2 transition-all",
      systemState === 'healthy' ? "bg-success/5 border-success/30" :
      systemState === 'critical' ? "bg-destructive/5 border-destructive/30" :
      "bg-warning/5 border-warning/30"
    )}>
      <CardContent className="py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-3">
              <span className="text-5xl">
                {systemState === 'healthy' ? '🟢' : systemState === 'critical' ? '🔴' : '🟡'}
              </span>
              <div>
                <h2 className="text-2xl font-bold text-foreground">
                  {systemState === 'healthy' ? 'Tudo funcionando normalmente' : 
                   systemState === 'critical' ? 'Alguns pontos precisam de atenção' : 
                   'Pequenos ajustes recomendados'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Última atualização: {new Date().toLocaleTimeString('pt-BR')}
                </p>
              </div>
            </div>
            
            <div className="space-y-1 text-sm ml-16">
              {systemState === 'healthy' ? (
                <>
                  <p className="text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {onlinePercentage}% dos computadores estão online
                  </p>
                  <p className="text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Nenhum incidente crítico ativo
                  </p>
                  <p className="text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Sistema estável nas últimas 24h
                  </p>
                </>
              ) : (
                <>
                  {offlineCount > 0 && (
                    <p className="text-warning flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      {offlineCount} computador(es) offline precisam de verificação
                    </p>
                  )}
                  {failedJobs > 0 && (
                    <p className="text-warning flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      {failedJobs} verificação(ões) com erro nas últimas 24h
                    </p>
                  )}
                  {tenantsWithIssues > 0 && (
                    <p className="text-warning flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      {tenantsWithIssues} empresa(s) com pendências
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs mt-2 italic">
                    Esses problemas podem impactar operações se persistirem
                  </p>
                </>
              )}
            </div>
          </div>
          
          <div 
            className="text-center md:text-right bg-secondary/30 rounded-xl p-6 border border-border cursor-pointer hover:border-primary/40 hover:bg-secondary/50 transition-all"
            onClick={() => navigate('/admin/agent-health')}
          >
            <p className="text-4xl font-bold text-foreground">{totalAgents}</p>
            <p className="text-sm text-muted-foreground">computadores monitorados</p>
            <p className="text-xs text-primary mt-1">em {totalTenants} empresa(s)</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
