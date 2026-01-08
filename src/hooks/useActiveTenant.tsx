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
  setActiveTenant: (tenant: Tenant) => Promise<void>;
  loading: boolean;
  hasMultipleTenants: boolean;
}

const ActiveTenantContext = createContext<ActiveTenantContextType | undefined>(undefined);

const ACTIVE_TENANT_KEY = 'cybershield_active_tenant_id';

/**
 * Syncs the active tenant to the backend, updating the user's JWT app_metadata.
 * This ensures RLS policies can optionally use active_tenant_id for stricter isolation.
 */
async function syncActiveTenantToBackend(tenantId: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('set-active-tenant', {
      body: { tenant_id: tenantId }
    });

    if (error) {
      console.error('[syncActiveTenantToBackend] Edge function error:', error);
      return false;
    }

    // Refresh session to get updated JWT with active_tenant_id
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.warn('[syncActiveTenantToBackend] Session refresh warning:', refreshError);
      // Non-blocking - continue even if refresh fails
    }

    return true;
  } catch (err) {
    console.error('[syncActiveTenantToBackend] Unexpected error:', err);
    return false;
  }
}

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

  // Sync initial tenant to backend when user logs in
  useEffect(() => {
    if (activeTenant && user) {
      // Sync on initial load (non-blocking)
      syncActiveTenantToBackend(activeTenant.id);
    }
  }, [activeTenant?.id, user?.id]);

  const setActiveTenant = useCallback(async (tenant: Tenant) => {
    const previousTenantId = activeTenantId;
    
    // Update local state immediately for responsive UI
    setActiveTenantId(tenant.id);
    localStorage.setItem(ACTIVE_TENANT_KEY, tenant.id);
    
    if (previousTenantId !== tenant.id) {
      // Sync to backend (updates JWT app_metadata)
      const synced = await syncActiveTenantToBackend(tenant.id);
      
      // Invalidate all queries to force refetch with new tenant
      queryClient.invalidateQueries();
      
      toast.success(`Alterado para ${tenant.name}`, {
        description: synced 
          ? 'Dados atualizados para a nova empresa'
          : 'Dados locais atualizados (sincronização pendente)'
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
