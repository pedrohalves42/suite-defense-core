import { Outlet } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Navigate } from 'react-router-dom';

export const AdminLayout = () => {
  const { isAdmin, loading } = useIsAdmin();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Outlet />
    </div>
  );
};
