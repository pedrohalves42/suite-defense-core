import { Outlet, useLocation } from 'react-router-dom';
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
import { motion, AnimatePresence } from 'framer-motion';

export const AdminLayout = () => {
  const { isAdmin, loading } = useIsAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { needsSetup, loading: setupLoading } = useTenantSetup();
  const location = useLocation();

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
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-background relative overflow-hidden">
        <div className="absolute inset-0 bg-cta-positive/5 rounded-full blur-[160px] animate-pulse" />
        <div className="relative p-6 glass-card rounded-[2.5rem] border-white/5 flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cta-positive" aria-hidden="true"></div>
          <p className="text-white/40 font-medium tracking-wide uppercase text-xs">
            {t('adminPages.layout.checkingPermissions')}
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen relative overflow-hidden selection:bg-cta-positive/20">
      {/* Premium Admin Background Layer */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[10%] left-[20%] w-[40%] h-[40%] bg-cta-positive/5 rounded-full blur-[140px]" />
        <div className="absolute bottom-[10%] right-[15%] w-[35%] h-[35%] bg-info/5 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 relative z-10" role="region" aria-label="Painel administrativo">
        {/* First Time Setup Wizard */}
        <FirstTimeSetupWizard />
        
        {/* Tenant Setup Wizard - shows when tenant needs initial configuration */}
        <TenantSetupWizard open={needsSetup} />

        <header className="mb-8">
          <OutdatedAgentsBanner />
        </header>
        
        <main>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="stagger-visible"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};
