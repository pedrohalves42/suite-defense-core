import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ShieldX } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { logger } from '@/lib/logger';

interface BlockedAttemptPayload {
  id: string;
  agent_name: string;
  domain: string;
  attempted_at: string;
  tenant_id: string;
}

export function useBlockedAttemptsRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const lastNotificationRef = useRef<string | null>(null);

  const handleNewAttempt = useCallback((payload: { new: BlockedAttemptPayload }) => {
    const attempt = payload.new;
    
    // Avoid duplicate notifications for same attempt
    if (lastNotificationRef.current === attempt.id) return;
    lastNotificationRef.current = attempt.id;

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

    const channel = supabase
      .channel(`blocked-attempts-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'blocked_access_attempts',
          filter: `tenant_id=eq.${tenant.id}`
        },
        handleNewAttempt
      )
      .subscribe((status) => {
        console.log('[useBlockedAttemptsRealtime] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, tenant?.id, handleNewAttempt]);
}
