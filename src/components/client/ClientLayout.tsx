import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Monitor, 
  Shield, 
  FileText, 
  Globe,
  LogOut,
  Menu,
  ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useClientAccess } from '@/hooks/useClientAccess';
import { useState } from 'react';
import logoImage from '@/assets/logo-cybshield-new.png';

const menuItems = [
  { icon: ShieldCheck, label: 'Minha Proteção', path: '/client/protection' },
  { icon: LayoutDashboard, label: 'Visão Geral', path: '/client/dashboard' },
  { icon: Monitor, label: 'Meus Computadores', path: '/client/computers' },
  { icon: Shield, label: 'Status de Segurança', path: '/client/security' },
  { icon: FileText, label: 'Relatórios', path: '/client/reports' },
  { icon: Globe, label: 'Atividade Web', path: '/client/activity' },
];

const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => {
  const location = useLocation();
  const { tenant } = useClientAccess();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <img src={logoImage} alt="CyberShield" className="h-8 w-auto object-contain" />
          <span className="text-lg font-semibold text-foreground">CyberShield</span>
        </div>
        {tenant && (
          <p className="text-sm text-muted-foreground truncate mt-1">{tenant.name}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          Sair
        </Button>
      </div>
    </div>
  );
};

export const ClientLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-border">
        <SidebarContent />
      </aside>

      {/* Mobile Header + Sheet */}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <img src={logoImage} alt="CyberShield" className="h-7 w-auto object-contain" />
            <span className="text-lg font-semibold">CyberShield</span>
          </div>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
