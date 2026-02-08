import { Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { TopBar } from '@/components/TopBar';
import { NotificationSystem } from '@/components/NotificationSystem';
import { ConnectivityIndicator } from '@/components/ConnectivityIndicator';
import { GlobalJobWatcher } from '@/components/GlobalJobWatcher';
import { GlobalKillSwitchBanner } from '@/components/layout/GlobalKillSwitchBanner';
import { SimpleModeProvider } from '@/components/layout/SimpleModeProvider';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export const AppLayout = () => {
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
        {/* Enterprise background pattern - muito sutil */}
        <div 
          className="fixed inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at 10% 20%, rgba(45, 158, 140, 0.015) 0%, transparent 50%),
              radial-gradient(ellipse at 90% 80%, rgba(45, 158, 140, 0.01) 0%, transparent 50%)
            `,
          }}
        />
        
        {/* Content with relative positioning */}
        <div className="relative">
          {/* Global background listeners */}
          <GlobalJobWatcher />
          <NotificationSystem />
          <ConnectivityIndicator />
          <GlobalKillSwitchBanner />
          
          <AppSidebar />
          <div className={cn('transition-all duration-300', collapsed ? 'pl-16' : 'pl-60')}>
            <TopBar />
            <main className="pt-16 p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </SimpleModeProvider>
  );
};
