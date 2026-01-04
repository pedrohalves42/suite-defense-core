import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { useUserRole } from './useUserRole';
import { useMFA } from './useMFA';
import { logger } from '@/lib/logger';

export interface MFAPolicy {
  require_mfa_all_users: boolean;
  require_mfa_roles: string[];
  mfa_grace_period_hours: number;
}

export interface TenantMFAStatus {
  policy: MFAPolicy | null;
  requiresMFA: boolean;
  hasMFA: boolean;
  isCompliant: boolean;
  isInGracePeriod: boolean;
  gracePeriodEndsAt: Date | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_POLICY: MFAPolicy = {
  require_mfa_all_users: false,
  require_mfa_roles: ['admin', 'super_admin'],
  mfa_grace_period_hours: 72,
};

/**
 * Hook para verificar política de MFA do tenant
 * Suporta MFA obrigatório para todos ou por role específico
 */
export const useTenantMFAPolicy = (): TenantMFAStatus => {
  const { tenant: currentTenant, loading: tenantLoading } = useTenant();
  const { role, loading: roleLoading } = useUserRole();
  const { hasMFA, loading: mfaLoading } = useMFA();
  
  const [policy, setPolicy] = useState<MFAPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchPolicy = async () => {
      if (tenantLoading || !currentTenant?.id) {
        return;
      }

      try {
        setLoading(true);
        
        const { data, error: rpcError } = await supabase.rpc('get_tenant_mfa_policy', {
          _tenant_id: currentTenant.id,
        });

        if (rpcError) {
          throw new Error(rpcError.message);
        }

        if (!cancelled) {
          setPolicy((data as unknown as MFAPolicy) || DEFAULT_POLICY);
          setError(null);
        }
      } catch (err) {
        logger.error('Failed to fetch tenant MFA policy', err);
        if (!cancelled) {
          setPolicy(DEFAULT_POLICY);
          setError(err instanceof Error ? err.message : 'Failed to load MFA policy');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchPolicy();

    return () => {
      cancelled = true;
    };
  }, [currentTenant?.id, tenantLoading]);

  const status = useMemo(() => {
    const isLoading = loading || tenantLoading || roleLoading || mfaLoading;
    
    if (isLoading || !policy || !role) {
      return {
        policy,
        requiresMFA: false,
        hasMFA,
        isCompliant: true,
        isInGracePeriod: false,
        gracePeriodEndsAt: null,
        loading: isLoading,
        error,
      };
    }

    // Verificar se MFA é obrigatório para este usuário
    const requiresMFA = 
      policy.require_mfa_all_users || 
      policy.require_mfa_roles.includes(role);

    // Verificar período de graça (baseado na criação do usuário)
    // Por simplicidade, consideramos que não está em período de graça se MFA é obrigatório
    const isInGracePeriod = false;
    const gracePeriodEndsAt: Date | null = null;

    const isCompliant = !requiresMFA || hasMFA;

    logger.debug('useTenantMFAPolicy: Status', {
      requiresMFA,
      hasMFA,
      isCompliant,
      role,
      policy,
    });

    return {
      policy,
      requiresMFA,
      hasMFA,
      isCompliant,
      isInGracePeriod,
      gracePeriodEndsAt,
      loading: false,
      error,
    };
  }, [policy, role, hasMFA, loading, tenantLoading, roleLoading, mfaLoading, error]);

  return status;
};
