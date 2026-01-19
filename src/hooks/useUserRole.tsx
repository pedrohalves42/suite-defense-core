import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';
import { type AppRole, APP_ROLES } from '@/types/roles';

type UserRole = AppRole | null;

interface RoleResult {
  role: AppRole;
  tenant_id: string;
}

/**
 * V-205: Optimized useUserRole hook
 * Uses single get_user_roles RPC instead of 5 sequential has_role calls
 */
export const useUserRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkRole = async () => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        // V-205: Single RPC call replaces 5 sequential calls
        const { data: roles, error } = await supabase.rpc('get_user_roles', {
          _user_id: user.id
        }) as { data: RoleResult[] | null; error: Error | null };

        if (error) throw error;

        if (!roles || roles.length === 0) {
          setRole(null);
          setLoading(false);
          return;
        }

        // Priority order: super_admin > admin > analyst > operator > viewer
        const rolePriority: Record<AppRole, number> = {
          'super_admin': 1,
          'admin': 2,
          'analyst': 3,
          'operator': 4,
          'viewer': 5
        };

        // Find highest priority role
        const sortedRoles = roles.sort((a, b) => 
          (rolePriority[a.role] || 99) - (rolePriority[b.role] || 99)
        );

        setRole(sortedRoles[0].role);
      } catch (error) {
        logger.error('Error checking user role', error);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    checkRole();
  }, [user]);

  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin';
  const isAnalyst = role === 'analyst';
  const isOperator = role === 'operator';
  const isViewer = role === 'viewer';
  const canWrite = isSuperAdmin || isAdmin || isAnalyst || isOperator;

  return { role, isSuperAdmin, isAdmin, isAnalyst, isOperator, isViewer, canWrite, loading };
};
