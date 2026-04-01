import { Zap } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/ThemeToggle';

interface SidebarFooterProps {
  isCollapsed: boolean;
}

export const SidebarFooter = ({ isCollapsed }: SidebarFooterProps) => (
  <div className="relative z-20 border-t border-border/20 p-3">
    {!isCollapsed ? (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-3 w-3 text-muted-foreground/40 neon-pulse" />
          <span className="text-[10px] tracking-[0.1em] text-muted-foreground/50 font-mono uppercase">
            CyberShield v5.0.15
          </span>
        </div>
        <ThemeToggle variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/60 hover:text-foreground" />
      </div>
    ) : (
      <div className="flex flex-col items-center gap-2">
        <ThemeToggle variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/60 hover:text-foreground" />
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center">
              <Zap className="h-3 w-3 text-muted-foreground/40 neon-pulse" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            CyberShield v5.0.15
          </TooltipContent>
        </Tooltip>
      </div>
    )}
  </div>
);
