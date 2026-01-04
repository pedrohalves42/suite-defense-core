import { useMemo } from 'react';
import { useUserRole } from './useUserRole';
import { useMFA } from './useMFA';
import { logger } from '@/lib/logger';

export interface MFAEnforcementStatus {
  requiresMFA: boolean;
  hasMFA: boolean;
  isCompliant: boolean;
  loading: boolean;
  role: string | null;
}

/**
 * Hook para verificar se o usuário precisa configurar MFA
 * Baseado na política de segurança ADR-008: Admins e Super Admins devem ter MFA
 */
export const useMFAEnforcement = (): MFAEnforcementStatus => {
  const { role, isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();
  const { hasMFA, loading: mfaLoading } = useMFA();

  const status = useMemo(() => {
    const requiresMFA = isAdmin || isSuperAdmin;
    const isCompliant = !requiresMFA || hasMFA;
    
    // Only consider loaded when both hooks have finished
    const loading = roleLoading || mfaLoading;

    logger.debug('useMFAEnforcement: Status', { 
      requiresMFA, 
      hasMFA, 
      isCompliant, 
      loading,
      roleLoading,
      mfaLoading,
      role 
    });

    return {
      requiresMFA,
      hasMFA,
      isCompliant,
      loading,
      role,
    };
  }, [role, isAdmin, isSuperAdmin, hasMFA, roleLoading, mfaLoading]);

  return status;
};
