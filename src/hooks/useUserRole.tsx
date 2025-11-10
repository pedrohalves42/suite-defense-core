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
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        // Check roles in priority order using RPC to avoid RLS issues
        const { data: isAdmin, error: adminError } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });

        if (adminError) throw adminError;
        if (isAdmin === true) {
          setRole('admin');
          setLoading(false);
          return;
        }

        const { data: isOperator, error: operatorError } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'operator'
        });

        if (operatorError) throw operatorError;
        if (isOperator === true) {
          setRole('operator');
          setLoading(false);
          return;
        }

        const { data: isViewer, error: viewerError } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'viewer'
        });

        if (viewerError) throw viewerError;
        if (isViewer === true) {
          setRole('viewer');
          setLoading(false);
          return;
        }

        setRole(null);
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
