import { useState, useEffect } from 'react';
import { Bell, User, LogOut, Bug, Settings, Sun, Moon, Menu } from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
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
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GlobalSearch } from '@/components/navigation/GlobalSearch';
import { TenantSelector } from '@/components/TenantSelector';
import { SimpleModeToggle } from '@/components/layout/SimpleModeToggle';
import { TooltipProvider } from '@/components/ui/tooltip';
import logoImage from '@/assets/logo-cybshield-new.png';

interface TopBarProps {
  alerts?: number;
  isMobile?: boolean;
  sidebarCollapsed?: boolean;
  onMobileMenuClick?: () => void;
}

export const TopBar = ({ alerts = 0, isMobile = false, sidebarCollapsed = false, onMobileMenuClick }: TopBarProps) => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
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
      {showDiagnostics && !isMobile && (
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
          "fixed top-0 right-0 h-14 z-40 flex items-center justify-between px-4 md:px-6 gap-2 md:gap-4 transition-all duration-300",
          "bg-card/80 backdrop-blur-xl border-b border-border/30",
          "shadow-sm",
          isMobile ? 'left-0' : (sidebarCollapsed ? 'left-16' : 'left-52'),
          showDiagnostics && !isMobile ? 'mt-10' : ''
        )}
      >
        {/* Left side - mobile menu + logo */}
        <div className="flex items-center gap-2">
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={onMobileMenuClick}
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          {isMobile && (
            <img src={logoImage} alt="CyberShield" className="h-7 w-auto object-contain" />
          )}
        </div>

        {/* Center - Admin controls */}
        <div className="hidden md:flex items-center gap-2">
          <TenantSelector />
          <TooltipProvider>
            <SimpleModeToggle />
          </TooltipProvider>
        </div>

        {/* Right side - actions */}
        <div className="flex items-center gap-2 md:gap-4">
          <GlobalSearch />
          
          {/* Language Switcher - hidden on small mobile */}
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>

          {/* Theme Toggle */}
          <ThemeToggle className="btn-enterprise-ghost" />

          {/* Notifications */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="relative btn-enterprise-ghost"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {alerts > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-destructive">
                {alerts}
              </Badge>
            )}
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="btn-enterprise-ghost"
              >
                <User className="h-5 w-5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end"
              side="bottom"
              sideOffset={8}
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
              {/* Language switcher in menu for mobile */}
              <div className="sm:hidden px-2 py-1.5">
                <LanguageSwitcher variant="full" />
              </div>
              <DropdownMenuSeparator className="sm:hidden" />
              <DropdownMenuItem onClick={() => navigate('/admin/my-account')}>
                <User className="mr-2 h-4 w-4" />
                Configurações da Conta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/admin/tenant')}>
                <Settings className="mr-2 h-4 w-4" />
                Configurações da Empresa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
                {resolvedTheme === 'dark' ? (
                  <Sun className="mr-2 h-4 w-4" />
                ) : (
                  <Moon className="mr-2 h-4 w-4" />
                )}
                Alternar Tema
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
};
