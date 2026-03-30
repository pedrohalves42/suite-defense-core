import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Trash2, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
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
import { AgentStatusBadges } from '@/components/agents/AgentStatusBadges';
import { AgentQuickActions } from '@/components/admin/AgentQuickActions';
import { TooltipProvider } from '@/components/ui/tooltip';

interface ProblematicAgent {
  id: string | null;
  agent_name: string | null;
  status: string | null;
  enrolled_at: string | null;
  last_heartbeat: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  hostname: string | null;
  os_type: string | null;
  minutes_since_enrollment: number | null;
  issue_type: string | null;
  token_count: number | null;
  has_active_token: boolean | null;
  pending_jobs_count: number | null;
  // Rules Engine status fields
  is_throttled?: boolean | null;
  throttle_reason?: string | null;
  is_isolated?: boolean | null;
  isolation_reason?: string | null;
  safe_mode_entered_at?: string | null;
  safe_mode_reason?: string | null;
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
        .select('id, agent_name, status, tenant_id, enrolled_at, last_heartbeat, agent_version, os_name, problems')
        .eq('tenant_id', tenant.id)
        .order('enrolled_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as ProblematicAgent[];
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
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
        title: "Computador limpo com sucesso",
        description: `${data.agent_name}: ${data.tokens_invalidated} credenciais invalidadas, ${data.jobs_deleted} verificações removidas`,
      });
      queryClient.invalidateQueries({ queryKey: ['problematic-agents'] });
      setShowCleanupDialog(false);
      setSelectedAgent(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao limpar computador",
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
        description: `${data.total_cleaned} computadores foram limpos com sucesso`,
      });
      queryClient.invalidateQueries({ queryKey: ['problematic-agents'] });
      setShowCleanupAllDialog(false);
    },
    onError: (error: Error) => {
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
          label: 'Aguardando conexão',
          variant: 'destructive' as const,
          icon: AlertCircle,
          description: 'Este computador foi cadastrado mas ainda não se conectou',
        };
      case 'stale_heartbeat':
        return {
          label: 'Sem comunicação recente',
          variant: 'outline' as const,
          icon: AlertTriangle,
          description: 'O computador não envia sinais há mais tempo que o esperado',
        };
      default:
        return {
          label: 'OK',
          variant: 'default' as const,
          icon: CheckCircle,
          description: 'Funcionando normalmente',
        };
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Computadores com Problemas</h1>
          <p className="text-muted-foreground mt-1">
            Computadores que precisam de atenção ou reinstalação
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
            <p className="text-center text-muted-foreground">Carregando computadores...</p>
          </CardContent>
        </Card>
      ) : agents && agents.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="h-12 w-12 text-green-600" />
              <p className="text-lg font-semibold">Tudo certo!</p>
              <p className="text-sm text-muted-foreground">
                Todos os computadores estão funcionando normalmente
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {agents?.map((agent) => {
            const issueInfo = getIssueInfo(agent.issue_type ?? 'other');
            const IssueIcon = issueInfo.icon;
            
            return (
              <Card key={agent.id ?? 'unknown'}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2 flex-wrap">
                        {agent.agent_name ?? 'Unknown'}
                        <Badge variant={issueInfo.variant}>
                          <IssueIcon className="mr-1 h-3 w-3" />
                          {issueInfo.label}
                        </Badge>
                        {/* Rules Engine Status Badges */}
                        <TooltipProvider>
                          <AgentStatusBadges
                            isThrottled={agent.is_throttled}
                            isIsolated={agent.is_isolated}
                            isInSafeMode={!!agent.safe_mode_entered_at}
                            throttleReason={agent.throttle_reason}
                            isolationReason={agent.isolation_reason}
                            safeModeReason={agent.safe_mode_reason}
                            compact
                          />
                        </TooltipProvider>
                      </CardTitle>
                      <CardDescription className="mt-2 space-y-1">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <span>Situação: <strong>{agent.status === 'pending' ? 'Aguardando' : agent.status === 'active' ? 'Ativo' : agent.status ?? 'N/A'}</strong></span>
                          <span>Credenciais: <strong>{agent.token_count ?? 0}</strong> ({agent.has_active_token ? 'válida' : 'inválida'})</span>
                          <span>Cadastrado em: {agent.enrolled_at ? formatBrazilDateTime(agent.enrolled_at, 'datetime') : 'N/A'}</span>
                          <span>Tempo desde cadastro: <strong>{agent.minutes_since_enrollment ? Math.floor(agent.minutes_since_enrollment) : 0} minutos</strong></span>
                          <span>Verificações pendentes: <strong>{agent.pending_jobs_count ?? 0}</strong></span>
                          <span>Última comunicação: <strong>{agent.last_heartbeat ? formatBrazilDateTime(agent.last_heartbeat, 'short') : 'Nunca'}</strong></span>
                        </div>
                      </CardDescription>
                    </div>
                    
                    <div className="flex flex-col gap-2">
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
                      {/* Quick Actions for throttled/isolated agents */}
                      {agent.id && (agent.is_throttled || agent.is_isolated) && (
                        <AgentQuickActions
                          agentId={agent.id}
                          agentName={agent.agent_name ?? 'Unknown'}
                          isThrottled={agent.is_throttled}
                          isIsolated={agent.is_isolated}
                          isInSafeMode={false}
                        />
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                {(agent.pending_jobs_count ?? 0) > 0 && (
                  <CardContent>
                    <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-semibold text-yellow-900 dark:text-yellow-200">
                          {agent.pending_jobs_count} verificação{(agent.pending_jobs_count ?? 0) > 1 ? 'ões' : ''} pendente{(agent.pending_jobs_count ?? 0) > 1 ? 's' : ''}
                        </p>
                        <p className="text-yellow-700 dark:text-yellow-400">
                          Estas verificações serão canceladas durante a limpeza
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
            <AlertDialogTitle>Resetar computador {selectedAgent?.agent_name ?? 'Unknown'}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta ação irá:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Invalidar as credenciais atuais ({selectedAgent?.token_count ?? 0})</li>
                <li>Cancelar verificações pendentes ({selectedAgent?.pending_jobs_count ?? 0})</li>
                <li>Preparar o computador para nova instalação</li>
              </ul>
              <p className="font-semibold mt-3">
                Após o reset, você precisará reinstalar o programa neste computador.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedAgent?.id && cleanupAgent.mutate(selectedAgent.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cleanup All Agents Dialog */}
      <AlertDialog open={showCleanupAllDialog} onOpenChange={setShowCleanupAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar todos os computadores com problema?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta ação irá resetar <strong>{agents?.length || 0} computadores</strong>:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Invalidar todas as credenciais</li>
                <li>Cancelar todas as verificações pendentes</li>
                <li>Preparar os computadores para nova instalação</li>
              </ul>
              <p className="font-semibold mt-3 text-destructive">
                ⚠️ Esta é uma operação em massa. Use com cautela!
              </p>
              <p className="text-sm">
                Após o reset, você precisará reinstalar o programa em cada computador individualmente.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cleanupAllAgents.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar Reset em Massa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
