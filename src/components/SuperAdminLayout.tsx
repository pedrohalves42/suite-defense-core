import { Navigate, Outlet } from 'react-router-dom';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';

export const SuperAdminLayout = () => {
  const { isSuperAdmin, loading } = useSuperAdmin();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [hasShownToast, setHasShownToast] = useState(false);

  useEffect(() => {
    if (!loading && !authLoading && !isSuperAdmin && user && !hasShownToast) {
      toast({
        title: 'Access Denied',
        description: 'You do not have super admin permissions.',
        variant: 'destructive',
      });
      setHasShownToast(true);
    }
  }, [isSuperAdmin, loading, authLoading, user, toast, hasShownToast]);

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
