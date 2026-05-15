import { Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { TopBar } from '@/components/TopBar';
import { NotificationSystem } from '@/components/NotificationSystem';
import { ConnectivityIndicator } from '@/components/ConnectivityIndicator';
import { GlobalJobWatcher } from '@/components/GlobalJobWatcher';
import { GlobalKillSwitchBanner } from '@/components/layout/GlobalKillSwitchBanner';
import { SimpleModeProvider } from '@/components/layout/SimpleModeProvider';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { PushNotificationBanner } from '@/components/mobile/PushNotificationBanner';
import { SecurityCopilot } from '@/components/copilot/SecurityCopilot';
import { CommandPalette } from '@/components/CommandPalette';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { useActionCenterCount } from '@/hooks/useActionCenter';

export const AppLayout = () => {
  const isMobile = useIsMobile();
  const { urgentCount } = useActionCenterCount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('sidebar-collapsed');
      setCollapsed(saved === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('sidebar-toggle', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebar-toggle', handleStorageChange);
    };
  }, []);

  return (
    <SimpleModeProvider>
      <div className="min-h-screen bg-background relative selection:bg-cta-positive/20 selection:text-cta-positive-foreground overflow-hidden">
        {/* Enterprise Obsidian background */}
        <div 
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            background: `
              radial-gradient(circle at 0% 0%, hsla(var(--cta-positive), 0.05) 0%, transparent 40%),
              radial-gradient(circle at 100% 100%, hsla(var(--info), 0.03) 0%, transparent 40%)
            `,
          }}
        />
        
        {/* Refined mesh pattern */}
        <div className="fixed inset-0 opacity-[0.03] pointer-events-none z-0" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
          backgroundSize: '100px 100px'
        }} />
        
        <div className="relative">
          {/* Global background listeners */}
          <GlobalJobWatcher />
          <NotificationSystem />
          <ConnectivityIndicator />
          
          {/* Desktop sidebar - hidden on mobile */}
          {!isMobile && (
            <nav aria-label="Navegação principal">
              <AppSidebar />
            </nav>
          )}

          {/* Mobile sidebar sheet */}
          {isMobile && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetContent side="left" className="p-0 w-[300px] max-w-[85vw] bg-[#050507] border-r-0 [&>button:last-child]:hidden" aria-label="Menu lateral">
                <AppSidebar mobile onNavigate={() => setMobileMenuOpen(false)} />
              </SheetContent>
            </Sheet>
          )}

          <div className={cn(
            'transition-all duration-300',
            isMobile ? 'pl-0' : (collapsed ? 'pl-[calc(4rem+16px)]' : 'pl-[calc(14rem+16px)]')
          )}>
            <TopBar 
              isMobile={isMobile} 
              sidebarCollapsed={collapsed} 
              mobileMenuOpen={mobileMenuOpen}
              onMobileMenuClick={() => setMobileMenuOpen(true)} 
            />
            <div className="pt-14" role="status" aria-live="polite">
              <GlobalKillSwitchBanner />
            </div>
            <main className={cn(
              "p-6 md:p-10 relative z-0 stagger-visible",
              isMobile && "pb-28"
            )} id="main-content">
              <div className="max-w-7xl mx-auto">
                {isMobile && <PushNotificationBanner />}
                <nav aria-label="Caminho de navegação">
                  <Breadcrumbs />
                </nav>
                <RouteErrorBoundary route="App Content">
                  <Outlet />
                </RouteErrorBoundary>
              </div>
            </main>
          </div>

          {/* Mobile bottom navigation */}
          {isMobile && (
            <nav aria-label="Navegação móvel inferior">
              <MobileBottomNav onMenuClick={() => setMobileMenuOpen(true)} alertCount={urgentCount} />
            </nav>
          )}

          {/* Command Palette */}
          <CommandPalette />

          {/* AI Security Copilot - floating chat */}
          <SecurityCopilot />
        </div>
      </div>
    </SimpleModeProvider>
  );
};