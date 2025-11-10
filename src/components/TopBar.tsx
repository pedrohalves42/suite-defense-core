import { Bell, User, LogOut, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const TopBar = ({ alerts = 0 }: { alerts?: number }) => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();
  
  // Banner de diagnóstico (removível por env)
  const showDiagnostics = import.meta.env.VITE_SHOW_DIAGNOSTICS === 'true';

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Erro ao fazer logout');
    } else {
      toast.success('Logout realizado com sucesso');
      navigate('/login');
    }
  };

  return (
    <>
      {showDiagnostics && (
        <Alert className="fixed top-0 right-0 left-60 z-50 rounded-none border-x-0 border-t-0 bg-yellow-500/10 border-yellow-500/50">
          <Bug className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-xs flex gap-4 text-yellow-800 dark:text-yellow-200">
            <span>Auth: {authLoading ? '⏳' : user ? '✓' : '✗'}</span>
            <span>Admin: {adminLoading ? '⏳' : isAdmin ? '✓' : '✗'}</span>
            <span className="truncate max-w-[200px]">Email: {user?.email || 'N/A'}</span>
          </AlertDescription>
        </Alert>
      )}
      <header className={`fixed top-0 right-0 left-60 h-16 bg-card border-b border-border z-30 flex items-center justify-end px-6 gap-4 ${showDiagnostics ? 'mt-10' : ''}`}>
      {/* Notifications */}
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-5 w-5" />
        {alerts > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
            {alerts}
          </Badge>
        )}
      </Button>

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <User className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Minha Conta</span>
              <span className="text-xs text-muted-foreground truncate">
                {user?.email}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    </>
  );
};
