import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { deriveAgentState, getStateColorClasses } from '@/lib/agent-state-machine';
import { useActiveTenant } from '@/hooks/useActiveTenant';

interface AgentSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
}

interface Agent {
  id: string;
  agent_name: string;
  status: string;
  os_type: string | null;
  is_isolated: boolean | null;
  is_throttled: boolean | null;
  safe_mode_reason: string | null;
  safe_mode_entered_at: string | null;
  last_heartbeat: string | null;
  force_update_version: string | null;
  force_update_at: string | null;
  agent_state: string | null;
}

export function AgentSelector({ value, onValueChange }: AgentSelectorProps) {
  // V-301: Add loading guard to prevent race conditions during tenant sync
  const { activeTenant, loading } = useActiveTenant();
  
  const { data: agents, isLoading, error } = useQuery({
    queryKey: ['agents-list', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return [];
      
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: activeTenant.id,
        p_include_archived: false
      });

      if (error) throw error;
      
      // Map RPC jsonb response to Agent interface
      // RPC returns untyped JSON — cast is required
      return ((data || []) as any[]).map((agent): Agent => ({
        id: agent.id,
        agent_name: agent.agent_name,
        status: agent.status,
        os_type: agent.os_type,
        is_isolated: agent.is_isolated,
        is_throttled: agent.is_throttled,
        safe_mode_reason: agent.safe_mode_reason,
        safe_mode_entered_at: agent.safe_mode_entered_at,
        last_heartbeat: agent.last_heartbeat,
        force_update_version: agent.force_update_version,
        force_update_at: agent.force_update_at,
        agent_state: agent.agent_state,
      })).sort((a, b) => a.agent_name.localeCompare(b.agent_name));
    },
    // V-301: Guard with !loading to prevent queries before JWT sync completes
    enabled: !loading && !!activeTenant?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar agentes: {error instanceof Error ? error.message : 'Erro desconhecido'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Nenhum computador encontrado. Instale o software de proteção primeiro.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Selecione um computador..." />
      </SelectTrigger>
      <SelectContent>
        {agents.map((agent) => {
          const state = deriveAgentState(agent);
          const colors = getStateColorClasses(state);
          
          return (
            <SelectItem key={agent.id} value={agent.id}>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${colors.bg.replace('/10', '')}`} />
                <span>{agent.agent_name}</span>
                {agent.os_type && (
                  <span className="text-xs text-muted-foreground">({agent.os_type})</span>
                )}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
