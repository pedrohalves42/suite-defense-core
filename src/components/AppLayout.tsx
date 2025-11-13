import { Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { TopBar } from '@/components/TopBar';
import { NotificationSystem } from '@/components/NotificationSystem';
import { ConnectivityIndicator } from '@/components/ConnectivityIndicator';
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
    // Custom event for same-page updates
    window.addEventListener('sidebar-toggle', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebar-toggle', handleStorageChange);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <NotificationSystem />
      <ConnectivityIndicator />
      <AppSidebar />
      <div className={cn('transition-all duration-300', collapsed ? 'pl-16' : 'pl-60')}>
        <TopBar />
        <main className="pt-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
