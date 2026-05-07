import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { SessionProvider } from '@/components/SessionProvider';

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
  // PATCH #4: Include isFetched to prevent premature redirects
  const { tenants, loading: tenantLoading, isFetched } = useActiveTenant();

  // Second chance: verify session directly if useAuth says no user
  useEffect(() => {
    const verifySession = async () => {
      if (loading) return;
      
      if (!user && hasValidSession === null) {
        logger.debug('ProtectedRoute: No user from useAuth, doing second chance check');
        setVerifyingSession(true);
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          setHasValidSession(!!session?.user);
          logger.debug('ProtectedRoute: Second chance result', { hasSession: !!session?.user });
        } catch (error) {
          logger.error('ProtectedRoute: Session verification failed', error);
          setHasValidSession(false);
        } finally {
          setVerifyingSession(false);
        }
      }
    };

    verifySession();
  }, [user, loading, hasValidSession]);

  // Loading states
  if (loading || verifyingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Only redirect if both useAuth and second chance confirm no session
  if (!user && hasValidSession === false) {
    return <Navigate to="/login" replace />;
  }

  // Still waiting for second chance check
  if (!user && hasValidSession === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
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
  if (!tenantLoading && isFetched && tenants !== undefined) {
    const hasTenant = Array.isArray(tenants) && tenants.length > 0;
    
    // User has no tenant and is not on allowed pages
    if (!hasTenant && !isOnNoTenantPage && !isOnForcePasswordPage) {
      logger.warn('ProtectedRoute: User has no associated tenant, redirecting to /no-tenant', { tenantsCount: tenants?.length });
      return <Navigate to="/no-tenant" replace />;
    }
    
    // User has tenant but is on no-tenant page - redirect to dashboard
    if (hasTenant && isOnNoTenantPage) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  // ADR-026: Wrap children with SessionProvider for session timeout and tracking
  return <SessionProvider>{children}</SessionProvider>;
};
