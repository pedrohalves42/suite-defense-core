import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Shield, Monitor, AlertTriangle, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { icon: Home, label: 'Painel', path: '/admin/dashboard' },
  { icon: Monitor, label: 'Agentes', path: '/admin/agent-health' },
  { icon: AlertTriangle, label: 'Alertas', path: '/admin/security-monitoring' },
  { icon: Shield, label: 'Políticas', path: '/admin/security-policies' },
  { icon: Menu, label: 'Menu', path: '__menu__' },
];

interface MobileBottomNavProps {
  onMenuClick: () => void;
}

export const MobileBottomNav = ({ onMenuClick }: MobileBottomNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card/95 backdrop-blur-xl border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const isMenu = item.path === '__menu__';
          const isActive = !isMenu && location.pathname.startsWith(item.path);

          return (
            <button
              key={item.path}
              onClick={() => isMenu ? onMenuClick() : navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
