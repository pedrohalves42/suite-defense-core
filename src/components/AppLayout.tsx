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

export const AppLayout = () => {
  const isMobile = useIsMobile();
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
      <div className="min-h-screen bg-background relative">
        {/* Enterprise background pattern */}
        <div 
          className="fixed inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at 10% 20%, rgba(45, 158, 140, 0.015) 0%, transparent 50%),
              radial-gradient(ellipse at 90% 80%, rgba(45, 158, 140, 0.01) 0%, transparent 50%)
            `,
          }}
        />
        
        <div className="relative">
          {/* Global background listeners */}
          <GlobalJobWatcher />
          <NotificationSystem />
          <ConnectivityIndicator />
          
          {/* Desktop sidebar - hidden on mobile */}
          {!isMobile && <AppSidebar />}

          {/* Mobile sidebar sheet */}
          {isMobile && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetContent side="left" className="p-0 w-[300px] max-w-[85vw] bg-[hsl(224_25%_6%)] border-r-0 [&>button:last-child]:hidden">
                <AppSidebar mobile onNavigate={() => setMobileMenuOpen(false)} />
              </SheetContent>
            </Sheet>
          )}

          <div className={cn(
            'transition-all duration-300',
            isMobile ? 'pl-0' : (collapsed ? 'pl-[calc(4rem+16px)]' : 'pl-[calc(14rem+16px)]')
          )}>
            <TopBar isMobile={isMobile} sidebarCollapsed={collapsed} onMobileMenuClick={() => setMobileMenuOpen(true)} />
            <div className="pt-14">
              <GlobalKillSwitchBanner />
            </div>
            <main className={cn(
              "p-4 md:p-6 relative z-0",
              isMobile && "pb-24"
            )}>
              <div className="max-w-7xl mx-auto">
                {isMobile && <PushNotificationBanner />}
                <Breadcrumbs />
                <Outlet />
              </div>
            </main>
          </div>

          {/* Mobile bottom navigation */}
          {isMobile && (
            <MobileBottomNav onMenuClick={() => setMobileMenuOpen(true)} />
          )}

          {/* AI Security Copilot - floating chat */}
          <SecurityCopilot />
        </div>
      </div>
    </SimpleModeProvider>
  );
};
