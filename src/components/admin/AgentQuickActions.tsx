import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Trash2, Key, Stethoscope, Loader2, Clock, ShieldOff, RefreshCcw, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import { useNavigate } from 'react-router-dom';
import { useAgentActions } from '@/hooks/useAgentActions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AgentQuickActionsProps {
  agentId: string;
  agentName: string;
  isThrottled?: boolean | null;
  isIsolated?: boolean | null;
  isInSafeMode?: boolean | null;
  onAgentDeleted?: () => void;
}

export function AgentQuickActions({ 
  agentId, 
  agentName,
  isThrottled,
  isIsolated,
  isInSafeMode,
  onAgentDeleted,
}: AgentQuickActionsProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { removeThrottle, removeIsolation, resetSafeMode, enableOverrideSafeMode } = useAgentActions();

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_problematic_agent', {
        p_agent_id: agentId
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const result = data as { success: boolean; tokens_invalidated?: number; jobs_deleted?: number };
      toast({
        title: 'Computador limpo com sucesso',
        description: `Credenciais invalidadas: ${result.tokens_invalidated || 0}, Tarefas removidas: ${result.jobs_deleted || 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['problematic-agents'] });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível limpar o computador',
        description: 'Tente novamente em alguns minutos.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Primeiro exclui tokens associados
      await supabase.from('agent_tokens').delete().eq('agent_id', agentId);
      // Depois exclui o agente
      const { error } = await supabase.from('agents').delete().eq('id', agentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Computador excluído',
        description: `${agentName} foi removido permanentemente do sistema.`,
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['problematic-agents'] });
      onAgentDeleted?.();
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir computador',
        description: 'Tente novamente em alguns minutos.',
        variant: 'destructive',
      });
    },
  });

  return (
    <>
      <div className="flex items-center gap-1">
        {isThrottled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeThrottle.mutate(agentId)}
                disabled={removeThrottle.isPending}
                className="text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/20"
              >
                {removeThrottle.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clock className="h-4 w-4" />
              )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remover limitação temporária</TooltipContent>
          </Tooltip>
        )}
        {isIsolated && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeIsolation.mutate(agentId)}
                disabled={removeIsolation.isPending}
                className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
              >
                {removeIsolation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldOff className="h-4 w-4" />
              )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remover isolamento de segurança</TooltipContent>
          </Tooltip>
        )}
        {isInSafeMode && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetSafeMode.mutate(agentId)}
                  disabled={resetSafeMode.isPending}
                  className="text-orange-600 hover:text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/20"
                >
                  {resetSafeMode.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">Resetar modo de proteção</p>
                <p className="text-xs text-muted-foreground">Cria uma tarefa para desativar o modo de proteção</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => enableOverrideSafeMode.mutate(agentId)}
                  disabled={enableOverrideSafeMode.isPending}
                  className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
                >
                  {enableOverrideSafeMode.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldOff className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">Forçar atualização (30 min)</p>
                <p className="text-xs text-yellow-400">⚠️ Ignora proteções. Use apenas em emergências.</p>
              </TooltipContent>
            </Tooltip>
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/admin/agent-diagnostics?agent=${agentId}`)}
            >
              <Stethoscope className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver diagnóstico do computador</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/enrollment-keys')}
            >
              <Key className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Gerar nova chave de instalação</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCleanupDialog(true)}
              disabled={cleanupMutation.isPending}
            >
              {cleanupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Limpar e resetar computador</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteMutation.isPending}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserX className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Excluir computador permanentemente</TooltipContent>
        </Tooltip>
      </div>

      <AlertDialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar Computador com Problemas</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Invalidar todas as credenciais do computador <strong>{agentName}</strong></li>
                <li>Remover tarefas pendentes</li>
                <li>Resetar o status para reinstalação</li>
              </ul>
              <p className="mt-3 text-destructive font-medium">
                O computador precisará ser reinstalado com uma nova chave de instalação.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cleanupMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar Limpeza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Computador Permanentemente?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>O computador <strong>{agentName}</strong> será permanentemente removido do sistema.</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-amber-600">
                  <li>Todos os dados e histórico serão perdidos</li>
                  <li>O software instalado continuará tentando se conectar</li>
                  <li>Será necessário desinstalar manualmente no computador</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
