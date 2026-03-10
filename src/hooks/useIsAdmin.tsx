import { useMemo } from 'react';
import { useActiveTenant } from './useActiveTenant';

/**
 * V-704 FIX: useIsAdmin now delegates to useActiveTenant's activeRole
 * Previously called global has_role('admin') which ignored tenant context,
 * granting admin UI access in tenants where user was only a viewer.
 * 
 * Now returns true ONLY if user is admin or super_admin in the ACTIVE tenant.
 */
export const useIsAdmin = () => {
  const { activeRole, loading } = useActiveTenant();

  const isAdmin = useMemo(() => {
    return activeRole === 'admin' || activeRole === 'super_admin';
  }, [activeRole]);

  return { isAdmin, loading };
};
