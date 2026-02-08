import { Outlet } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { logger } from '@/lib/logger';
import { OutdatedAgentsBanner } from '@/components/OutdatedAgentsBanner';
import { TenantSelector } from '@/components/TenantSelector';
import { TenantSetupWizard } from '@/components/TenantSetupWizard';
import { useTenantSetup } from '@/hooks/useTenantSetup';
import { GlobalSearch } from '@/components/navigation/GlobalSearch';
import { FirstTimeSetupWizard } from '@/components/onboarding/FirstTimeSetupWizard';
import { SimpleModeToggle } from '@/components/layout/SimpleModeToggle';
import { TooltipProvider } from '@/components/ui/tooltip';

export const AdminLayout = () => {
  const { isAdmin, loading } = useIsAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const { needsSetup, loading: setupLoading } = useTenantSetup();

  useEffect(() => {
    logger.debug('Admin check', { 
      userId: user?.id, 
      isAdmin, 
      loading 
    });
    
    if (!loading && !isAdmin) {
      toast({
        title: "Acesso Negado",
        description: "Voce nao tem permissoes de administrador.",
        variant: "destructive"
      });
    }
  }, [user, isAdmin, loading, toast]);

  if (loading || setupLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-muted-foreground">Verificando permissões...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* First Time Setup Wizard */}
      <FirstTimeSetupWizard />
      
      {/* Tenant Setup Wizard - shows when tenant needs initial configuration */}
      <TenantSetupWizard open={needsSetup} />

      {/* Header with Tenant Selector and Simple Mode Toggle */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Painel Administrativo</h1>
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <SimpleModeToggle />
          </TooltipProvider>
          <GlobalSearch />
          <TenantSelector />
        </div>
      </div>
      
      <OutdatedAgentsBanner />
      <Outlet />
    </div>
  );
};
