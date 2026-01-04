import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Proactive token refresh before expiration
  const checkAndRefreshToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) return;

    const expiresAt = session.expires_at;
    if (!expiresAt) return;

    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = expiresAt - now;

    // Refresh token if less than 5 minutes until expiration
    if (timeUntilExpiry < 300) {
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

  useEffect(() => {
    // Safety timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        logger.warn('Auth loading timeout - forcing completion');
        setLoading(false);
      }
    }, 5000);

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error?.message?.includes('issued in the future')) {
        const match = error.message.match(/(\d+)\s+(\d+)\s+(\d+)/);
        if (match) {
          const [_, issued, current, now] = match.map(Number);
          const skewSeconds = Math.abs(current - now);
          
          if (skewSeconds > 60) {
            toast({
              title: 'Relogio do Sistema Dessincronizado',
              description: `Diferenca de ${Math.floor(skewSeconds / 60)} minutos detectada.`,
              variant: 'destructive',
              duration: 10000,
            });
          }
        }
      }
      
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Check token expiration every 2 minutes
    const tokenCheckInterval = setInterval(checkAndRefreshToken, 120000);

    return () => {
      subscription.unsubscribe();
      clearInterval(tokenCheckInterval);
      clearTimeout(loadingTimeout);
    };
  }, []);

  return { user, loading };
};
