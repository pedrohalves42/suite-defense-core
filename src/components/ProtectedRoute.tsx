import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { SessionProvider } from '@/components/SessionProvider';
import { DashboardSkeleton } from './skeletons/DashboardSkeleton';

/**
 * ADR-026: Enhanced ProtectedRoute with tenant validation
 * - Validates user authentication
 * - Validates user has at least one tenant associated
 * - Handles force password change flow
 * - Provides second-chance session verification
 */
export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [verifyingSession, setVerifyingSession] = useState(false);
  const [hasValidSession, setHasValidSession] = useState<boolean | null>(null);
  
  // ADR-026 FIX: Get tenant info for validation
  // PATCH #5: Incluído isSwitching para trava de interface durante troca de contexto
  const { tenants, loading: tenantLoading, isFetched, isSwitching } = useActiveTenant();

  // Second chance: verify session directly if useAuth says no user
  useEffect(() => {
    let isMounted = true;
    const verifySession = async () => {
      if (loading) return;
      
      if (!user && hasValidSession === null) {
        logger.debug('ProtectedRoute: No user from useAuth, doing second chance check');
        if (isMounted) setVerifyingSession(true);
        
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          
          setHasValidSession(!!data.session?.user);
          logger.debug('ProtectedRoute: Second chance result', { hasSession: !!data.session?.user });
        } catch (error) {
          logger.error('ProtectedRoute: Session verification failed', error);
          setHasValidSession(false);
        } finally {
          if (isMounted) setVerifyingSession(false);
        }
      }
    };

    verifySession();
    return () => { isMounted = false; };
  }, [user, loading, hasValidSession]);

  // Loading states
  if (loading || verifyingSession) {
    return <DashboardSkeleton />;
  }

  // ADR-026: If second chance found a session, wait for useAuth state to hydrate.
  // We only redirect if both useAuth and second chance confirm NO session.
  if (!loading && !user && hasValidSession === false) {
    return <Navigate to="/login" replace />;
  }

  // Still waiting for second chance check or for useAuth to sync with found session
  if (!user && (hasValidSession === null || hasValidSession === true)) {
    return <DashboardSkeleton />;
  }

  // Check if user must change password (ADR-008: Access Governance)
  const mustChangePassword = user?.user_metadata?.must_change_password === true;
  const isOnForcePasswordPage = location.pathname === '/force-password-change';
  const isOnNoTenantPage = location.pathname === '/no-tenant';
  
  // Force password change takes priority
  if (mustChangePassword && !isOnForcePasswordPage) {
    return <Navigate to="/force-password-change" replace />;
  }

  // ADR-026 FIX: Validate tenant association
  // PATCH #4: Wait for both loading AND isFetched before making redirect decision
  // This prevents flash of /no-tenant during initial fetch
  if (isFetched && !tenantLoading && tenants !== undefined) {
    const isSuperAdmin = user?.app_metadata?.is_super_admin === true;
    const hasTenant = (Array.isArray(tenants) && tenants.length > 0) || isSuperAdmin;
    
    // User has no tenant and is not on allowed pages
    if (!hasTenant && !isOnNoTenantPage && !isOnForcePasswordPage) {
      logger.warn('ProtectedRoute: User has no associated tenant after fetch, redirecting to /no-tenant', { 
        tenantsCount: tenants?.length,
        isSuperAdmin 
      });
      return <Navigate to="/no-tenant" state={{ from: location }} replace />;
    }
    
    // User has tenant but is on no-tenant page - redirect to dashboard or original destination
    if (hasTenant && isOnNoTenantPage) {
      const destination = location.state?.from?.pathname || '/dashboard';
      return <Navigate to={destination} replace />;
    }
  }

  // ADR-026: Wrap children with SessionProvider for session timeout and tracking
  return <SessionProvider>{children}</SessionProvider>;
};
