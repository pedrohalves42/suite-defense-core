import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Shield, Monitor, AlertTriangle, Menu, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const navItems = [
  { icon: Home, label: 'Painel', path: '/admin/dashboard' },
  { icon: Monitor, label: 'Agentes', path: '/admin/agent-health' },
  { icon: AlertTriangle, label: 'Alertas', path: '/admin/security-monitoring' },
  { icon: Shield, label: 'Políticas', path: '/admin/security-policies' },
  { icon: Menu, label: 'Menu', path: '__menu__' },
];

interface MobileBottomNavProps {
  onMenuClick: () => void;
  alertCount?: number;
}

export const MobileBottomNav = ({ onMenuClick, alertCount = 0 }: MobileBottomNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card/95 backdrop-blur-xl border-t border-border">
      <div className="flex items-center justify-around h-16 px-1 pb-safe">
        {navItems.map((item) => {
          const isMenu = item.path === '__menu__';
          const isActive = !isMenu && location.pathname.startsWith(item.path);
          const isAlerts = item.path === '/admin/security-monitoring';

          return (
            <button
              key={item.path}
              onClick={() => isMenu ? onMenuClick() : navigate(item.path)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200 rounded-lg mx-0.5",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:scale-95"
              )}
            >
              {/* Active indicator dot */}
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}

              <div className="relative">
                <item.icon className={cn(
                  "h-5 w-5 transition-colors",
                  isActive && "text-primary"
                )} />
                {/* Alert badge */}
                {isAlerts && alertCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold leading-none">
                    {alertCount > 99 ? '99+' : alertCount}
                  </span>
                )}
              </div>

              <span className={cn(
                "text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
