import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';

export const useSuperAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // CORRECAO: Flag para prevenir race condition
    let isCancelled = false;

    const checkSuperAdmin = async () => {
      if (authLoading) {
        setLoading(true);
        return;
      }
      
      if (!user) {
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      // V-FIX: Prefer JWT claim if available to avoid unnecessary RPC
      if (user.app_metadata?.is_super_admin === true) {
        setIsSuperAdmin(true);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('is_super_admin', {
          _user_id: user.id
        });

        if (error) {
          // If 403, might be a stale session or RLS lag, we check app_metadata again
          if (error.code === '42501' && user.app_metadata?.is_super_admin === true) {
            setIsSuperAdmin(true);
            setLoading(false);
            return;
          }
          logger.error('RPC is_super_admin failed', error);
          throw new Error(`Failed to verify super admin status: ${error.message}`);
        }
        
        if (!isCancelled) {
          setIsSuperAdmin(data === true);
          setError(null);
        }
      } catch (error) {
        logger.error('Error checking super admin status', error);
        if (!isCancelled) {
          setIsSuperAdmin(false);
          setError(error instanceof Error ? error.message : 'Unknown error checking super admin status');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    checkSuperAdmin();

    // CORRECAO: Cleanup para prevenir memory leak
    return () => {
      isCancelled = true;
    };
  }, [user, authLoading]);

  return { isSuperAdmin, loading, error };
};
