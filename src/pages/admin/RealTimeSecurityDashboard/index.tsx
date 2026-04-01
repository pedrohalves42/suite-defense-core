/**
 * Real-Time Security Dashboard — Modularized
 */

import { Shield, Radio, Zap, Ban, Clock, Monitor, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RiskScoreCard } from '@/components/admin/RiskScoreCard';
import { TenantBaselineProfile } from '@/components/admin/TenantBaselineProfile';
import { SecurityImpactFeed } from '@/components/admin/SecurityImpactFeed';
import { useRealTimeSecurityDashboard } from './useRealTimeSecurityDashboard';
import { MetricTile } from './components/MetricTile';
import { SecurityEventFeed } from './components/SecurityEventFeed';
import { SecuritySidebarCards } from './components/SecuritySidebarCards';

export default function RealTimeSecurityDashboard() {
  const {
    events, isLive, setIsLive, refreshAll,
    playbookStats, blockedStats, approvalStats, agentStats,
    coveragePercent,
  } = useRealTimeSecurityDashboard();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Segurança em Tempo Real
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Acompanhe tudo que está acontecendo nos seus computadores agora
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isLive ? "default" : "secondary"} className={cn("gap-1", isLive && "animate-pulse")}>
            <Radio className="h-3 w-3" />
            {isLive ? 'AO VIVO' : 'PAUSADO'}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setIsLive(!isLive)}>
            {isLive ? 'Pausar' : 'Retomar'}
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Risk Score */}
      <RiskScoreCard />

      {/* Quick metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile icon={Zap} label="Proteções Hoje" value={playbookStats?.total || 0} color="text-primary"
          help="Quantidade de vezes que o sistema agiu automaticamente para proteger seus computadores hoje" />
        <MetricTile icon={Ban} label="Ataques Bloqueados" value={blockedStats?.today || 0} color="text-destructive"
          help="Tentativas de acesso não autorizado que foram impedidas pelo sistema hoje" />
        <MetricTile icon={Clock} label="Aguardando Você" value={approvalStats?.pending || 0} color="text-warning"
          help="Ações que precisam da sua aprovação para serem executadas" />
        <MetricTile icon={Monitor} label="Computadores OK" value={agentStats?.protected || 0} color="text-success"
          help="Computadores que estão ligados, conectados e protegidos neste momento" />
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SecurityEventFeed events={events} isLive={isLive} />
        <SecuritySidebarCards
          agentStats={agentStats}
          approvalStats={approvalStats}
          playbookStats={playbookStats}
          coveragePercent={coveragePercent}
        />
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SecurityImpactFeed />
        <TenantBaselineProfile />
      </div>
    </div>
  );
}
