import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { containerVariants } from './constants';
import { SidebarNavItem } from './SidebarNavItem';
import type { MenuItem } from './menuItems';

interface SidebarCollapsibleSectionProps {
  title: string;
  sectionKey: string;
  items: MenuItem[];
  variant?: 'default' | 'super';
  isCollapsed: boolean;
  isOpen: boolean;
  hasActiveItem: boolean;
  onToggle: (key: string) => void;
  onNavigate?: () => void;
}

export const SidebarCollapsibleSection = ({
  title, sectionKey, items, variant = 'default',
  isCollapsed, isOpen, hasActiveItem, onToggle, onNavigate,
}: SidebarCollapsibleSectionProps) => {
  const isSuper = variant === 'super';

  if (isCollapsed) {
    return (
      <motion.div className="space-y-0.5" variants={containerVariants} initial="hidden" animate="show">
        {items.map((item) => (
          <SidebarNavItem key={item.to} item={item} variant={variant} isCollapsed={isCollapsed} onNavigate={onNavigate} />
        ))}
      </motion.div>
    );
  }

  return (
    <div className="mb-0.5">
      <button
        onClick={() => onToggle(sectionKey)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-all duration-200 group/section",
          isSuper
            ? "hover:bg-[hsl(var(--neon-purple)_/_0.05)]"
            : "hover:bg-[hsl(var(--neon-cyan)_/_0.04)]",
          hasActiveItem && !isSuper && "bg-[hsl(var(--neon-cyan)_/_0.03)]",
          hasActiveItem && isSuper && "bg-[hsl(var(--neon-purple)_/_0.03)]"
        )}
      >
        <span className={cn(
          "flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-bold transition-colors",
          isSuper
            ? "text-[hsl(var(--neon-purple)_/_0.5)] group-hover/section:text-[hsl(var(--neon-purple)_/_0.7)]"
            : "text-[hsl(var(--neon-cyan)_/_0.45)] group-hover/section:text-[hsl(var(--neon-cyan)_/_0.7)]",
          hasActiveItem && !isSuper && "!text-[hsl(var(--neon-cyan)_/_0.8)]",
          hasActiveItem && isSuper && "!text-[hsl(var(--neon-purple)_/_0.8)]"
        )}>
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          {!isOpen && hasActiveItem && (
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isSuper ? "bg-[hsl(var(--neon-purple))]" : "bg-[hsl(var(--neon-cyan))]"
            )} />
          )}
          <ChevronDown className={cn(
            "h-3 w-3 transition-all duration-300",
            isSuper
              ? "text-[hsl(var(--neon-purple)_/_0.3)] group-hover/section:text-[hsl(var(--neon-purple)_/_0.6)]"
              : "text-[hsl(var(--neon-cyan)_/_0.3)] group-hover/section:text-[hsl(var(--neon-cyan)_/_0.6)]",
            isOpen && "rotate-180"
          )} />
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <motion.div
              className="space-y-0.5 mt-0.5 ml-1 border-l border-[hsl(var(--neon-cyan)_/_0.06)] pl-1"
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              {items.map((item) => (
                <SidebarNavItem key={item.to} item={item} variant={variant} isCollapsed={false} onNavigate={onNavigate} />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
