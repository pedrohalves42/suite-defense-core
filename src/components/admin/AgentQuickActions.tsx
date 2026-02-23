import { formatBrazilDateTime } from '@/lib/date-utils';
import { useState, useEffect } from 'react';
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
  tenantId?: string;
  isThrottled?: boolean | null;
  isIsolated?: boolean | null;
  isInSafeMode?: boolean | null;
  onAgentDeleted?: () => void;
}

export function AgentQuickActions({ 
  agentId, 
  agentName,
  tenantId,
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

  // Mutation para ARQUIVAR (soft delete - sempre funciona)
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('archive_agent', { p_agent_id: agentId });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string } | null;
      if (!result?.success) throw new Error(result?.error || 'Erro ao arquivar');
      return result;
    },
    onSuccess: () => {
      toast({
        title: 'Computador arquivado',
        description: 'O computador foi desativado e removido da operação.',
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['problematic-agents'] });
      setShowDeleteDialog(false);
      onAgentDeleted?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao arquivar',
        description: error?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  // Mutation para EXCLUIR DEFINITIVAMENTE (só funciona se auditoria permitir)
  const hardDeleteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('hard_delete_agent', { p_agent_id: agentId });
      if (error) throw error;
      const result = data as { success?: boolean; reason?: string; message?: string; error?: string } | null;
      if (!result?.success) {
        if (result?.reason === 'AUDIT_RETENTION') {
          throw new Error(result?.message || 'Bloqueado por auditoria');
        }
        throw new Error(result?.error || 'Erro ao excluir');
      }
      return result;
    },
    onSuccess: () => {
      toast({
        title: 'Computador excluído',
        description: 'O computador foi removido permanentemente.',
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['problematic-agents'] });
      setShowDeleteDialog(false);
      onAgentDeleted?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Não foi possível excluir',
        description: error?.message || 'Tente arquivar em vez de excluir.',
        variant: 'destructive',
      });
    },
  });

  // Verificar se pode excluir definitivamente
  const [canHardDelete, setCanHardDelete] = useState<boolean | null>(null);
  const [deleteBlockedUntil, setDeleteBlockedUntil] = useState<string | null>(null);

  useEffect(() => {
    if (showDeleteDialog) {
      supabase.rpc('can_hard_delete_agent', { p_agent_id: agentId }).then(({ data }) => {
        const result = data as { can_delete?: boolean; blocked_until?: string } | null;
        setCanHardDelete(result?.can_delete ?? false);
        setDeleteBlockedUntil(result?.blocked_until ?? null);
      });
    }
  }, [showDeleteDialog, agentId]);

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
                  onClick={() => tenantId && resetSafeMode.mutate({ agentId, tenantId })}
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
              onClick={() => navigate(`/admin/diagnostics?agent=${agentId}`)}
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
              disabled={archiveMutation.isPending || hardDeleteMutation.isPending}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {(archiveMutation.isPending || hardDeleteMutation.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserX className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Arquivar ou excluir computador</TooltipContent>
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
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Computador: {agentName}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>Escolha uma opção para remover este computador do sistema:</p>
                
                {/* Opção 1: Arquivar */}
                <div className="border rounded-lg p-4 bg-muted/50">
                  <div className="flex items-start gap-3">
                    <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full">
                      <Trash2 className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground">Arquivar (Recomendado)</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Desativa o computador e remove da operação. Mantém registros de auditoria por conformidade.
                      </p>
                      <Button
                        onClick={() => archiveMutation.mutate()}
                        disabled={archiveMutation.isPending}
                        className="mt-3 w-full"
                        variant="outline"
                      >
                        {archiveMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Arquivar Computador
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Opção 2: Excluir definitivamente */}
                <div className="border rounded-lg p-4 border-destructive/30 bg-destructive/5">
                  <div className="flex items-start gap-3">
                    <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full">
                      <UserX className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground">Excluir Permanentemente</h4>
                      {canHardDelete === null ? (
                        <p className="text-sm text-muted-foreground mt-1">Verificando...</p>
                      ) : canHardDelete ? (
                        <>
                          <p className="text-sm text-muted-foreground mt-1">
                            Remove todos os dados permanentemente. Esta ação não pode ser desfeita.
                          </p>
                          <Button
                            onClick={() => hardDeleteMutation.mutate()}
                            disabled={hardDeleteMutation.isPending}
                            className="mt-3 w-full"
                            variant="destructive"
                          >
                            {hardDeleteMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Excluir Permanentemente
                          </Button>
                        </>
                      ) : (
                        <div className="mt-1">
                          <p className="text-sm text-amber-600">
                            ⚠️ Não disponível por conformidade
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Existem registros de auditoria recentes. A exclusão permanente estará disponível 
                            {deleteBlockedUntil ? ` após ${formatBrazilDateTime(deleteBlockedUntil, 'date')}` : ' em 30 dias'}.
                          </p>
                          <Button disabled className="mt-3 w-full" variant="outline">
                            Bloqueado por Auditoria
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
