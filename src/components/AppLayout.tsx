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
    window.addEventListener('sidebar-toggle', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebar-toggle', handleStorageChange);
    };
  }, []);

  return (
    <div 
      className="min-h-screen bg-background"
      style={{
        backgroundImage: `
          radial-gradient(circle at 10% 20%, hsl(var(--primary) / 0.05) 0%, transparent 50%),
          radial-gradient(circle at 90% 80%, hsl(var(--accent) / 0.05) 0%, transparent 50%)
        `,
      }}
    >
      <NotificationSystem />
      <ConnectivityIndicator />
      <AppSidebar />
      <div className={cn('transition-all duration-300', collapsed ? 'pl-16' : 'pl-60')}>
        <TopBar />
        <main className="pt-16 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};