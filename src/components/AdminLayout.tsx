import { Outlet } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { logger } from '@/lib/logger';
import { useTranslation } from 'react-i18next';
import { OutdatedAgentsBanner } from '@/components/OutdatedAgentsBanner';
import { TenantSetupWizard } from '@/components/TenantSetupWizard';
import { useTenantSetup } from '@/hooks/useTenantSetup';
import { FirstTimeSetupWizard } from '@/components/onboarding/FirstTimeSetupWizard';

export const AdminLayout = () => {
  const { isAdmin, loading } = useIsAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { needsSetup, loading: setupLoading } = useTenantSetup();

  useEffect(() => {
    logger.debug('Admin check', { 
      userId: user?.id, 
      isAdmin, 
      loading 
    });
    
    if (!loading && !isAdmin) {
      toast({
        title: t('adminPages.layout.accessDenied'),
        description: t('adminPages.layout.noAdminPermission'),
        variant: "destructive"
      });
    }
  }, [user, isAdmin, loading, toast, t]);

  if (loading || setupLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" aria-hidden="true"></div>
        <p className="text-muted-foreground">{t('adminPages.layout.checkingPermissions')}</p>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-4" role="region" aria-label="Painel administrativo">
      {/* First Time Setup Wizard */}
      <FirstTimeSetupWizard />
      
      {/* Tenant Setup Wizard - shows when tenant needs initial configuration */}
      <TenantSetupWizard open={needsSetup} />

      <header>
        <OutdatedAgentsBanner />
      </header>
      
      <section>
        <Outlet />
      </section>
    </div>
  );
};