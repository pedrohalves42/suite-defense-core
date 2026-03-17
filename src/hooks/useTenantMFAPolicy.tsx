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
  grace_exempt_roles: string[];
}

export interface TenantMFAStatus {
  policy: MFAPolicy | null;
  requiresMFA: boolean;
  hasMFA: boolean;
  isCompliant: boolean;
  isInGracePeriod: boolean;
  gracePeriodEndsAt: Date | null;
  isBreakGlassUser: boolean;
  breakGlassEnabled: boolean;
  loading: boolean;
  error: string | null;
}

const DEFAULT_POLICY: MFAPolicy = {
  require_mfa_all_users: false,
  require_mfa_roles: ['admin', 'super_admin'],
  mfa_grace_period_hours: 72,
  grace_exempt_roles: ['service_account'],
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
  const [isBreakGlassUser, setIsBreakGlassUser] = useState(false);
  const [breakGlassEnabled, setBreakGlassEnabled] = useState(false);
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
        
        // Fetch MFA policy
        const { data, error: rpcError } = await supabase.rpc('get_tenant_mfa_policy', {
          _tenant_id: currentTenant.id,
        });

        if (rpcError) {
          throw new Error(rpcError.message);
        }

        // Check if current user is break glass user
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: breakGlassData } = await supabase.rpc('is_break_glass_user', {
            _user_id: user.id,
            _tenant_id: currentTenant.id,
          });
          
          if (!cancelled) {
            setIsBreakGlassUser(!!breakGlassData);
          }
        }

        // Check if break glass is enabled for tenant
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('break_glass_enabled')
          .eq('id', currentTenant.id)
          .maybeSingle();

        if (!cancelled) {
          setBreakGlassEnabled(tenantData?.break_glass_enabled || false);
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
        isBreakGlassUser,
        breakGlassEnabled,
        loading: isLoading,
        error,
      };
    }

    // Break glass users bypass MFA requirements
    if (isBreakGlassUser && breakGlassEnabled) {
      logger.debug('useTenantMFAPolicy: Break glass user - MFA bypassed');
      return {
        policy,
        requiresMFA: false,
        hasMFA,
        isCompliant: true,
        isInGracePeriod: false,
        gracePeriodEndsAt: null,
        isBreakGlassUser: true,
        breakGlassEnabled: true,
        loading: false,
        error,
      };
    }

    // Check if role is exempt from MFA
    const isExemptRole = policy.grace_exempt_roles?.includes(role) || false;

    // Verificar se MFA é obrigatório para este usuário
    const requiresMFA = !isExemptRole && (
      policy.require_mfa_all_users || 
      policy.require_mfa_roles.includes(role)
    );

    // Verificar período de graça (baseado na criação do usuário)
    // Por simplicidade, consideramos que não está em período de graça se MFA é obrigatório
    const isInGracePeriod = false;
    const gracePeriodEndsAt: Date | null = null;

    const isCompliant = !requiresMFA || hasMFA;

    logger.debug('useTenantMFAPolicy: Status', {
      requiresMFA,
      hasMFA,
      isCompliant,
      isExemptRole,
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
      isBreakGlassUser,
      breakGlassEnabled,
      loading: false,
      error,
    };
  }, [policy, role, hasMFA, loading, tenantLoading, roleLoading, mfaLoading, error, isBreakGlassUser, breakGlassEnabled]);

  return status;
};
