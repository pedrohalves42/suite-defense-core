import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AppModeBadge } from '@/components/layout/AppModeBadge';
import logoImage from '@/assets/logo-cybshield-new.png';

interface SidebarHeaderProps {
  isCollapsed: boolean;
  collapsed: boolean;
  hovered: boolean;
  mobile: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
}

export const SidebarHeader = ({ isCollapsed, collapsed, hovered, mobile, onToggleCollapse, onNavigate }: SidebarHeaderProps) => (
  <div className="relative z-20 h-14 flex items-center justify-between px-3 border-b border-border/20">
    {!isCollapsed && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
        <div className="relative">
          <img src={logoImage} alt="CyberShield" className="h-7 w-auto object-contain" />
          <div className="absolute inset-0 blur-lg neon-pulse" style={{ background: 'hsl(190 95% 55% / 0.15)' }} />
        </div>
        <AppModeBadge collapsed={false} />
      </motion.div>
    )}
    {isCollapsed && (
      <div className="flex flex-col items-center gap-1 mx-auto">
        <div className="relative">
          <img src={logoImage} alt="CyberShield" className="h-6 w-auto object-contain" />
          <div className="absolute inset-0 blur-md neon-pulse" style={{ background: 'hsl(190 95% 55% / 0.12)' }} />
        </div>
      </div>
    )}
    {!mobile && (
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleCollapse}
        className={cn(
          "shrink-0 h-7 w-7 rounded-md text-[hsl(var(--neon-cyan)_/_0.5)] hover:text-[hsl(var(--neon-cyan))] hover:bg-[hsl(var(--neon-cyan)_/_0.08)] transition-all duration-200",
          isCollapsed && "absolute right-1 top-3.5"
        )}
      >
        {collapsed && !hovered ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </Button>
    )}
    {mobile && (
      <Button
        variant="ghost"
        size="icon"
        onClick={onNavigate}
        className="h-7 w-7 rounded-md text-[hsl(var(--neon-cyan)_/_0.5)] hover:text-[hsl(var(--neon-cyan))] hover:bg-[hsl(var(--neon-cyan)_/_0.08)]"
      >
        <X className="h-4 w-4" />
      </Button>
    )}
  </div>
);
