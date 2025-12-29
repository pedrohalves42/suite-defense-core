import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  CheckCircle, 
  AlertTriangle, 
  ShieldAlert, 
  Download, 
  RotateCcw, 
  ShieldOff, 
  WifiOff,
  AlertOctagon
} from 'lucide-react';
import { 
  deriveAgentState, 
  getStateDescription, 
  getStateColorClasses,
  type AgentState 
} from '@/lib/agent-state-machine';

interface AgentData {
  status?: string;
  is_isolated?: boolean | null;
  is_throttled?: boolean | null;
  safe_mode_reason?: string | null;
  safe_mode_entered_at?: string | null;
  last_heartbeat?: string | null;
  force_update_version?: string | null;
  force_update_at?: string | null;
  throttle_reason?: string | null;
  isolation_reason?: string | null;
  // Optional: pre-computed state from DB
  agent_state?: string | null;
  agent_state_reason?: string | null;
}

interface AgentStateBadgeProps {
  agent: AgentData;
  compact?: boolean;
  showTooltip?: boolean;
}

const STATE_ICONS: Record<AgentState, React.ComponentType<{ className?: string }>> = {
  healthy: CheckCircle,
  degraded: AlertTriangle,
  safe_mode: ShieldAlert,
  updating: Download,
  rollback: RotateCcw,
  isolated: ShieldOff,
  offline: WifiOff,
  quarantined: AlertOctagon,
};

export function AgentStateBadge({ agent, compact = false, showTooltip = true }: AgentStateBadgeProps) {
  // Use pre-computed state from DB if available, otherwise derive
  const state = (agent.agent_state as AgentState) || deriveAgentState(agent);
  const description = getStateDescription(state);
  const colors = getStateColorClasses(state);
  const Icon = STATE_ICONS[state];

  const badge = (
    <Badge 
      variant="outline"
      className={`gap-1.5 text-xs ${colors.bg} ${colors.text} ${colors.border}`}
    >
      <Icon className="h-3 w-3" />
      {!compact && description.label}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-medium">{description.label}</p>
        <p className="text-xs text-muted-foreground">{description.description}</p>
        {agent.agent_state_reason && (
          <p className="text-xs text-muted-foreground mt-1 italic">
            {agent.agent_state_reason}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-2 border-t pt-1">
          {description.nextSteps}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
