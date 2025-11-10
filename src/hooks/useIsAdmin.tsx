import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export const useIsAdmin = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      console.log('[useIsAdmin] Checking admin status for user:', user?.id);
      
      if (!user) {
        console.log('[useIsAdmin] No user found, setting isAdmin to false');
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        console.log('[useIsAdmin] Query result:', { data, error });

        if (error) {
          console.error('[useIsAdmin] RLS Policy Error:', error);
          throw error;
        }
        
        const isAdminRole = data?.role === 'admin';
        console.log('[useIsAdmin] Is admin:', isAdminRole);
        setIsAdmin(isAdminRole);
      } catch (error) {
        console.error('[useIsAdmin] Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [user]);

  return { isAdmin, loading };
};
