import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Button } from './ui/button';
import { Key, Users, Settings, ArrowLeft, ScrollText, Mail } from 'lucide-react';

export const AdminLayout = () => {
  const { isAdmin, loading } = useIsAdmin();
  const location = useLocation();

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

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <h1 className="text-xl font-semibold">Administração</h1>
            </div>
            <nav className="flex gap-2">
              <Link to="/admin/enrollment-keys">
                <Button 
                  variant={isActive('/admin/enrollment-keys') ? 'default' : 'ghost'}
                  size="sm"
                >
                  <Key className="h-4 w-4 mr-2" />
                  Chaves
                </Button>
              </Link>
              <Link to="/admin/users">
                <Button 
                  variant={isActive('/admin/users') ? 'default' : 'ghost'}
                  size="sm"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Usuários
                </Button>
              </Link>
              <Link to="/admin/invites">
                <Button 
                  variant={isActive('/admin/invites') ? 'default' : 'ghost'}
                  size="sm"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Convites
                </Button>
              </Link>
              <Link to="/admin/audit-logs">
                <Button 
                  variant={isActive('/admin/audit-logs') ? 'default' : 'ghost'}
                  size="sm"
                >
                  <ScrollText className="h-4 w-4 mr-2" />
                  Logs
                </Button>
              </Link>
              <Link to="/admin/settings">
                <Button 
                  variant={isActive('/admin/settings') ? 'default' : 'ghost'}
                  size="sm"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configurações
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </div>
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
};
