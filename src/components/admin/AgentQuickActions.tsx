import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Trash2, Key, Stethoscope, Loader2, Clock, ShieldOff } from 'lucide-react';
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
}

export function AgentQuickActions({ 
  agentId, 
  agentName,
  isThrottled,
  isIsolated,
}: AgentQuickActionsProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const { removeThrottle, removeIsolation } = useAgentActions();

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
        title: 'Agente limpo com sucesso',
        description: `Tokens invalidados: ${result.tokens_invalidated || 0}, Jobs removidos: ${result.jobs_deleted || 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['problematic-agents'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao limpar agente',
        description: error.message,
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
            <TooltipContent>Remover Throttle</TooltipContent>
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
            <TooltipContent>Remover Isolamento</TooltipContent>
          </Tooltip>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/admin/agent-diagnostics?agent=${agentId}`)}
          title="Ver Diagnóstico"
        >
          <Stethoscope className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/enrollment-keys')}
          title="Gerar Nova Key"
        >
          <Key className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCleanupDialog(true)}
          title="Limpar Agente"
          disabled={cleanupMutation.isPending}
        >
          {cleanupMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      <AlertDialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar Agente Problemático</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Invalidar todos os tokens do agente <strong>{agentName}</strong></li>
                <li>Remover jobs pendentes/entregues</li>
                <li>Resetar o status para "pending"</li>
              </ul>
              <p className="mt-3 text-destructive font-medium">
                O agente precisará ser reinstalado com uma nova enrollment key.
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
    </>
  );
}
