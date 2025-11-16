import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export const useIsAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const checkAdmin = async () => {
      if (authLoading) {
        setLoading(true);
        return;
      }
      
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        // CRITICAL: Super admin IS admin (principle: super admin has all admin privileges)
        // Check super_admin FIRST
        const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'super_admin'
        });

        if (superAdminError) throw superAdminError;

        if (isSuperAdmin === true) {
          if (!isCancelled) {
            setIsAdmin(true);
            setLoading(false);
          }
          return;
        }

        // If not super admin, check regular admin role
        const { data: isRegularAdmin, error: adminError } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });

        if (adminError) throw adminError;
        
        if (!isCancelled) {
          setIsAdmin(isRegularAdmin === true);
        }
      } catch (error) {
        if (!isCancelled) {
          setIsAdmin(false);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    checkAdmin();

    return () => {
      isCancelled = true;
    };
  }, [user, authLoading]);

  return { isAdmin, loading };
};
