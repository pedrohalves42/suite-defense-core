import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';

export const useIsAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const checkAdmin = async () => {
      logger.debug('useIsAdmin: Starting check', { userId: user?.id, authLoading });
      
      if (authLoading) {
        return;
      }
      
      if (!user) {
        logger.debug('useIsAdmin: No user, setting isAdmin=false');
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        // Check super_admin FIRST
        logger.debug('useIsAdmin: Checking super_admin role');
        const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'super_admin'
        });

        if (superAdminError) {
          logger.error('useIsAdmin: super_admin check error', superAdminError);
          throw superAdminError;
        }

        logger.debug('useIsAdmin: super_admin result', { isSuperAdmin });

        if (isSuperAdmin === true) {
          if (!isCancelled) {
            setIsAdmin(true);
            setLoading(false);
          }
          return;
        }

        // If not super admin, check regular admin role
        logger.debug('useIsAdmin: Checking admin role');
        const { data: isRegularAdmin, error: adminError } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });

        if (adminError) {
          logger.error('useIsAdmin: admin check error', adminError);
          throw adminError;
        }
        
        logger.debug('useIsAdmin: admin result', { isRegularAdmin });
        
        if (!isCancelled) {
          setIsAdmin(isRegularAdmin === true);
          setLoading(false);
        }
      } catch (error) {
        logger.error('useIsAdmin: Error checking admin status', error);
        if (!isCancelled) {
          setIsAdmin(false);
          setLoading(false);
        }
      }
    };

    // Add small delay to ensure auth state is stable
    const timeout = setTimeout(checkAdmin, 100);

    // Safety timeout to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      if (loading && !isCancelled) {
        logger.warn('useIsAdmin: Safety timeout triggered');
        setLoading(false);
      }
    }, 5000);

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
      clearTimeout(safetyTimeout);
    };
  }, [user, authLoading]);

  return { isAdmin, loading };
};
