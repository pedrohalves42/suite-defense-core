import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Terminal } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ProcessControlDispatcher } from '@/components/admin/ProcessControlDispatcher';
import type { Agent } from './types';

interface ProcessControlSectionProps {
  agents: Agent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getAgentStatus: (agent: Agent) => 'online' | 'offline' | 'pending' | 'disabled';
}

export function ProcessControlSection({ agents, open, onOpenChange, getAgentStatus }: ProcessControlSectionProps) {
  const onlineAgents = agents.filter(a => getAgentStatus(a) === 'online').map(a => ({
    id: a.id,
    agent_name: a.agent_name,
    hostname: a.hostname,
    status: a.status,
    os_type: a.os_type,
  }));

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <Card className="border-amber-500/30">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Terminal className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    Controle Remoto de Processos
                    <Badge variant="outline" className="text-xs border-amber-500 text-amber-500">Admin</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">Encerrar processos ou gerenciar serviços remotamente</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm">{open ? 'Fechar' : 'Expandir'}</Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <ProcessControlDispatcher agents={onlineAgents} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
