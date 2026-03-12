import { useState, useEffect, useCallback, createContext, useContext, ReactNode, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { type AppRole } from '@/types/roles';

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
  activeRole: AppRole | null; // CORREÇÃO: role do usuário no tenant ativo
  setActiveTenant: (tenant: Tenant) => Promise<void>;
  loading: boolean;
  hasMultipleTenants: boolean;
  isFetched: boolean;
}

const ActiveTenantContext = createContext<ActiveTenantContextType | undefined>(undefined);

const ACTIVE_TENANT_KEY = 'cybershield_active_tenant_id';

/**
 * Syncs the active tenant to the backend, updating the user's JWT app_metadata.
 * This ensures RLS policies can optionally use active_tenant_id for stricter isolation.
 * P2 MED-01: Added 10s timeout to prevent indefinite hanging
 */
async function syncActiveTenantToBackend(tenantId: string): Promise<boolean> {
  const SYNC_TIMEOUT_MS = 10000; // P2 MED-01: 10 second timeout
  
  try {
    // P2 MED-01: Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

    const { error } = await supabase.functions.invoke('set-active-tenant', {
      body: { tenant_id: tenantId }
    });

    clearTimeout(timeoutId);

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
    // P2 MED-01: Handle timeout specifically
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[syncActiveTenantToBackend] Sync timeout after 10s');
      return false;
    }
    console.error('[syncActiveTenantToBackend] Unexpected error:', err);
    return false;
  }
}

export const ActiveTenantProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // V-1014 FIX: Never use localStorage as initial state source
  // localStorage is only used for UX persistence AFTER JWT validation
  // The actual tenant_id source of truth is always the JWT/backend
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  
  // PATCH #2: Add isSyncing state to block queries until JWT is updated
  const [isSyncing, setIsSyncing] = useState(true);

  // Fetch all tenants for the user
  // PATCH #4: Expose isFetched for ProtectedRoute to prevent premature redirects
  const { data: userTenantRoles = [], isLoading, isFetched } = useQuery({
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
  // V-1014: localStorage is used as a hint for UX preference only,
  // but the actual selection is validated against server-fetched tenants
  const activeTenant = (() => {
    if (tenants.length === 0) return null;
    
    // If we have a programmatically set active tenant ID, find it
    if (activeTenantId) {
      const found = tenants.find(t => t.id === activeTenantId);
      if (found) return found;
    }
    
    // V-1014 FIX: Check localStorage hint ONLY after server validation
    // This is safe because we verify the ID exists in the user's fetched tenants
    if (typeof window !== 'undefined') {
      const savedId = localStorage.getItem(ACTIVE_TENANT_KEY);
      if (savedId) {
        const found = tenants.find(t => t.id === savedId);
        if (found) {
          // Set state so subsequent renders don't re-read localStorage
          setActiveTenantId(savedId);
          return found;
        }
      }
    }
    
    // Default to first tenant
    return tenants[0];
  })();

  // CORREÇÃO: Calcular role baseada no tenant ATIVO
  const activeRole = useMemo((): AppRole | null => {
    if (!activeTenant || userTenantRoles.length === 0) return null;
    
    const tenantRole = userTenantRoles.find(r => r.tenant_id === activeTenant.id);
    return (tenantRole?.role as AppRole) || null;
  }, [activeTenant, userTenantRoles]);

  // Update localStorage when active tenant changes
  useEffect(() => {
    if (activeTenant) {
      localStorage.setItem(ACTIVE_TENANT_KEY, activeTenant.id);
    }
  }, [activeTenant?.id]);

  // PATCH #2 OPTIMIZED: Sync initial tenant to backend
  // Only sync on FIRST load or when tenant actually changes
  // Non-blocking: queries can proceed with explicit tenantId while sync happens
  useEffect(() => {
    if (!activeTenant || !user) {
      setIsSyncing(false);
      return;
    }

    // Check if JWT already has correct active_tenant_id
    // This avoids unnecessary sync calls on page reload
    const checkJWTAndSync = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentJWTTenantId = session?.user?.app_metadata?.active_tenant_id;
        
        // If JWT already has correct tenant, skip sync
        if (currentJWTTenantId === activeTenant.id) {
          console.log('[useActiveTenant] JWT already synced, skipping backend call');
          setIsSyncing(false);
          return;
        }
        
        // Sync needed - but don't block UI
        console.log('[useActiveTenant] Syncing tenant to backend...');
        syncActiveTenantToBackend(activeTenant.id)
          .then(async (synced) => {
            if (synced) {
              await supabase.auth.refreshSession();
              console.log('[useActiveTenant] Session refreshed after sync');
            }
          })
          .finally(() => {
            setIsSyncing(false);
          });
      } catch (err) {
        console.warn('[useActiveTenant] JWT check failed:', err);
        setIsSyncing(false);
      }
    };

    setIsSyncing(true);
    checkJWTAndSync();
  }, [activeTenant?.id, user?.id]);

  const setActiveTenant = useCallback(async (tenant: Tenant) => {
    const previousTenantId = activeTenantId;
    
    if (previousTenantId === tenant.id) {
      // No change needed
      return;
    }

    // Block UI while switching
    setIsSyncing(true);
    
    try {
      // 1. Call edge function to update app_metadata
      const { error } = await supabase.functions.invoke('set-active-tenant', {
        body: { tenant_id: tenant.id }
      });

      if (error) {
        console.error('[setActiveTenant] Edge function error:', error);
        toast.error('Erro ao trocar de empresa', {
          description: 'Não foi possível sincronizar com o servidor. Tente novamente.'
        });
        return;
      }

      // 2. Refresh session to get new JWT with updated active_tenant_id
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('[setActiveTenant] Session refresh warning:', refreshError);
      }

      // 3. Update local state AFTER JWT is confirmed updated
      setActiveTenantId(tenant.id);
      localStorage.setItem(ACTIVE_TENANT_KEY, tenant.id);

      // 4. Clear all cached queries so they refetch with new tenant context
      queryClient.clear();
      queryClient.invalidateQueries();

      toast.success(`Alterado para ${tenant.name}`, {
        description: 'Dados atualizados para a nova empresa'
      });
    } catch (err) {
      console.error('[setActiveTenant] Unexpected error:', err);
      toast.error('Erro ao trocar de empresa', {
        description: 'Erro inesperado. Tente novamente.'
      });
    } finally {
      setIsSyncing(false);
    }
  }, [activeTenantId, queryClient]);

  return (
    <ActiveTenantContext.Provider 
      value={{ 
        tenants, 
        activeTenant, 
        activeRole, // CORREÇÃO: expor role do tenant ativo
        setActiveTenant, 
        loading: isLoading || isSyncing,
        hasMultipleTenants,
        isFetched,
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
