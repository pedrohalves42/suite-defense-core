import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ShieldX } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { logger } from '@/lib/logger';
import { realtimeChannelManager } from '@/lib/realtime-manager';

interface BlockedAttemptPayload {
  id: string;
  agent_name: string;
  domain: string;
  attempted_at: string;
  tenant_id: string;
}

/**
 * Hook to listen for blocked access attempts in realtime.
 * Uses RealtimeChannelManager to optimize WebSocket usage.
 */
export function useBlockedAttemptsRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const lastNotificationRef = useRef<string | null>(null);
  const instanceId = useRef(`blocked-${Math.random().toString(36).substring(2, 9)}`).current;

  const handleNewAttempt = useCallback((payload: any) => {
    if (payload.eventType !== 'INSERT') return;
    
    const attempt = payload.new as BlockedAttemptPayload;
    
    // Avoid duplicate notifications for same attempt
    if (lastNotificationRef.current === attempt.id) return;
    lastNotificationRef.current = attempt.id;

    logger.info('[useBlockedAttemptsRealtime] New blocked attempt detected', { domain: attempt.domain });

    // Show toast notification
    toast.warning(`Acesso bloqueado: ${attempt.domain}`, {
      description: `Agente: ${attempt.agent_name}`,
      icon: <ShieldX className="h-4 w-4" />,
      duration: 5000,
    });

    // Invalidate queries to refresh stats
    queryClient.invalidateQueries({ queryKey: ['blocked-attempts'] });
  }, [queryClient]);

  useEffect(() => {
    if (!enabled || !tenant?.id) return;

    logger.debug('[useBlockedAttemptsRealtime] Subscribing via manager', { tenantId: tenant.id });

    realtimeChannelManager.subscribe(
      instanceId,
      'blocked_access_attempts',
      `tenant_id=eq.${tenant.id}`,
      handleNewAttempt,
      'public',
      tenant.id
    );

    return () => {
      logger.debug('[useBlockedAttemptsRealtime] Unsubscribing via manager', { tenantId: tenant.id });
      realtimeChannelManager.unsubscribe(instanceId, 'blocked_access_attempts', `tenant_id=eq.${tenant.id}`, 'public', tenant.id);
    };
  }, [enabled, tenant?.id, handleNewAttempt, instanceId]);
}
