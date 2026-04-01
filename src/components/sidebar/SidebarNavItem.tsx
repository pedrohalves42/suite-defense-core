import { motion, AnimatePresence } from 'framer-motion';
import { NavLink } from '@/components/NavLink';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { itemVariants } from './constants';
import { useLocation } from 'react-router-dom';
import type { MenuItem } from './menuItems';

interface SidebarNavItemProps {
  item: MenuItem;
  variant?: 'default' | 'super';
  isCollapsed: boolean;
  onNavigate?: () => void;
}

export const SidebarNavItem = ({ item, variant = 'default', isCollapsed, onNavigate }: SidebarNavItemProps) => {
  const location = useLocation();
  const Icon = item.icon;
  const isSuper = variant === 'super';
  const isActive = location.pathname === item.to || (item.to !== '/admin/dashboard' && location.pathname.startsWith(item.to));

  const navContent = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={cn(
        "sidebar-item-neon flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group/item",
        isSuper && "sidebar-item-neon-super",
        isCollapsed && "justify-center px-2",
        !isActive && "text-[hsl(220_14%_76%)]"
      )}
      activeClassName={cn(
        "sidebar-item-neon-active",
        isSuper && "sidebar-item-neon-super"
      )}
    >
      <Icon className={cn(
        "sidebar-icon h-4 w-4 shrink-0 transition-all duration-300",
        !isActive && "group-hover/item:text-[hsl(190_95%_65%)]",
        isActive && !isSuper && "text-[hsl(190_95%_55%)]"
      )} />
      <AnimatePresence mode="wait">
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 flex-1 overflow-hidden"
          >
            <span className={cn(
              "sidebar-label text-sm whitespace-nowrap flex-1 transition-colors duration-200",
              !isActive && "group-hover/item:text-[hsl(220_14%_85%)]"
            )}>{item.label}</span>
            {item.badge && item.badge > 0 && (
              <span className="sidebar-badge-neon">{item.badge}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </NavLink>
  );

  if (isCollapsed) {
    return (
      <motion.div key={item.to} variants={itemVariants}>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>{navContent}</TooltipTrigger>
            <TooltipContent side="right" className="glass-panel text-[hsl(190_95%_70%)] border-[hsl(190_95%_55%_/_0.2)]">
              <span className="flex items-center gap-2">
                {item.label}
                {item.badge && item.badge > 0 && <span className="sidebar-badge-neon">{item.badge}</span>}
              </span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </motion.div>
    );
  }

  return <motion.div key={item.to} variants={itemVariants}>{navContent}</motion.div>;
};
