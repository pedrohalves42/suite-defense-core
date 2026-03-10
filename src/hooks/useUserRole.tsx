import { useMemo } from 'react';
import { useActiveTenant } from './useActiveTenant';
import { type AppRole } from '@/types/roles';

/**
 * V-701 FIX: useUserRole now delegates to useActiveTenant's activeRole
 * This ensures the role is ALWAYS scoped to the active tenant context,
 * preventing cross-tenant privilege escalation.
 * 
 * Previously used global get_user_roles RPC which returned the highest
 * priority role across ALL tenants — violating INV-006.
 */
export const useUserRole = () => {
  const { activeRole, loading } = useActiveTenant();

  const derived = useMemo(() => {
    const role = activeRole;
    const isSuperAdmin = role === 'super_admin';
    const isAdmin = role === 'admin';
    const isAnalyst = role === 'analyst';
    const isOperator = role === 'operator';
    const isViewer = role === 'viewer';
    const canWrite = isSuperAdmin || isAdmin || isAnalyst || isOperator;

    return { role, isSuperAdmin, isAdmin, isAnalyst, isOperator, isViewer, canWrite };
  }, [activeRole]);

  return { ...derived, loading };
};
