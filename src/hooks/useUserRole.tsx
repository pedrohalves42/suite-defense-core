import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppRole } from '@/types/roles';
import { logger } from '@/lib/logger';

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRole() {
      if (authLoading) return;
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      // Check global super_admin first
      if (user.app_metadata?.is_super_admin === true) {
        setRole('super_admin');
        setLoading(false);
        return;
      }

      try {
        const activeTenantId = user.app_metadata?.active_tenant_id;
        if (!activeTenantId) {
          setRole(null);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('tenant_id', activeTenantId)
          .single();

        if (error) {
          if (error.code !== 'PGRST116') { // Not found is okay
            logger.error('[useUserRole] Error fetching role', error);
          }
          setRole(null);
        } else {
          setRole(data?.role as AppRole);
        }
      } catch (err) {
        logger.error('[useUserRole] Unexpected error', err);
        setRole(null);
      } finally {
        setLoading(false);
      }
    }

    fetchRole();
  }, [user, authLoading]);

  return {
    role,
    isAdmin: role === 'admin' || role === 'super_admin',
    isSuperAdmin: role === 'super_admin',
    loading: authLoading || loading,
  };
}
