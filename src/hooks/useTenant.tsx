import { useActiveTenant } from './useActiveTenant';

/**
 * Hook that returns the currently active tenant.
 * This is a wrapper around useActiveTenant for backwards compatibility.
 * All 66+ files using this hook will now correctly use the selected tenant.
 */
export const useTenant = () => {
  const { activeTenant, loading } = useActiveTenant();
  
  return { 
    tenant: activeTenant, 
    loading 
  };
};
