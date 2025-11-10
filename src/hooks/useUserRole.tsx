import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type UserRole = 'admin' | 'operator' | 'viewer' | null;

export const useUserRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkRole = async () => {
      console.log('[useUserRole] Checking role for user:', user?.id);
      
      if (!user) {
        console.log('[useUserRole] No user found, setting role to null');
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        console.log('[useUserRole] Query result:', { data, error });

        if (error) {
          console.error('[useUserRole] RLS Policy Error:', error);
          throw error;
        }
        
        const userRole = data?.role as UserRole;
        console.log('[useUserRole] User role:', userRole);
        setRole(userRole);
      } catch (error) {
        console.error('[useUserRole] Error checking user role:', error);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    checkRole();
  }, [user]);

  const isAdmin = role === 'admin';
  const isOperator = role === 'operator';
  const isViewer = role === 'viewer';
  const canWrite = isAdmin || isOperator;

  return { role, isAdmin, isOperator, isViewer, canWrite, loading };
};
