import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [verifyingSession, setVerifyingSession] = useState(false);
  const [hasValidSession, setHasValidSession] = useState<boolean | null>(null);

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
  
  if (mustChangePassword && !isOnForcePasswordPage) {
    return <Navigate to="/force-password-change" replace />;
  }

  return <>{children}</>;
};
