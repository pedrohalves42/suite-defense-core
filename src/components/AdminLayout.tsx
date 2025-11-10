import { Outlet } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export const AdminLayout = () => {
  const { isAdmin, loading } = useIsAdmin();
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    console.log('[AdminLayout] User:', user?.id);
    console.log('[AdminLayout] isAdmin:', isAdmin);
    console.log('[AdminLayout] loading:', loading);
    if (!loading && !isAdmin) {
      toast({
        title: "Acesso Negado",
        description: "Você não tem permissões de administrador.",
        variant: "destructive"
      });
    }
  }, [user, isAdmin, loading]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-muted-foreground">Verificando permissões...</p>
      </div>
    );
  }

  if (!isAdmin) {
    console.warn('[AdminLayout] User is not admin, redirecting to dashboard');
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Outlet />
    </div>
  );
};
