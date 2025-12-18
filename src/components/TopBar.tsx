import { Bell, User, LogOut, Bug, Settings } from 'lucide-react';
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
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export const TopBar = ({ alerts = 0 }: { alerts?: number }) => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();
  
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
            <span>Auth: {authLoading ? '?' : user ? '✓' : '✗'}</span>
            <span>Admin: {adminLoading ? '?' : isAdmin ? '✓' : '✗'}</span>
            <span className="truncate max-w-[200px]">Email: {user?.email || 'N/A'}</span>
          </AlertDescription>
        </Alert>
      )}
      <header 
        className={cn(
          "fixed top-0 right-0 left-60 h-16 z-30 flex items-center justify-end px-6 gap-4 transition-all duration-300",
          "bg-card/80 backdrop-blur-xl border-b border-border/50",
          "shadow-lg shadow-primary/5",
          showDiagnostics ? 'mt-10' : ''
        )}
        style={{
          backgroundImage: 'linear-gradient(to right, hsl(var(--primary) / 0.02), transparent)',
        }}
      >
        {/* Notifications */}
        <motion.div
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button 
            variant="ghost" 
            size="icon" 
            className="relative hover:bg-accent/50 transition-all duration-300"
          >
            <Bell className="h-5 w-5" />
            {alerts > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500 }}
              >
                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-gradient-to-r from-red-500 to-red-600 animate-pulse">
                  {alerts}
                </Badge>
              </motion.div>
            )}
          </Button>
        </motion.div>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button 
                variant="ghost" 
                size="icon"
                className="hover:bg-gradient-to-br hover:from-accent/50 hover:to-accent/30 transition-all duration-300"
              >
                <User className="h-5 w-5" />
              </Button>
            </motion.div>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            align="end" 
            className="w-56 bg-card/95 backdrop-blur-xl border-border/50 shadow-xl"
          >
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">Minha Conta</span>
                <span className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/admin/my-account')}>
              <User className="mr-2 h-4 w-4" />
              Configurações da Conta
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/admin/tenant')}>
              <Settings className="mr-2 h-4 w-4" />
              Configurações da Empresa
            </DropdownMenuItem>
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