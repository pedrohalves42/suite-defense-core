import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, RotateCw, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

/**
 * TokenAlerts — SEC-008 mitigation
 * Shows tokens expiring within 7 days with rotation option
 */

interface ExpiringToken {
  agentId: string;
  expiresAt: string;
  createdAt: string;
}

export function TokenAlerts() {
  const adaptiveInterval = useAdaptivePolling(3_600_000);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['expiring-tokens'],
    queryFn: async () => {
      const result = await callEdgeFunction<{
        needs_rotation: number;
        tokens: ExpiringToken[];
      }>('token-rotate', { action: 'needs-rotation' });
      return result;
    },
    refetchInterval: adaptiveInterval,
    staleTime: 30 * 60 * 1000,
  });

  const rotateMutation = useMutation({
    mutationFn: async ({ agentId, tenantId }: { agentId: string; tenantId: string }) => {
      return callEdgeFunction('token-rotate', {
        action: 'generate',
        agentId,
        tenantId,
      });
    },
    onSuccess: () => {
      toast.success('Token rotacionado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['expiring-tokens'] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao rotacionar: ${err.message}`);
    },
  });

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  const tokens = data?.tokens || [];

  if (tokens.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-cta-positive" />
            <span className="text-sm">Todos os tokens estão dentro do prazo de validade.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-warning/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-warning" />
          <CardTitle className="text-base">Tokens Expirando</CardTitle>
          <Badge variant="outline" className="text-warning border-warning/30">
            {tokens.length}
          </Badge>
        </div>
        <CardDescription>
          Tokens que expiram nos próximos 7 dias precisam ser rotacionados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tokens.map((token) => (
          <div
            key={token.agentId}
            className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Clock className="h-4 w-4 text-warning shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  Agente {token.agentId.slice(0, 8)}...
                </p>
                <p className="text-xs text-muted-foreground">
                  Expira {formatDistanceToNow(new Date(token.expiresAt), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={rotateMutation.isPending}
              onClick={() => rotateMutation.mutate({ agentId: token.agentId, tenantId: '' })}
            >
              <RotateCw className="h-3.5 w-3.5 mr-1" />
              Rotacionar
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
