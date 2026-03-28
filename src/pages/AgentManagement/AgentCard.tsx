import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { HelpTooltip } from '@/components/ui/tech-tooltip';
import { DiskMetricsPanel } from '@/components/agent/DiskMetricsPanel';
import AgentInstallationGuide from '@/components/AgentInstallationGuide';
import { formatBrazilDateTime } from '@/lib/date-utils';
import {
  Activity, XCircle, Clock, PowerOff, Monitor, Cpu, HardDrive,
  RefreshCw, Shield, ShieldAlert, ShieldCheck, ArrowUpCircle,
  Loader2, Trash2, Power, MemoryStick,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Agent, AgentMetrics } from './types';

interface AgentCardProps {
  agent: Agent;
  status: 'online' | 'offline' | 'pending' | 'disabled';
  outdated: boolean;
  metrics?: AgentMetrics;
  installationComplete?: boolean;
  checkingHealth: boolean;
  onCheckHealth: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onDelete: () => void;
  getTimeSince: (date: string | null) => string;
}

function getOsIcon(osType: string | null) {
  if (!osType) return <Monitor className="h-5 w-5" />;
  const os = osType.toLowerCase();
  if (os.includes('windows')) return <Monitor className="h-5 w-5" />;
  if (os.includes('linux')) return <Cpu className="h-5 w-5" />;
  return <HardDrive className="h-5 w-5" />;
}

export function AgentCard({
  agent, status, outdated, metrics, installationComplete,
  checkingHealth, onCheckHealth, onDisable, onEnable, onDelete, getTimeSince,
}: AgentCardProps) {
  const { t } = useTranslation();

  const borderColor = status === 'online' ? 'border-green-500/30' :
    status === 'offline' ? 'border-red-500/30' :
    status === 'pending' ? 'border-orange-500/30' : 'border-muted';

  const barColor = status === 'online' ? 'bg-green-500' :
    status === 'offline' ? 'bg-red-500' :
    status === 'pending' ? 'bg-orange-500' : 'bg-muted';

  const iconBg = status === 'online' ? 'bg-green-500/10' :
    status === 'offline' ? 'bg-red-500/10' :
    status === 'pending' ? 'bg-orange-500/10' : 'bg-muted';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={`relative overflow-hidden ${borderColor}`}>
        <div className={`absolute top-0 left-0 right-0 h-1 ${barColor}`} />
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${iconBg}`}>{getOsIcon(agent.os_type)}</div>
              <div>
                <CardTitle className="text-base">{agent.agent_name}</CardTitle>
                <CardDescription className="text-xs">{agent.hostname || agent.os_type || 'Sistema desconhecido'}</CardDescription>
              </div>
            </div>
            <Badge variant={status === 'online' ? 'default' : status === 'offline' ? 'destructive' : status === 'pending' ? 'secondary' : 'outline'} className={status === 'online' ? 'bg-green-500' : ''}>
              {status === 'online' && <Activity className="h-3 w-3 mr-1 animate-pulse" />}
              {status === 'offline' && <XCircle className="h-3 w-3 mr-1" />}
              {status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
              {status === 'disabled' && <PowerOff className="h-3 w-3 mr-1" />}
              {status === 'online' ? t('agentManagementPage.online') :
               status === 'offline' ? t('agentManagementPage.offline') :
               status === 'pending' ? t('agentManagementPage.pending') : t('agentManagementPage.disabled')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Version */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <HelpTooltip term="versão do agente" />
              {t('agentManagementPage.version')}:
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`font-mono text-xs ${outdated ? 'border-amber-500 text-amber-500' : ''}`}>
                {agent.agent_version || 'N/A'}
              </Badge>
              {outdated && (
                <Badge className="bg-amber-500/10 text-amber-500 text-xs">
                  <ArrowUpCircle className="h-3 w-3 mr-1" /> Atualização disponível
                </Badge>
              )}
            </div>
          </div>

          {/* Last heartbeat */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <HelpTooltip term="heartbeat" />
              {t('agentManagementPage.lastSeen')}:
            </span>
            <span className={status === 'offline' ? 'text-red-500' : ''}>{getTimeSince(agent.last_heartbeat)}</span>
          </div>

          {/* Registration */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Registrado:</span>
            <span>{formatBrazilDateTime(agent.enrolled_at, 'date')}</span>
          </div>

          {/* Protection */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Proteção:</span>
            {status === 'online' && !outdated ? (
              <span className="flex items-center gap-1 text-green-500"><ShieldCheck className="h-4 w-4" /> Protegido</span>
            ) : status === 'online' && outdated ? (
              <span className="flex items-center gap-1 text-amber-500"><ShieldAlert className="h-4 w-4" /> Parcial</span>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground"><Shield className="h-4 w-4" /> Inativo</span>
            )}
          </div>

          {/* System Metrics */}
          {metrics && status !== 'pending' && (
            <div className="space-y-2 pt-2 border-t">
              <MetricBar icon={<Cpu className="h-3 w-3" />} label="CPU" value={metrics.cpu_usage_percent} />
              <MetricBar icon={<MemoryStick className="h-3 w-3" />} label="Memória" value={metrics.memory_usage_percent} />
              <DiskMetricsPanel agentId={agent.id} compact />
            </div>
          )}

          {!metrics && status === 'online' && (
            <div className="text-xs text-muted-foreground text-center py-2 border-t">Aguardando métricas...</div>
          )}

          {status === 'pending' && (
            <div className="pt-2 border-t">
              <AgentInstallationGuide agent={agent} hasPostInstallation={installationComplete || false} />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" className="flex-1" onClick={onCheckHealth} disabled={checkingHealth || status === 'disabled'}>
              {checkingHealth ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {t('agentManagementPage.checkHealth')}
            </Button>
            {status === 'disabled' ? (
              <Button variant="outline" size="sm" className="flex-1" onClick={onEnable}>
                <Power className="h-4 w-4 mr-1" /> {t('common.edit')}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="flex-1" onClick={onDisable}>
                <PowerOff className="h-4 w-4 mr-1" /> {t('agentManagementPage.disableAgent')}
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MetricBar({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | null }) {
  const v = value ?? 0;
  const color = v > 80 ? 'text-red-500' : v > 60 ? 'text-amber-500' : 'text-green-500';
  const progressColor = v > 80 ? '[&>div]:bg-red-500' : v > 60 ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500';

  return (
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">{icon} {label}</span>
        <span className={`font-medium ${color}`}>{value?.toFixed(0) ?? 'N/A'}%</span>
      </div>
      <Progress value={v} className={`h-1.5 ${progressColor}`} />
    </>
  );
}
