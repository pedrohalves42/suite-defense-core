import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Monitor, Lock, Zap, Wifi, WifiOff, ShieldAlert, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HelpTip } from './HelpTip';

interface SecuritySidebarCardsProps {
  agentStats: { total: number; protected: number; isolated: number; offline: number } | undefined;
  approvalStats: { pending: number; approved: number; rejected: number; expired: number } | undefined;
  playbookStats: { total: number; autoExecuted: number; pending: number } | undefined;
  coveragePercent: number;
}

export function SecuritySidebarCards({ agentStats, approvalStats, playbookStats, coveragePercent }: SecuritySidebarCardsProps) {
  return (
    <div className="space-y-4">
      {/* Computers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            Seus Computadores
            <HelpTip text="Mostra quantos computadores estão conectados e protegidos neste momento" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Protegidos', sublabel: 'Ligados e monitorados', value: agentStats?.protected || 0, color: 'bg-success', textColor: 'text-success', icon: Wifi },
            { label: 'Em quarentena', sublabel: 'Isolados por segurança', value: agentStats?.isolated || 0, color: 'bg-warning', textColor: 'text-warning', icon: ShieldAlert },
            { label: 'Desligados', sublabel: 'Sem comunicação', value: agentStats?.offline || 0, color: 'bg-muted-foreground/40', textColor: 'text-muted-foreground', icon: WifiOff },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                <div>
                  <span className="text-sm">{item.label}</span>
                  <p className="text-[10px] text-muted-foreground leading-tight">{item.sublabel}</p>
                </div>
              </div>
              <span className={cn("font-bold text-lg", item.textColor)}>{item.value}</span>
            </div>
          ))}
          <div className="pt-3 border-t space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Cobertura de proteção</span>
              <span className={cn("font-semibold", coveragePercent >= 80 ? "text-success" : coveragePercent >= 50 ? "text-warning" : "text-destructive")}>
                {coveragePercent}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full transition-all rounded-full", coveragePercent >= 80 ? "bg-success" : coveragePercent >= 50 ? "bg-warning" : "bg-destructive")}
                style={{ width: `${coveragePercent}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {coveragePercent === 100 ? 'Todos os computadores estão protegidos ✓' :
               coveragePercent >= 80 ? 'Boa cobertura, mas alguns estão desligados' :
               'Atenção: vários computadores estão sem proteção'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Approvals */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Aprovações de Hoje
            <HelpTip text="Algumas ações de segurança precisam que você aprove antes de serem executadas. Veja aqui o status delas." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Esperando você', value: approvalStats?.pending || 0, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
              { label: 'Aprovadas', value: approvalStats?.approved || 0, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
              { label: 'Negadas', value: approvalStats?.rejected || 0, icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
              { label: 'Expiradas', value: approvalStats?.expired || 0, icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-muted/50' },
            ].map(item => (
              <div key={item.label} className={cn("p-2.5 rounded-lg text-center", item.bg)}>
                <item.icon className={cn("h-4 w-4 mx-auto mb-1", item.color)} />
                <p className={cn("text-lg font-bold", item.color)}>{item.value}</p>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Automatic protection */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            Proteção Automática
            <HelpTip text="O sistema pode agir sozinho quando detecta problemas. Aqui você vê quantas vezes isso aconteceu hoje." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-muted/50 text-center">
              <p className="text-lg font-bold">{playbookStats?.total || 0}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
            <div className="p-2 rounded-lg bg-warning/10 text-center">
              <p className="text-lg font-bold text-warning">{playbookStats?.pending || 0}</p>
              <p className="text-[10px] text-muted-foreground">Em andamento</p>
            </div>
            <div className="p-2 rounded-lg bg-success/10 text-center">
              <p className="text-lg font-bold text-success">{playbookStats?.autoExecuted || 0}</p>
              <p className="text-[10px] text-muted-foreground">Concluídas</p>
            </div>
          </div>
          {(playbookStats?.total || 0) === 0 && (
            <p className="text-[11px] text-muted-foreground text-center mt-3 py-2">
              Nenhuma ação automática hoje — tudo sob controle ✓
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
