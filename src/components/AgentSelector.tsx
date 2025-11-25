import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface AgentSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
}

interface Agent {
  id: string;
  agent_name: string;
  status: string;
  os_type: string | null;
}

export function AgentSelector({ value, onValueChange }: AgentSelectorProps) {
  const { data: agents, isLoading, error } = useQuery({
    queryKey: ['agents-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, agent_name, status, os_type')
        .order('agent_name', { ascending: true });

      if (error) throw error;
      return data as Agent[];
    },
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
          Nenhum agente encontrado. Instale um agente primeiro.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Selecione um agente..." />
      </SelectTrigger>
      <SelectContent>
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${agent.status === 'active' ? 'bg-success' : 'bg-muted'}`} />
              <span>{agent.agent_name}</span>
              {agent.os_type && (
                <span className="text-xs text-muted-foreground">({agent.os_type})</span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
