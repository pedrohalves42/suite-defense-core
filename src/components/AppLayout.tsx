import { Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { TopBar } from '@/components/TopBar';
import { NotificationSystem } from '@/components/NotificationSystem';

export const AppLayout = () => {
  return (
    <div className="min-h-screen bg-background">
      <NotificationSystem />
      <AppSidebar />
      <div className="pl-60">
        <TopBar />
        <main className="pt-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
