import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarTenantSelector } from '@/components/SidebarTenantSelector';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useCriticalInsights } from '@/hooks/useCriticalInsights';
import { useActionCenterCount } from '@/hooks/useActionCenter';
import { useFavorites } from '@/hooks/useFavorites';
import { useState, useEffect, useCallback } from 'react';
import { bootVariants } from '@/components/sidebar/constants';
import { SidebarHeader } from '@/components/sidebar/SidebarHeader';
import { SidebarSearch } from '@/components/sidebar/SidebarSearch';
import { SidebarNavigation } from '@/components/sidebar/SidebarNavigation';
import { SidebarFooter } from '@/components/sidebar/SidebarFooter';

interface AppSidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export const AppSidebar = ({ mobile = false, onNavigate }: AppSidebarProps) => {
  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useSuperAdmin();
  const { data: criticalInsightsCount = 0 } = useCriticalInsights();
  const { urgentCount } = useActionCenterCount();
  const { favorites } = useFavorites();

  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  const [sectionStates, setSectionStates] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sidebar-sections-v6');
    return saved ? JSON.parse(saved) : {
      overview: true, protection: true, management: true,
      compliance: false, advanced: false, aiAnalysis: false,
      superAdmin: false, superOps: true, superFinance: false,
      superSystem: false, superAI: false, superIntegrations: false,
    };
  });

  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebar-sections-v6', JSON.stringify(sectionStates));
  }, [sectionStates]);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', collapsed.toString());
    window.dispatchEvent(new Event('sidebar-toggle'));
  }, [collapsed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('open-search'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleSection = useCallback((section: string) => {
    setSectionStates(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const isCollapsed = !mobile && collapsed && !hovered;
  const effectiveWidth = mobile ? 'w-full' : (isCollapsed ? 'w-16' : 'w-56');

  return (
    <TooltipProvider>
      <motion.aside
        variants={bootVariants}
        initial="hidden"
        animate="show"
        onMouseEnter={() => !mobile && collapsed && setHovered(true)}
        onMouseLeave={() => !mobile && setHovered(false)}
        className={cn(
          'h-screen sidebar-futuristic sidebar-grid-bg',
          'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] flex flex-col relative overflow-hidden',
          mobile ? 'w-full' : 'fixed left-0 top-0 z-40',
          !mobile && effectiveWidth,
          !mobile && 'sidebar-float'
        )}
      >
        {/* Scan line effect */}
        <div
          className="absolute inset-0 pointer-events-none z-10 opacity-[0.02]"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(190 95% 55% / 0.1) 2px, hsl(190 95% 55% / 0.1) 4px)',
          }}
        />

        <SidebarHeader
          isCollapsed={isCollapsed}
          collapsed={collapsed}
          hovered={hovered}
          mobile={mobile}
          onToggleCollapse={() => { setCollapsed(!collapsed); setHovered(false); }}
          onNavigate={onNavigate}
        />

        <SidebarSearch isCollapsed={isCollapsed} mobile={mobile} onNavigate={onNavigate} />

        {/* Tenant Selector */}
        <div className="relative z-20 border-b border-[hsl(var(--neon-cyan)_/_0.06)]">
          <SidebarTenantSelector collapsed={mobile ? false : isCollapsed} />
        </div>

        <SidebarNavigation
          isAdmin={isAdmin}
          isSuperAdmin={isSuperAdmin}
          isCollapsed={isCollapsed}
          sectionStates={sectionStates}
          favorites={favorites}
          urgentCount={urgentCount}
          criticalInsightsCount={criticalInsightsCount}
          onToggleSection={toggleSection}
          onNavigate={onNavigate}
        />

        <SidebarFooter isCollapsed={isCollapsed} />
      </motion.aside>
    </TooltipProvider>
  );
};
