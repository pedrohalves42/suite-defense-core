import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Trash2, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from 'react';

interface ProblematicAgent {
  id: string;
  agent_name: string;
  status: string;
  enrolled_at: string;
  last_heartbeat: string | null;
  tenant_id: string;
  tenant_name: string;
  minutes_since_enrollment: number;
  issue_type: string;
  token_count: number;
  has_active_token: number;
  pending_jobs_count: number;
}

export default function ProblematicAgentsManager() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<ProblematicAgent | null>(null);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [showCleanupAllDialog, setShowCleanupAllDialog] = useState(false);

  // Fetch problematic agents
  const { data: agents, isLoading } = useQuery({
    queryKey: ['problematic-agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase
        .from('v_problematic_agents')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('enrolled_at', { ascending: false });
      
      if (error) throw error;
      return data as ProblematicAgent[];
    },
    enabled: !!tenant?.id,
    refetchInterval: 30000, // Atualizar a cada 30s
  });

  // Cleanup single agent mutation
  const cleanupAgent = useMutation({
    mutationFn: async (agentId: string) => {
      const { data, error } = await supabase.rpc('cleanup_problematic_agent', {
        p_agent_id: agentId
      });
      
      if (error) throw error;
      return data as { success: boolean; agent_name: string; tokens_invalidated: number; jobs_deleted: number };
    },
    onSuccess: (data) => {
      toast({
        title: "Agente limpo com sucesso",
        description: `${data.agent_name}: ${data.tokens_invalidated} tokens invalidados, ${data.jobs_deleted} jobs removidos`,
      });
      queryClient.invalidateQueries({ queryKey: ['problematic-agents'] });
      setShowCleanupDialog(false);
      setSelectedAgent(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao limpar agente",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Cleanup all agents mutation
  const cleanupAllAgents = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant ID not found');
      
      const { data, error } = await supabase.rpc('cleanup_all_problematic_agents', {
        p_tenant_id: tenant.id
      });
      
      if (error) throw error;
      return data as { success: boolean; total_cleaned: number; results: any[] };
    },
    onSuccess: (data) => {
      toast({
        title: "Limpeza em massa concluída",
        description: `${data.total_cleaned} agentes foram limpos com sucesso`,
      });
      queryClient.invalidateQueries({ queryKey: ['problematic-agents'] });
      setShowCleanupAllDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro na limpeza em massa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getIssueInfo = (issueType: string) => {
    switch (issueType) {
      case 'never_connected':
        return {
          label: 'Nunca Conectou',
          variant: 'destructive' as const,
          icon: AlertCircle,
        };
      case 'stale_heartbeat':
        return {
          label: 'Heartbeat Antigo',
          variant: 'outline' as const,
          icon: AlertTriangle,
        };
      default:
        return {
          label: 'OK',
          variant: 'default' as const,
          icon: CheckCircle,
        };
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agentes Problemáticos</h1>
          <p className="text-muted-foreground mt-1">
            Agentes em estado pending sem heartbeat há mais de 10 minutos
          </p>
        </div>
        
        {agents && agents.length > 0 && (
          <Button
            onClick={() => setShowCleanupAllDialog(true)}
            variant="destructive"
            disabled={cleanupAllAgents.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Limpar Todos ({agents.length})
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">Carregando agentes...</p>
          </CardContent>
        </Card>
      ) : agents && agents.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="h-12 w-12 text-green-600" />
              <p className="text-lg font-semibold">Nenhum agente problemático encontrado</p>
              <p className="text-sm text-muted-foreground">
                Todos os agentes estão funcionando corretamente
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {agents?.map((agent) => {
            const issueInfo = getIssueInfo(agent.issue_type);
            const IssueIcon = issueInfo.icon;
            
            return (
              <Card key={agent.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {agent.agent_name}
                        <Badge variant={issueInfo.variant}>
                          <IssueIcon className="mr-1 h-3 w-3" />
                          {issueInfo.label}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="mt-2 space-y-1">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <span>Status: <strong>{agent.status}</strong></span>
                          <span>Tokens: <strong>{agent.token_count}</strong> (ativos: {agent.has_active_token})</span>
                          <span>Inscrito: {format(new Date(agent.enrolled_at), 'dd/MM/yyyy HH:mm')}</span>
                          <span>Tempo decorrido: <strong>{Math.floor(agent.minutes_since_enrollment)}min</strong></span>
                          <span>Jobs pendentes: <strong>{agent.pending_jobs_count}</strong></span>
                          <span>Último heartbeat: <strong>{agent.last_heartbeat ? format(new Date(agent.last_heartbeat), 'dd/MM HH:mm') : 'Nunca'}</strong></span>
                        </div>
                      </CardDescription>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedAgent(agent);
                          setShowCleanupDialog(true);
                        }}
                        disabled={cleanupAgent.isPending}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Limpar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                {agent.pending_jobs_count > 0 && (
                  <CardContent>
                    <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-semibold text-yellow-900">
                          {agent.pending_jobs_count} job{agent.pending_jobs_count > 1 ? 's' : ''} pendente{agent.pending_jobs_count > 1 ? 's' : ''}
                        </p>
                        <p className="text-yellow-700">
                          Estes jobs serão removidos durante a limpeza
                        </p>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Cleanup Single Agent Dialog */}
      <AlertDialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar agente {selectedAgent?.agent_name}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta ação irá:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Invalidar todos os tokens ativos ({selectedAgent?.token_count || 0})</li>
                <li>Remover jobs pendentes ({selectedAgent?.pending_jobs_count || 0})</li>
                <li>Resetar o status do agente para "pending"</li>
              </ul>
              <p className="font-semibold mt-3">
                Após a limpeza, você precisará regenerar as credenciais e reinstalar o agente.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedAgent && cleanupAgent.mutate(selectedAgent.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Limpar Agente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cleanup All Agents Dialog */}
      <AlertDialog open={showCleanupAllDialog} onOpenChange={setShowCleanupAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todos os agentes problemáticos?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta ação irá limpar <strong>{agents?.length || 0} agentes</strong>:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Invalidar todos os tokens ativos</li>
                <li>Remover todos os jobs pendentes</li>
                <li>Resetar status de todos os agentes</li>
              </ul>
              <p className="font-semibold mt-3 text-destructive">
                ⚠️ Esta é uma operação em massa. Use com cautela!
              </p>
              <p className="text-sm">
                Após a limpeza, você precisará regenerar credenciais e reinstalar cada agente individualmente.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cleanupAllAgents.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar Limpeza em Massa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
