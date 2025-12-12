import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Trash2, Key, Stethoscope, Loader2 } from 'lucide-react';
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

interface AgentQuickActionsProps {
  agentId: string;
  agentName: string;
}

export function AgentQuickActions({ agentId, agentName }: AgentQuickActionsProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);

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
