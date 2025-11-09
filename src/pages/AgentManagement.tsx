import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Server, Trash2, Power, PowerOff, CheckCircle, XCircle, Clock, Activity } from 'lucide-react';

interface Agent {
  id: string;
  agent_name: string;
  status: string;
  enrolled_at: string;
  last_heartbeat: string | null;
  tenant_id: string;
}

export default function AgentManagement() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [agentToDisable, setAgentToDisable] = useState<Agent | null>(null);

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('enrolled_at', { ascending: false });

      if (error) throw error;
      return data as Agent[];
    },
    enabled: !!tenant?.id,
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      // Delete agent tokens first
      const { error: tokenError } = await supabase
        .from('agent_tokens')
        .delete()
        .eq('agent_id', agentId);

      if (tokenError) throw tokenError;

      // Delete the agent
      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', agentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agente excluído com sucesso');
      setAgentToDelete(null);
    },
    onError: (error) => {
      console.error('Error deleting agent:', error);
      toast.error('Erro ao excluir agente');
    },
  });

  const disableAgentMutation = useMutation({
    mutationFn: async ({ agentId, disable }: { agentId: string; disable: boolean }) => {
      // Update agent status
      const { error: agentError } = await supabase
        .from('agents')
        .update({ status: disable ? 'disabled' : 'active' })
        .eq('id', agentId);

      if (agentError) throw agentError;

      // Deactivate all tokens if disabling
      if (disable) {
        const { error: tokenError } = await supabase
          .from('agent_tokens')
          .update({ is_active: false })
          .eq('agent_id', agentId);

        if (tokenError) throw tokenError;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(variables.disable ? 'Agente desativado com sucesso' : 'Agente reativado com sucesso');
      setAgentToDisable(null);
    },
    onError: (error) => {
      console.error('Error updating agent:', error);
      toast.error('Erro ao atualizar agente');
    },
  });

  const getStatusBadge = (agent: Agent) => {
    if (agent.status === 'disabled') {
      return <Badge variant="secondary"><PowerOff className="w-3 h-3 mr-1" />Desativado</Badge>;
    }

    if (!agent.last_heartbeat) {
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Sem Heartbeat</Badge>;
    }

    const lastHeartbeat = new Date(agent.last_heartbeat);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastHeartbeat.getTime()) / (1000 * 60);

    if (diffMinutes < 5) {
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Online</Badge>;
    } else {
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Offline</Badge>;
    }
  };

  const getTimeSince = (date: string | null) => {
    if (!date) return 'Nunca';
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Agora mesmo';
    if (diffMins < 60) return `${diffMins}min atrás`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d atrás`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20">
          <Server className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-3xl font-bold">Gerenciamento de Agentes</h2>
          <p className="text-muted-foreground">
            Controle e gerencie os agentes do tenant {tenant?.name}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Agentes</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agents?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Todos os agentes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agentes Ativos</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {agents?.filter(a => {
                if (!a.last_heartbeat) return false;
                const diffMins = (new Date().getTime() - new Date(a.last_heartbeat).getTime()) / (1000 * 60);
                return diffMins < 5 && a.status !== 'disabled';
              }).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Online agora</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agentes Offline</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {agents?.filter(a => {
                if (!a.last_heartbeat || a.status === 'disabled') return false;
                const diffMins = (new Date().getTime() - new Date(a.last_heartbeat).getTime()) / (1000 * 60);
                return diffMins >= 5;
              }).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Sem heartbeat</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Desativados</CardTitle>
            <PowerOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {agents?.filter(a => a.status === 'disabled').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Manualmente desativados</p>
          </CardContent>
        </Card>
      </div>

      {/* Agents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Agentes</CardTitle>
          <CardDescription>
            Gerencie os agentes instalados em seus endpoints
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Agente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último Heartbeat</TableHead>
                <TableHead>Registrado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents?.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell className="font-medium">{agent.agent_name}</TableCell>
                  <TableCell>{getStatusBadge(agent)}</TableCell>
                  <TableCell>{getTimeSince(agent.last_heartbeat)}</TableCell>
                  <TableCell>
                    {format(new Date(agent.enrolled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {agent.status === 'disabled' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disableAgentMutation.mutate({ agentId: agent.id, disable: false })}
                      >
                        <Power className="h-4 w-4 mr-1" />
                        Reativar
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAgentToDisable(agent)}
                      >
                        <PowerOff className="h-4 w-4 mr-1" />
                        Desativar
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setAgentToDelete(agent)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Excluir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!agents || agents.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhum agente registrado ainda
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!agentToDelete} onOpenChange={() => setAgentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja excluir este agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agente <strong>{agentToDelete?.agent_name}</strong> será permanentemente
              removido do sistema, incluindo todos os seus tokens de acesso.
              <br /><br />
              <strong>Aviso:</strong> O agente instalado no endpoint continuará tentando se conectar até ser desinstalado manualmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => agentToDelete && deleteAgentMutation.mutate(agentToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable Confirmation Dialog */}
      <AlertDialog open={!!agentToDisable} onOpenChange={() => setAgentToDisable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar Agente</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a desativar o agente <strong>{agentToDisable?.agent_name}</strong>.
              <br /><br />
              Isso irá:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Desativar todos os tokens de acesso deste agente</li>
                <li>Impedir que o agente envie heartbeats ou execute jobs</li>
                <li>Manter o histórico e dados do agente no sistema</li>
              </ul>
              <br />
              Você pode reativar o agente a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => agentToDisable && disableAgentMutation.mutate({ agentId: agentToDisable.id, disable: true })}
            >
              Desativar Agente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
