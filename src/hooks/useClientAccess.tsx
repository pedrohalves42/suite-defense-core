import { useUserRole } from './useUserRole';
import { useTenant } from './useTenant';

export const useClientAccess = () => {
  const { role, isViewer, isOperator, isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();
  const { tenant, loading: tenantLoading } = useTenant();

  // Client users are viewers or operators (not admins)
  const isClientUser = isViewer || isOperator;
  const canCreateBasicJobs = isOperator || isAdmin || isSuperAdmin;
  const canViewOnly = isViewer;

  return {
    role,
    tenant,
    isClientUser,
    canCreateBasicJobs,
    canViewOnly,
    loading: roleLoading || tenantLoading,
  };
};
