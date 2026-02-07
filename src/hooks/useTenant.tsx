import { useActiveTenant } from './useActiveTenant';

/**
 * Hook that returns the currently active tenant and role.
 * This is a wrapper around useActiveTenant for backwards compatibility.
 * All 66+ files using this hook will now correctly use the selected tenant.
 * 
 * CORREÇÃO: Agora também expõe activeRole para consistência
 */
export const useTenant = () => {
  const { activeTenant, activeRole, loading } = useActiveTenant();
  
  return { 
    tenant: activeTenant, 
    role: activeRole, // NOVO: expor role do tenant ativo
    loading 
  };
};
