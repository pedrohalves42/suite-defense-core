import { Navigate, Outlet } from 'react-router-dom';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';

export const SuperAdminLayout = () => {
  const { isSuperAdmin, loading, error } = useSuperAdmin();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [hasShownToast, setHasShownToast] = useState(false);

  useEffect(() => {
    // CRITICAL: Block access if RPC failed or user is not super_admin
    if (!loading && !authLoading && user && !hasShownToast) {
      if (error) {
        toast({
          title: 'Security Check Failed',
          description: 'Unable to verify super admin permissions. Access denied for security.',
          variant: 'destructive',
        });
        setHasShownToast(true);
      } else if (!isSuperAdmin) {
        toast({
          title: 'Access Denied',
          description: 'You do not have super admin permissions.',
          variant: 'destructive',
        });
        setHasShownToast(true);
      }
    }
  }, [isSuperAdmin, loading, authLoading, user, toast, hasShownToast, error]);

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // CRITICAL: Block access if RPC failed OR user is not super_admin
  if (error || !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
