import { Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { TopBar } from '@/components/TopBar';

export const AppLayout = () => {
  return (
    <div className="min-h-screen bg-background">
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
