import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export const useIsAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      console.log('[useIsAdmin] Starting check, user:', user?.id, user?.email, 'authLoading:', authLoading);

      // Aguarda a autenticação finalizar antes de decidir
      if (authLoading) {
        console.log('[useIsAdmin] Auth still loading; delaying admin check');
        setLoading(true);
        return;
      }
      
      if (!user) {
        console.log('[useIsAdmin] No user after auth loaded, setting isAdmin=false');
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        console.log('[useIsAdmin] Calling has_role RPC for user:', user.id);
        
        const { data, error } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });

        if (error) {
          console.error('[useIsAdmin] ❌ Error calling has_role:', error);
          throw error;
        }
        
        console.log('[useIsAdmin] RPC has_role returned:', data, 'Type:', typeof data);
        setIsAdmin(data === true);
        console.log('[useIsAdmin] ✅ Final isAdmin value:', data === true);
      } catch (error) {
        console.error('[useIsAdmin] ❌ Exception checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
        console.log('[useIsAdmin] Loading complete');
      }
    };

    checkAdmin();
  }, [user, authLoading]);

  return { isAdmin, loading };
};
