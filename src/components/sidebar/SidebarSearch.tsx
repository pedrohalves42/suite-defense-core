import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';

interface SidebarSearchProps {
  isCollapsed: boolean;
  mobile: boolean;
  onNavigate?: () => void;
}

export const SidebarSearch = ({ isCollapsed, mobile, onNavigate }: SidebarSearchProps) => {
  const { t } = useTranslation();

  if (!isCollapsed) {
    return (
      <div className="relative z-20 px-2 py-2 border-b border-[hsl(var(--neon-cyan)_/_0.06)]">
        <Button
          variant="ghost"
          className="w-full justify-start h-9 px-3 rounded-lg bg-[hsl(224_25%_10%)] border border-[hsl(var(--neon-cyan)_/_0.08)] hover:border-[hsl(var(--neon-cyan)_/_0.2)] hover:bg-[hsl(224_25%_12%)] text-[hsl(220_14%_50%)] transition-all duration-200"
          onClick={() => { window.dispatchEvent(new CustomEvent('open-search')); onNavigate?.(); }}
        >
          <Search className="h-3.5 w-3.5 mr-2 text-[hsl(var(--neon-cyan)_/_0.5)]" />
          <span className="flex-1 text-left text-xs">{t('adminPages.sidebar.search')}</span>
          {!mobile && <kbd className="text-[9px] bg-[hsl(var(--neon-cyan)_/_0.08)] text-[hsl(var(--neon-cyan)_/_0.5)] px-1.5 py-0.5 rounded font-mono border border-[hsl(var(--neon-cyan)_/_0.1)]">⌘K</kbd>}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative z-20 px-2 py-2 border-b border-[hsl(var(--neon-cyan)_/_0.06)]">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="w-full h-9 text-[hsl(var(--neon-cyan)_/_0.4)] hover:text-[hsl(var(--neon-cyan))] hover:bg-[hsl(var(--neon-cyan)_/_0.06)]"
            onClick={() => window.dispatchEvent(new CustomEvent('open-search'))}
          >
            <Search className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" className="glass-panel text-[hsl(190_95%_70%)] border-[hsl(190_95%_55%_/_0.2)]">
          {t('adminPages.sidebar.searchTooltip')}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
