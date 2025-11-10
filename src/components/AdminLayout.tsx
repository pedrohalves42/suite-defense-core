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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[AdminLayout] 🔍 VERIFICAÇÃO DE ACESSO ADMIN');
    console.log('[AdminLayout] User ID:', user?.id);
    console.log('[AdminLayout] User Email:', user?.email);
    console.log('[AdminLayout] isAdmin:', isAdmin);
    console.log('[AdminLayout] loading:', loading);
    console.log('[AdminLayout] Permitir acesso?', !loading && isAdmin);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (!loading && !isAdmin) {
      console.warn('[AdminLayout] ⛔ BLOQUEANDO ACESSO - isAdmin é false');
      toast({
        title: "Acesso Negado",
        description: "Você não tem permissões de administrador.",
        variant: "destructive"
      });
    } else if (!loading && isAdmin) {
      console.log('[AdminLayout] ✅ ACESSO PERMITIDO - isAdmin é true');
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
    console.warn('[AdminLayout] ⛔ REDIRECIONANDO - User is not admin');
    return <Navigate to="/dashboard" replace />;
  }

  console.log('[AdminLayout] 🎉 RENDERIZANDO CONTEÚDO ADMIN');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Outlet />
    </div>
  );
};
