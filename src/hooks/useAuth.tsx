import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(true);

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;

    const updateLoading = (value: boolean) => {
      loadingRef.current = value;
      if (isMounted) setLoading(value);
    };

    // Safety timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (loadingRef.current && isMounted) {
        logger.warn('Auth loading timeout - forcing completion');
        updateLoading(false);
      }
    }, 10000);

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      logger.debug('Auth state changed', { event: _event, hasSession: !!session });
      if (isMounted) {
        setUser(session?.user ?? null);
        updateLoading(false);
      }
    });

    const fetchSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (error) {
          logger.error('Error fetching session', error);

          if (error?.message?.includes('issued in the future')) {
            const match = error.message.match(/(\d+)\s+(\d+)\s+(\d+)/);
            if (match) {
              const [, , current, now] = match.map(Number);
              const skewSeconds = Math.abs(current - now);
              if (skewSeconds > 60) {
                toast({
                  title: 'Relógio do Sistema Dessincronizado',
                  description: `Diferença de ${Math.floor(skewSeconds / 60)} minutos detectada.`,
                  variant: 'destructive',
                  duration: 10000,
                });
              }
            }
          }

          if (retryCount < 2) {
            retryCount += 1;
            setTimeout(fetchSession, 1000 * retryCount);
            return;
          }
        }

        logger.debug('Initial session retrieved', { hasSession: !!session });
        setUser(session?.user ?? null);
        updateLoading(false);
      } catch (err) {
        logger.error('Unexpected error in useAuth', err);
        updateLoading(false);
      }
    };

    fetchSession();

    // Proactive token refresh before expiration
    const checkAndRefreshToken = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.expires_at) return;

      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = session.expires_at - now;

      if (timeUntilExpiry < 600) {
        logger.info('Token expiring soon, refreshing proactively', {
          time_until_expiry: timeUntilExpiry,
        });
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          logger.error('Failed to refresh token', error);
          toast({
            title: 'Sessao expirada',
            description: 'Por favor, faca login novamente.',
            variant: 'destructive',
          });
        } else {
          logger.info('Token refreshed successfully');
        }
      }
    };

    const tokenCheckInterval = setInterval(checkAndRefreshToken, 120000);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      clearInterval(tokenCheckInterval);
      clearTimeout(loadingTimeout);
    };
  }, []);

  return { user, loading };
};
