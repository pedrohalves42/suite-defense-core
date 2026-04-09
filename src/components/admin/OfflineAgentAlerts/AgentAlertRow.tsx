import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/date-utils';
import { motion } from 'framer-motion';
import { severityConfig } from './constants';
import { getSeverity } from './utils';
import type { OfflineAgent } from './types';

interface AgentAlertRowProps {
  agent: OfflineAgent;
  isBusinessHoursActive: boolean;
  isAcknowledged: boolean;
  onAcknowledge: (agentId: string, agentName: string) => void;
}

export function AgentAlertRow({ agent, isBusinessHoursActive, isAcknowledged, onAcknowledge }: AgentAlertRowProps) {
  const severity = getSeverity(agent.offline_hours, isBusinessHoursActive);
  const config = severityConfig[severity];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: isAcknowledged ? 0.6 : 1, x: 0 }}
      exit={{ opacity: 0, x: 20, height: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-center justify-between p-3 rounded-lg border transition-all',
        config.bg,
        config.border,
        isAcknowledged && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-3">
        <Server className={cn('h-5 w-5', config.icon)} />
        <div>
          <p className={cn('font-medium', config.text)}>{agent.agent_name}</p>
          <p className="text-xs text-muted-foreground">
            {agent.hostname && `${agent.hostname} • `}
            Offline {formatRelativeTime(agent.last_heartbeat)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge className={cn('text-xs', config.badge)}>
          {severity === 'critical' && '🔴 CRÍTICO'}
          {severity === 'danger' && '🟠 ALERTA'}
          {severity === 'warning' && '🟡 ATENÇÃO'}
          {severity === 'info' && '⚪ INFO'}
          <span className="ml-1">({Math.round(agent.offline_hours)}h)</span>
        </Badge>

        {!isAcknowledged && (
          <Button variant="ghost" size="sm" onClick={() => onAcknowledge(agent.agent_id, agent.agent_name)} className="h-7 px-2">
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}
