import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

interface UserTenantRole {
  tenant_id: string;
  role: string;
  tenant: Tenant;
}

interface ActiveTenantContextType {
  tenants: Tenant[];
  activeTenant: Tenant | null;
  setActiveTenant: (tenant: Tenant) => void;
  loading: boolean;
  hasMultipleTenants: boolean;
}

const ActiveTenantContext = createContext<ActiveTenantContextType | undefined>(undefined);

const ACTIVE_TENANT_KEY = 'cybershield_active_tenant_id';

export const ActiveTenantProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTenantId, setActiveTenantId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(ACTIVE_TENANT_KEY);
    }
    return null;
  });

  // Fetch all tenants for the user
  const { data: userTenantRoles = [], isLoading } = useQuery({
    queryKey: ['user-tenants', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          tenant_id,
          role,
          tenant:tenants!fk_user_roles_tenant(*)
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      
      // Filter out any null tenants and deduplicate by tenant_id
      const uniqueTenants = new Map<string, UserTenantRole>();
      (data || []).forEach((role: any) => {
        if (role.tenant && !uniqueTenants.has(role.tenant_id)) {
          uniqueTenants.set(role.tenant_id, {
            tenant_id: role.tenant_id,
            role: role.role,
            tenant: role.tenant
          });
        }
      });

      return Array.from(uniqueTenants.values());
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const tenants = userTenantRoles.map(r => r.tenant);
  const hasMultipleTenants = tenants.length > 1;

  // Determine active tenant
  const activeTenant = (() => {
    if (tenants.length === 0) return null;
    
    // If we have a stored active tenant ID, find it
    if (activeTenantId) {
      const found = tenants.find(t => t.id === activeTenantId);
      if (found) return found;
    }
    
    // Default to first tenant
    return tenants[0];
  })();

  // Update localStorage when active tenant changes
  useEffect(() => {
    if (activeTenant) {
      localStorage.setItem(ACTIVE_TENANT_KEY, activeTenant.id);
    }
  }, [activeTenant?.id]);

  const setActiveTenant = useCallback((tenant: Tenant) => {
    const previousTenantId = activeTenantId;
    
    setActiveTenantId(tenant.id);
    localStorage.setItem(ACTIVE_TENANT_KEY, tenant.id);
    
    // Invalidate all queries to force refetch with new tenant
    if (previousTenantId !== tenant.id) {
      queryClient.invalidateQueries();
      toast.success(`Alterado para ${tenant.name}`, {
        description: 'Dados atualizados para a nova empresa'
      });
    }
  }, [activeTenantId, queryClient]);

  return (
    <ActiveTenantContext.Provider 
      value={{ 
        tenants, 
        activeTenant, 
        setActiveTenant, 
        loading: isLoading,
        hasMultipleTenants 
      }}
    >
      {children}
    </ActiveTenantContext.Provider>
  );
};

export const useActiveTenant = () => {
  const context = useContext(ActiveTenantContext);
  if (context === undefined) {
    throw new Error('useActiveTenant must be used within an ActiveTenantProvider');
  }
  return context;
};
