import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useCriticalInsights } from '@/hooks/useCriticalInsights';
import { useActionCenterCount } from '@/hooks/useActionCenter';
import { useFavorites } from '@/hooks/useFavorites';
import {
  getOverviewItems, securityItems, managementItems, complianceItems,
  getIntelligenceItems, advancedItems, superOpsItems, superFinanceItems,
  superSystemItems, superAIItems, superIntegrationsItems,
  type MenuItem,
} from '@/components/sidebar/menuItems';

export function useSidebarState(mobile: boolean) {
  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useSuperAdmin();
  const { data: criticalInsightsCount = 0 } = useCriticalInsights();
  const { urgentCount } = useActionCenterCount();
  const { favorites } = useFavorites();
  const location = useLocation();

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

  const isRouteInSection = useCallback((items: MenuItem[]) => {
    return items.some(item => location.pathname.startsWith(item.to));
  }, [location.pathname]);

  const isCollapsed = !mobile && collapsed && !hovered;

  // Memoized menu items
  const overviewItems = useMemo(() => getOverviewItems(urgentCount), [urgentCount]);
  const intelligenceItems = useMemo(() => getIntelligenceItems(criticalInsightsCount), [criticalInsightsCount]);

  return {
    isAdmin, isSuperAdmin, location, favorites,
    collapsed, setCollapsed, hovered, setHovered, isCollapsed,
    sectionStates, toggleSection, isRouteInSection,
    // Menu items
    overviewItems, securityItems, managementItems, complianceItems,
    intelligenceItems, advancedItems, superOpsItems, superFinanceItems,
    superSystemItems, superAIItems, superIntegrationsItems,
  };
}
