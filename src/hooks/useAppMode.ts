import { useMemo } from 'react';
import { useUserRole } from './useUserRole';
import { useTenant } from './useTenant';

export type AppMode = 'FULL' | 'EXT' | 'LOADING';

/**
 * Hook para determinar o modo de aplicação baseado na role do usuário
 * - FULL: Super Admin ou Admin - acesso completo ao painel
 * - EXT: Viewer ou Operator - acesso limitado
 * - LOADING: Ainda carregando dados de autenticação/tenant
 */
export function useAppMode() {
  const { isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();
  const { tenant, loading: tenantLoading } = useTenant();

  const mode: AppMode = useMemo(() => {
    // Se ainda está carregando, retorna LOADING
    if (roleLoading || tenantLoading) return 'LOADING';
    
    // Super Admin e Admin têm acesso FULL
    if (isSuperAdmin || isAdmin) return 'FULL';
    
    // Outros roles (viewer, operator, analyst) usam modo EXT
    return 'EXT';
  }, [roleLoading, tenantLoading, isAdmin, isSuperAdmin]);

  return { 
    mode, 
    isFullMode: mode === 'FULL',
    isExtMode: mode === 'EXT',
    isLoading: mode === 'LOADING',
    tenant
  };
}
