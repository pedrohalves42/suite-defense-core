/**
 * AgentAuthFailureAlert - Shows probable cause for never_connected agents
 * Displays clock sync issues and other auth failures with actionable guidance
 */

import { AlertTriangle, Clock, RefreshCw, HelpCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, ptBR } from '@/lib/date-utils';

interface AgentAuthFailureAlertProps {
  agentId: string;
  agentName: string;
}

interface AuthFailureEvent {
  id: string;
  created_at: string;
  event_data: {
    errorCode: string;
    errorMessage: string;
    skewSeconds?: number;
    serverTimeMs?: number;
    ip?: string;
  };
}

export function AgentAuthFailureAlert({ agentId, agentName }: AgentAuthFailureAlertProps) {
  const { data: authFailure, isLoading } = useQuery({
    queryKey: ['agent-auth-failure', agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_evidence_logs')
        .select('id, created_at, event_data')
        .eq('agent_id', agentId)
        .eq('event_type', 'auth_failure')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as AuthFailureEvent | null;
    },
    enabled: !!agentId,
    staleTime: 30000, // 30 seconds
  });

  if (isLoading || !authFailure) {
    return null;
  }

  const eventData = authFailure.event_data;
  const isClockSkew = eventData.errorCode === 'AUTH_TIMESTAMP_OUT_OF_RANGE';
  const lastAttempt = format(new Date(authFailure.created_at), "dd/MM HH:mm", { locale: ptBR });

  return (
    <Alert variant="destructive" className="mt-3 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        Causa provável identificada
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>O agente está tentando se conectar, mas a autenticação está falhando. Isso impede o registro de heartbeat.</p>
          </TooltipContent>
        </Tooltip>
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        {isClockSkew ? (
          <>
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <Clock className="h-4 w-4" />
              <span className="font-medium">Relógio do computador fora de sincronia</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Diferença detectada: {eventData.skewSeconds?.toFixed(0) || '?'} segundos (máximo permitido: 300s)
            </p>
            <div className="mt-3 p-2 bg-muted/50 rounded text-xs space-y-1">
              <p className="font-medium">Como corrigir:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                <li>No PC, abra o Prompt de Comando como Administrador</li>
                <li>Execute: <code className="bg-muted px-1 rounded">w32tm /resync /force</code></li>
                <li>Verifique o fuso horário nas Configurações do Windows</li>
                <li>Aguarde 1-2 minutos e verifique novamente</li>
              </ol>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">{eventData.errorMessage || 'Falha de autenticação'}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Código: {eventData.errorCode}
            </p>
          </>
        )}
        <p className="text-xs text-muted-foreground pt-2 border-t">
          Última tentativa: {lastAttempt} • IP: {eventData.ip || 'N/A'}
        </p>
      </AlertDescription>
    </Alert>
  );
}
