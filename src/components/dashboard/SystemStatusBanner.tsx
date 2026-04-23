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
        "relative overflow-hidden transition-all duration-500 shadow-2xl border-2 backdrop-blur-sm",
        systemState === 'healthy' ? "bg-success/5 border-success/30 shadow-success/10" :
        systemState === 'critical' ? "bg-destructive/5 border-destructive/30 shadow-destructive/10" :
        "bg-warning/5 border-warning/30 shadow-warning/10"
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

      <CardContent className="py-6 sm:py-8 lg:py-10 px-4 sm:px-6 relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 lg:gap-8">
          <div className="flex-1 flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
            <div className={cn(
              "flex-shrink-0 w-12 h-12 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-xl transition-all hover:scale-110 active:scale-95 duration-300 mx-auto sm:mx-0 ring-4 ring-offset-2 ring-offset-background",
              systemState === 'healthy' ? "bg-success text-white ring-success/20" :
              systemState === 'critical' ? "bg-destructive text-white shadow-destructive/20 ring-destructive/20" :
              "bg-warning text-warning-foreground shadow-warning/20 ring-warning/20"
            )}>
              {systemState === 'healthy' ? (
                <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-6 w-6 sm:h-8 sm:w-8" aria-hidden="true" />
              )}
            </div>
            
            <div className="space-y-3 sm:space-y-4 w-full text-center sm:text-left">
              <div>
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-foreground tracking-tight">
                  {systemState === 'healthy' ? 'Sistema Protegido' : 
                   systemState === 'critical' ? 'Atenção Necessária' : 
                   'Monitoramento Requerido'}
                </h2>
                <div className="flex items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm font-semibold text-muted-foreground mt-1 flex-wrap">
                  <span className="relative flex h-2 w-2 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <span>Monitoramento ativo • Último check: {new Date().toLocaleTimeString('pt-BR')}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 lg:gap-x-8 gap-y-2">
                {systemState === 'healthy' ? (
                  <>
                    <div className="flex items-center justify-center sm:justify-start gap-2.5 text-xs sm:text-sm font-medium text-muted-foreground">
                      <div className="w-5 h-5 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      </div>
                      <span>{onlinePercentage}% dos dispositivos online</span>
                    </div>
                    <div className="flex items-center justify-center sm:justify-start gap-2.5 text-xs sm:text-sm font-medium text-muted-foreground">
                      <div className="w-5 h-5 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      </div>
                      <span>Nenhum incidente crítico</span>
                    </div>
                  </>
                ) : (
                  <>
                    {offlineCount > 0 && (
                      <div className="flex items-center justify-center sm:justify-start gap-2.5 text-xs sm:text-sm font-bold text-warning animate-pulse">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <span>{offlineCount} dispositivo(s) offline</span>
                      </div>
                    )}
                    {failedJobs > 0 && (
                      <div className="flex items-center justify-center sm:justify-start gap-2.5 text-xs sm:text-sm font-bold text-warning animate-pulse">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <span>{failedJobs} falhas detectadas</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          
          <button 
            className="group flex items-center justify-between lg:justify-center gap-3 sm:gap-4 lg:gap-6 bg-background/40 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-border/50 hover:border-primary/50 hover:bg-background/60 transition-all duration-300 shadow-sm focus-ring w-full lg:w-auto"
            onClick={() => navigate('/admin/agent-health')}
            aria-label={`Ver todos os ${totalAgents} computadores monitorados em ${totalTenants} empresas`}
          >
            <div className="text-left">
              <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground group-hover:text-primary transition-colors">{totalAgents}</p>
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">Dispositivos</p>
            </div>
            <div className="h-8 sm:h-10 w-px bg-border/50 flex-shrink-0" aria-hidden="true" />
            <div className="text-left">
              <p className="text-xl sm:text-2xl font-black text-foreground group-hover:text-primary transition-colors">{totalTenants}</p>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">Empresas</p>
            </div>
            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0 ml-auto lg:ml-0" aria-hidden="true" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
