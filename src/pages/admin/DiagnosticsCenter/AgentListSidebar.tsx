import type { RpcAgentRow } from '@/types/rpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Computer } from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-utils';
import { getOsIcon } from '@/lib/os-utils';
import { deriveAgentState, getStateColorClasses } from '@/lib/agent-state-machine';
import type { ProblematicAgent, IssueInfo } from './types';

interface AgentListSidebarProps {
  problematicAgents: ProblematicAgent[];
  allAgents: RpcAgentRow[];
  socMode: boolean;
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  getIssueInfo: (issueType: string | null) => IssueInfo;
}

export function AgentListSidebar({
  problematicAgents,
  allAgents,
  socMode,
  selectedAgentId,
  onSelectAgent,
  getIssueInfo,
}: AgentListSidebarProps) {
  const displayCount = socMode
    ? allAgents.filter(a =>
        problematicAgents.some(p => p.id === a.id &&
          (p.issue_type === 'no_heartbeat' || p.issue_type === 'no_token' || p.issue_type === 'stale_heartbeat')
        ) || a.is_isolated || !!a.safe_mode_entered_at
      ).length
    : allAgents.length;

  return (
    <Card className={`lg:col-span-1 ${socMode ? 'border-destructive/30' : ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Computer className="h-4 w-4" />
          {socMode ? 'Críticos' : 'Computadores'} ({displayCount})
        </CardTitle>
        <CardDescription>
          {socMode ? 'Apenas agentes que requerem ação imediata' : 'Clique para diagnosticar'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[500px]">
          <div className="p-4 space-y-2">
            {/* Problematic agents first */}
            {problematicAgents.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-destructive mb-2 px-1">COM PROBLEMAS</p>
                {problematicAgents.map((agent) => {
                  const issueInfo = getIssueInfo(agent.issue_type);
                  const IssueIcon = issueInfo.icon;
                  const isSelected = selectedAgentId === agent.id;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => onSelectAgent(agent.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors mb-2 ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm truncate flex items-center gap-2">
                          <span>{getOsIcon(agent.os_type || 'windows')}</span>
                          {agent.agent_name}
                        </span>
                        <Badge variant={issueInfo.variant} className="text-xs">
                          <IssueIcon className="h-3 w-3 mr-1" />
                          {issueInfo.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {agent.hostname || 'Hostname desconhecido'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {/* All other agents - hide in SOC mode */}
            {!socMode && (
              <>
                <p className="text-xs font-medium text-muted-foreground mb-2 px-1">TODOS</p>
                {allAgents
                  .filter(a => !problematicAgents.find(p => p.id === a.id))
                  .map((agent) => {
                    const isSelected = selectedAgentId === agent.id;
                    const state = deriveAgentState({
                      is_isolated: agent.is_isolated,
                      safe_mode_entered_at: agent.safe_mode_entered_at,
                      last_heartbeat: agent.last_heartbeat,
                      is_throttled: agent.is_throttled,
                    });
                    const colors = getStateColorClasses(state);
                    return (
                      <button
                        key={agent.id}
                        onClick={() => onSelectAgent(agent.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-accent/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm truncate flex items-center gap-2">
                            <span>{getOsIcon(agent.os_type || 'windows')}</span>
                            {agent.agent_name}
                          </span>
                          <div className={`w-2 h-2 rounded-full ${colors.bg}`} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {agent.last_heartbeat ? formatRelativeTime(agent.last_heartbeat) : 'Nunca conectado'}
                        </p>
                      </button>
                    );
                  })}
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
