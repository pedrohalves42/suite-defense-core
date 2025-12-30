/**
 * OfflineAgentActions - Ações para agentes offline
 * 
 * Exibe botões de ação específicos para agentes que estão offline,
 * como verificar serviço, agendar diagnóstico, etc.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stethoscope, Clock, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { prepareJobForInsert } from '@/lib/job-utils';

interface OfflineAgentActionsProps {
  agentId: string;
  agentName: string;
  tenantId: string;
  secondsOffline: number;
}

export function OfflineAgentActions({
  agentId,
  agentName,
  tenantId,
  secondsOffline,
}: OfflineAgentActionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Verificar se já existe job pendente para este agente
  const { data: hasPendingCheck } = useQuery({
    queryKey: ['pending-service-check', agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id')
        .eq('agent_id', agentId)
        .eq('type', 'service_health_check')
        .eq('status', 'pending')
        .limit(1);
      
      if (error) throw error;
      return data && data.length > 0;
    },
    staleTime: 30000,
  });

  // Mutation para criar job de verificação de serviço
  const createServiceCheck = useMutation({
    mutationFn: async () => {
      const job = {
        id: crypto.randomUUID(),
        agent_name: agentName,
        agent_id: agentId,
        tenant_id: tenantId,
        type: 'service_health_check',
        status: 'pending',
        approved: true,
        payload: {
          check_types: ['service_status', 'connectivity', 'heartbeat_test'],
          requested_at: new Date().toISOString(),
          requested_by: 'admin_ui',
          offline_duration_seconds: secondsOffline,
        },
        priority: 10,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const jobWithHash = await prepareJobForInsert(job);
      const { error } = await supabase.from('jobs').insert(jobWithHash);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Verificação agendada',
        description: 'A verificação será executada quando o computador reconectar.',
      });
      queryClient.invalidateQueries({ queryKey: ['pending-service-check', agentId] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao agendar verificação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Formatar tempo offline
  const getOfflineText = () => {
    if (secondsOffline < 3600) {
      return `${Math.floor(secondsOffline / 60)}min`;
    } else if (secondsOffline < 86400) {
      return `${Math.floor(secondsOffline / 3600)}h`;
    } else {
      return `${Math.floor(secondsOffline / 86400)}d`;
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {hasPendingCheck ? (
        <Badge variant="outline" className="text-xs bg-muted/50">
          <Clock className="w-3 h-3 mr-1" />
          Verificação agendada
        </Badge>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => createServiceCheck.mutate()}
                disabled={createServiceCheck.isPending}
                className="h-7 text-xs"
              >
                {createServiceCheck.isPending ? (
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Stethoscope className="w-3 h-3 mr-1" />
                )}
                Verificar Serviço
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs">
                Cria uma tarefa que será executada quando o computador reconectar. 
                Verifica se o serviço do agente está instalado e funcionando.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      <Badge variant="secondary" className="text-xs">
        Offline há {getOfflineText()}
      </Badge>
    </div>
  );
}
