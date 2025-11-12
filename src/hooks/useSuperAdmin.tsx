import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export const useSuperAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // CORREÇÃO: Flag para prevenir race condition
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

      try {
        const { data, error } = await supabase.rpc('is_super_admin', {
          _user_id: user.id
        });

        if (error) throw error;
        
        // CORREÇÃO: Só atualiza se não foi cancelado
        if (!isCancelled) {
          setIsSuperAdmin(data === true);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error checking super admin status:', error);
        }
        if (!isCancelled) {
          setIsSuperAdmin(false);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    checkSuperAdmin();

    // CORREÇÃO: Cleanup para prevenir memory leak
    return () => {
      isCancelled = true;
    };
  }, [user, authLoading]);

  return { isSuperAdmin, loading };
};
