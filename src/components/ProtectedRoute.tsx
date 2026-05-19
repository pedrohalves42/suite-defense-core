import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { SessionProvider } from '@/components/SessionProvider';
import { DashboardSkeleton } from './skeletons/DashboardSkeleton';

/**
 * ADR-026: Enhanced ProtectedRoute with tenant validation
 */
export const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [verifyingSession, setVerifyingSession] = useState(false);
  const [hasValidSession, setHasValidSession] = useState<boolean | null>(null);
  
  const { tenants, loading: tenantLoading, isFetched, isSwitching } = useActiveTenant();

  useEffect(() => {
    let isMounted = true;
    const verifySession = async () => {
      if (loading) return;
      
      if (!user && hasValidSession === null) {
        if (isMounted) setVerifyingSession(true);
        
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          
          if (isMounted) setHasValidSession(!!data.session?.user);
        } catch (error) {
          logger.error('ProtectedRoute: Session verification failed', error);
          if (isMounted) setHasValidSession(false);
        } finally {
          if (isMounted) setVerifyingSession(false);
        }
      }
    };

    verifySession();
    return () => { isMounted = false; };
  }, [user, loading, hasValidSession]);

  if (loading || verifyingSession) {
    return <DashboardSkeleton />;
  }

  if (!loading && !user && hasValidSession === false) {
    return <Navigate to="/login" replace />;
  }

  if (!user && (hasValidSession === null || hasValidSession === true)) {
    return <DashboardSkeleton />;
  }

  const mustChangePassword = user?.user_metadata?.must_change_password === true;
  const isOnForcePasswordPage = location.pathname === '/force-password-change';
  const isOnNoTenantPage = location.pathname === '/no-tenant';
  
  if (mustChangePassword && !isOnForcePasswordPage) {
    return <Navigate to="/force-password-change" replace />;
  }

  if (isFetched && !tenantLoading && tenants !== undefined) {
    const isSuperAdmin = user?.app_metadata?.is_super_admin === true;
    const hasTenant = (Array.isArray(tenants) && tenants.length > 0) || isSuperAdmin;
    
    if (!hasTenant && !isOnNoTenantPage && !isOnForcePasswordPage) {
      return <Navigate to="/no-tenant" state={{ from: location }} replace />;
    }
    
    if (hasTenant && isOnNoTenantPage) {
      const destination = location.state?.from?.pathname || '/dashboard';
      return <Navigate to={destination} replace />;
    }
  }

  return (
    <SessionProvider>
      {isSwitching && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm transition-all animate-in fade-in">
          <div className="flex flex-col items-center gap-4 p-8 rounded-xl bg-card border shadow-2xl">
            <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <div className="text-center space-y-1">
              <h3 className="font-bold text-lg tracking-tight">Sincronizando Empresa</h3>
              <p className="text-sm text-muted-foreground animate-pulse">Atualizando contexto de segurança e cache...</p>
            </div>
          </div>
        </div>
      )}
      {children || <Outlet />}
    </SessionProvider>
  );
};
