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
    <Card 
      className={cn(
        "relative overflow-hidden transition-all duration-500 shadow-xl border-2",
        systemState === 'healthy' ? "bg-success/5 border-success/20" :
        systemState === 'critical' ? "bg-destructive/5 border-destructive/20" :
        "bg-warning/5 border-warning/20"
      )}
      role="status"
      aria-live="polite"
    >
      {/* Dynamic background glow */}
      <div className={cn(
        "absolute -right-20 -top-20 w-64 h-64 rounded-full blur-[100px] opacity-20 transition-colors duration-1000",
        systemState === 'healthy' ? "bg-success" :
        systemState === 'critical' ? "bg-destructive" :
        "bg-warning"
      )} />

      <CardContent className="py-10 relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="flex-1 flex flex-col sm:flex-row items-start gap-6">
            <div className={cn(
              "flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-110 duration-300",
              systemState === 'healthy' ? "bg-success text-white" :
              systemState === 'critical' ? "bg-destructive text-white shadow-destructive/20" :
              "bg-warning text-warning-foreground shadow-warning/20"
            )}>
              {systemState === 'healthy' ? (
                <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-8 w-8" aria-hidden="true" />
              )}
            </div>
            
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                  {systemState === 'healthy' ? 'Sistema Protegido' : 
                   systemState === 'critical' ? 'Atenção Necessária' : 
                   'Monitoramento Requerido'}
                </h2>
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mt-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  Monitoramento ativo • Último check: {new Date().toLocaleTimeString('pt-BR')}
                </div>
              </div>
              
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
                {systemState === 'healthy' ? (
                  <>
                    <div className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground group">
                      <div className="w-5 h-5 rounded-full bg-success/10 flex items-center justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      </div>
                      <span>{onlinePercentage}% dos dispositivos online</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground group">
                      <div className="w-5 h-5 rounded-full bg-success/10 flex items-center justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      </div>
                      <span>Nenhum incidente crítico</span>
                    </div>
                  </>
                ) : (
                  <>
                    {offlineCount > 0 && (
                      <div className="flex items-center gap-2.5 text-sm font-bold text-warning animate-pulse">
                        <AlertCircle className="h-4 w-4" />
                        {offlineCount} dispositivo(s) offline
                      </div>
                    )}
                    {failedJobs > 0 && (
                      <div className="flex items-center gap-2.5 text-sm font-bold text-warning animate-pulse">
                        <AlertCircle className="h-4 w-4" />
                        {failedJobs} falhas detectadas
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          
          <button 
            className="group flex items-center justify-between lg:justify-center gap-6 bg-background/40 backdrop-blur-md rounded-2xl p-6 border border-border/50 hover:border-primary/50 hover:bg-background/60 transition-all duration-300 shadow-sm focus-ring"
            onClick={() => navigate('/admin/agent-health')}
            aria-label={`Ver todos os ${totalAgents} computadores monitorados em ${totalTenants} empresas`}
          >
            <div className="text-left">
              <p className="text-4xl font-black text-foreground group-hover:text-primary transition-colors">{totalAgents}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">Dispositivos</p>
            </div>
            <div className="h-10 w-px bg-border/50" aria-hidden="true" />
            <div className="text-left">
              <p className="text-2xl font-black text-foreground group-hover:text-primary transition-colors">{totalTenants}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">Empresas</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" aria-hidden="true" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
