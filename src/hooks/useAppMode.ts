import { useMemo } from 'react';
import { useActiveTenant } from './useActiveTenant';

export type AppMode = 'FULL' | 'EXT' | 'LOADING';

/**
 * Hook para determinar o modo de aplicação baseado na role do usuário NO TENANT ATIVO
 * - FULL: Super Admin ou Admin no tenant ativo - acesso completo ao painel
 * - EXT: Viewer, Operator ou Analyst no tenant ativo - acesso limitado
 * - LOADING: Ainda carregando dados de autenticação/tenant
 * 
 * CORREÇÃO: Usa activeRole do useActiveTenant ao invés de useUserRole (role global)
 * Isso garante que o modo seja determinado pela role no contexto atual
 */
export function useAppMode() {
  const { activeRole, activeTenant, loading: tenantLoading } = useActiveTenant();

  const mode: AppMode = useMemo(() => {
    // Se ainda está carregando, retorna LOADING
    if (tenantLoading) return 'LOADING';
    
    // CORREÇÃO: Usar role do tenant ATIVO, não role global
    // Super Admin e Admin no tenant ativo têm acesso FULL
    if (activeRole === 'super_admin' || activeRole === 'admin') return 'FULL';
    
    // Outros roles (viewer, operator, analyst) usam modo EXT
    return 'EXT';
  }, [tenantLoading, activeRole]);

  return { 
    mode, 
    isFullMode: mode === 'FULL',
    isExtMode: mode === 'EXT',
    isLoading: mode === 'LOADING',
    tenant: activeTenant
  };
}
