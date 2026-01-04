import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useTenant } from './useTenant';
import { logger } from '@/lib/logger';

export interface SegregationRule {
  requires_approval: boolean;
  min_approvers: number;
  required_roles: string[];
  exclude_requester: boolean;
  requester_role: string | null;
}

export interface SegregationCheckResult {
  rule: SegregationRule | null;
  canProceed: boolean;
  needsApproval: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Hook para verificar regras de segregação de funções (Two-Man-Rule)
 * Usado antes de executar ações críticas
 */
export const useSegregationCheck = () => {
  const { user } = useAuth();
  const { tenant: currentTenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Verifica se uma ação requer aprovação adicional
   */
  const checkAction = useCallback(async (
    actionType: string
  ): Promise<SegregationCheckResult> => {
    if (!user?.id || !currentTenant?.id) {
      return {
        rule: null,
        canProceed: false,
        needsApproval: false,
        loading: false,
        error: 'User or tenant not available',
      };
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('check_segregation_rule', {
        _tenant_id: currentTenant.id,
        _action_type: actionType,
        _requester_id: user.id,
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      const rule = data as unknown as SegregationRule;
      
      logger.debug('useSegregationCheck: Rule fetched', {
        actionType,
        rule,
      });

      return {
        rule,
        canProceed: !rule.requires_approval,
        needsApproval: rule.requires_approval,
        loading: false,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check segregation rule';
      logger.error('useSegregationCheck: Error', err);
      setError(errorMessage);
      
      return {
        rule: null,
        canProceed: false,
        needsApproval: true, // Seguro por padrão
        loading: false,
        error: errorMessage,
      };
    } finally {
      setLoading(false);
    }
  }, [user?.id, currentTenant?.id]);

  /**
   * Verifica múltiplas ações de uma vez
   */
  const checkActions = useCallback(async (
    actionTypes: string[]
  ): Promise<Map<string, SegregationCheckResult>> => {
    const results = new Map<string, SegregationCheckResult>();
    
    await Promise.all(
      actionTypes.map(async (actionType) => {
        const result = await checkAction(actionType);
        results.set(actionType, result);
      })
    );

    return results;
  }, [checkAction]);

  return {
    checkAction,
    checkActions,
    loading,
    error,
  };
};
