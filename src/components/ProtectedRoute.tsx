import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if user must change password (ADR-008: Access Governance)
  const mustChangePassword = user.user_metadata?.must_change_password === true;
  const isOnForcePasswordPage = location.pathname === '/force-password-change';
  
  if (mustChangePassword && !isOnForcePasswordPage) {
    return <Navigate to="/force-password-change" replace />;
  }

  return <>{children}</>;
};
