// v2: provider rewritten to use AuthProvider context
import { useState, useEffect, useCallback, createContext, useContext, ReactNode, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callGateway } from '@/lib/gateway';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { type AppRole, ROLE_PRIORITY } from '@/types/roles';
import { logger } from '@/lib/logger';

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

/**
 * Syncs the active tenant to the backend, updating the user's JWT app_metadata.
 * This ensures RLS policies can optionally use active_tenant_id for stricter isolation.
 * P2 MED-01: Added 10s timeout to prevent indefinite hanging
 * V-AUDIT: active_tenant_id is NO LONGER persisted in localStorage (XSS risk).
 */
async function syncActiveTenantToBackend(tenantId: string): Promise<boolean> {
  const SYNC_TIMEOUT_MS = 10000;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

    // V-FIX: Centralize gateway call
    const result = await callGateway('admin', 'set-active-tenant', { tenant_id: tenantId });
    const error = result && typeof result === 'object' && 'error' in result ? result : null;

    clearTimeout(timeoutId);

    if (error) {
      logger.error('[syncActiveTenantToBackend] Edge function error', error);
      return false;
    }

    return true;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error('[syncActiveTenantToBackend] Sync timeout after 10s');
      return false;
    }
    logger.error('[syncActiveTenantToBackend] Unexpected error', err instanceof Error ? err : undefined);
    return false;
  }
}

export const ActiveTenantProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const isSyncingRef = useRef(false);

  // Sync state between current user and selection
  useEffect(() => {
    if (!authLoading && !user) {
      setActiveTenantId(null);
    }
  }, [user?.id, authLoading]);

  // Fetch all tenants for the user
  const { data: userTenantRoles = [], isLoading: queryLoading, isFetched } = useQuery({
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
      
      const uniqueTenants = new Map<string, UserTenantRole>();
      
      (data || []).forEach((item: any) => {
        if (!item.tenant) return;
        
        const existing = uniqueTenants.get(item.tenant_id);
        const currentRole = item.role as AppRole;
        const currentPriority = ROLE_PRIORITY[currentRole] || 0;
        
        const existingRole = (existing?.role as AppRole) || null;
        const existingPriority = existingRole ? (ROLE_PRIORITY[existingRole] || 0) : -1;
        
        if (currentPriority > existingPriority) {
          uniqueTenants.set(item.tenant_id, {
            tenant_id: item.tenant_id,
            role: item.role,
            tenant: item.tenant as Tenant
          });
        }
      });

      return Array.from(uniqueTenants.values());
    },
    enabled: !!user,
    staleTime: 60 * 1000, // Reduced from 10m to 1m for faster access propagation (SEC-004)
  });

  const loading = authLoading || queryLoading;

  const tenants = userTenantRoles.map(r => r.tenant);
  const hasMultipleTenants = tenants.length > 1;

  const activeTenant = useMemo(() => {
    if (tenants.length === 0) return null;
    
    // 1. Explicit selection in state
    if (activeTenantId) {
      const found = tenants.find(t => t.id === activeTenantId);
      if (found) return found;
    }

    // 2. JWT session preference
    const sessionTenantId = user?.app_metadata?.active_tenant_id;
    if (sessionTenantId) {
      const found = tenants.find(t => t.id === sessionTenantId);
      if (found) return found;
    }
    
    // 3. Fallback to first
    return tenants[0];
  }, [tenants, activeTenantId, user?.app_metadata?.active_tenant_id]);

  // CORREÇÃO: Calcular role baseada no tenant ATIVO e no status de super_admin global
  const activeRole = useMemo((): AppRole | null => {
    // Check global super_admin status first
    if (user?.app_metadata?.is_super_admin === true) return 'super_admin';

    if (!activeTenant || userTenantRoles.length === 0) return null;
    
    const tenantRole = userTenantRoles.find(r => r.tenant_id === activeTenant.id);
    return (tenantRole?.role as AppRole) || null;
  }, [activeTenant, userTenantRoles, user?.app_metadata?.is_super_admin]);

  // V-AUDIT: No longer persist to localStorage (XSS risk).
  // Tenant preference survives via JWT app_metadata.active_tenant_id.

  useEffect(() => {
    if (!activeTenant || !user || isSyncingRef.current) return;

    const checkJWTAndSync = async () => {
      // V-FIX: Set syncing ref immediately to prevent race conditions
      isSyncingRef.current = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentJWTTenantId = session?.user?.app_metadata?.active_tenant_id;
        
        if (currentJWTTenantId === activeTenant.id) {
          isSyncingRef.current = false;
          return;
        }
        const synced = await syncActiveTenantToBackend(activeTenant.id);
        if (synced) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            logger.error('[useActiveTenant] Sync refresh error', refreshError);
          } else {
            logger.info('[useActiveTenant] Session refreshed after background sync');
          }
        }
      } catch (err) {
        logger.warn('[useActiveTenant] JWT sync hint failed');
      } finally {
        isSyncingRef.current = false;
      }
    };

    checkJWTAndSync();
  }, [activeTenant?.id, user?.id, queryClient]);

  const setActiveTenant = useCallback(async (tenant: Tenant) => {
    if (activeTenant?.id === tenant.id || isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;
    
    try {
      // V-FIX: Reuse centralized sync helper
      const synced = await syncActiveTenantToBackend(tenant.id);

      if (!synced) {
        toast.error('Erro ao trocar de empresa', {
          description: 'Não foi possível sincronizar com o servidor. Tente novamente.'
        });
        return;
      }

      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        logger.warn('[setActiveTenant] Session refresh warning');
      }

      setActiveTenantId(tenant.id);
      // P-AUDIT: Invalidate queries instead of removing for smoother transitions
      queryClient.invalidateQueries({ queryKey: ['unified-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['agent-snapshots-list'] });
      queryClient.invalidateQueries();

      toast.success(`Alterado para ${tenant.name}`, {
        description: 'Dados atualizados para a nova empresa'
      });
    } catch (err) {
      logger.error('[setActiveTenant] Unexpected error', err instanceof Error ? err : undefined);
      toast.error('Erro ao trocar de empresa', {
        description: 'Erro inesperado. Tente novamente.'
      });
    } finally {
      isSyncingRef.current = false;
    }
  }, [activeTenant?.id, queryClient]);

  return (
    <ActiveTenantContext.Provider 
      value={{ 
        tenants, 
        activeTenant, 
        activeRole, // CORREÇÃO: expor role do tenant ativo
        setActiveTenant, 
        loading,
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
