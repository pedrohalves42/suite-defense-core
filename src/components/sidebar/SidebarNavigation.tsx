import { motion } from 'framer-motion';
import { Home, Monitor, Crown, ChevronDown } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';
import { containerVariants, itemVariants } from './constants';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarCollapsibleSection } from './SidebarCollapsibleSection';
import { useTranslation } from 'react-i18next';
import {
  getOverviewItems, securityItems, managementItems, complianceItems,
  getIntelligenceItems, advancedItems, superOpsItems, superFinanceItems,
  superSystemItems, superAIItems, superIntegrationsItems,
  type MenuItem,
} from './menuItems';
import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

interface SidebarNavigationProps {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isCollapsed: boolean;
  sectionStates: Record<string, boolean>;
  favorites: string[];
  urgentCount: number;
  criticalInsightsCount: number;
  onToggleSection: (key: string) => void;
  onNavigate?: () => void;
}

export const SidebarNavigation = ({
  isAdmin, isSuperAdmin, isCollapsed, sectionStates,
  favorites, urgentCount, criticalInsightsCount,
  onToggleSection, onNavigate,
}: SidebarNavigationProps) => {
  const { t } = useTranslation();
  const location = useLocation();

  const overviewItems = useMemo(() => getOverviewItems(urgentCount), [urgentCount]);
  const intelligenceItems = useMemo(() => getIntelligenceItems(criticalInsightsCount), [criticalInsightsCount]);

  const isRouteInSection = useCallback((items: MenuItem[]) => {
    return items.some(item => location.pathname.startsWith(item.to));
  }, [location.pathname]);

  const renderSection = (title: string, key: string, items: MenuItem[], variant: 'default' | 'super' = 'default') => (
    <SidebarCollapsibleSection
      key={key}
      title={title}
      sectionKey={key}
      items={items}
      variant={variant}
      isCollapsed={isCollapsed}
      isOpen={sectionStates[key] ?? false}
      hasActiveItem={isRouteInSection(items)}
      onToggle={onToggleSection}
      onNavigate={onNavigate}
    />
  );

  return (
    <nav className="relative z-20 flex-1 overflow-y-auto py-2 px-2 scrollbar-thin">
      {isAdmin ? (
        <motion.div variants={containerVariants} initial="show" animate="show" className="space-y-1">
          {/* Favorites */}
          {(() => {
            const allItems = [...overviewItems, ...securityItems, ...managementItems, ...complianceItems, ...intelligenceItems, ...advancedItems];
            const favItems = allItems.filter(item => favorites.includes(item.to));
            if (favItems.length === 0) return null;
            return (
              <>
                {!isCollapsed && (
                  <div className="px-3 py-0.5">
                    <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan)_/_0.3)] flex items-center gap-1">
                      ⭐ Favoritos
                    </span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {favItems.map((item) => (
                    <div key={`fav-${item.to}`}>
                      <SidebarNavItem item={item} isCollapsed={isCollapsed} onNavigate={onNavigate} />
                    </div>
                  ))}
                </div>
                <div className="sidebar-divider-neon my-2.5 mx-2" />
              </>
            );
          })()}

          {/* Pendências - always visible */}
          <div className="space-y-0.5">
            <div key={overviewItems[0].to}>
              <SidebarNavItem item={overviewItems[0]} isCollapsed={isCollapsed} onNavigate={onNavigate} />
            </div>
          </div>

          {renderSection('📌 Visão Geral', 'overview', overviewItems.slice(1))}
          <div className="sidebar-divider-neon my-2.5 mx-2" />
          {renderSection('🛡️ Proteção', 'protection', securityItems)}
          {renderSection('⚙️ Organização', 'management', managementItems)}
          <div className="sidebar-divider-neon my-2.5 mx-2" />

          <div className="px-3 py-0.5">
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan)_/_0.2)]">Administração</span>
          </div>

          {renderSection('📋 Conformidade', 'compliance', complianceItems)}
          {renderSection('🧠 Assistente IA', 'aiAnalysis', intelligenceItems)}
          {renderSection('🔧 Configurar', 'advanced', advancedItems)}
        </motion.div>
      ) : (
        <motion.div className="space-y-0.5" variants={containerVariants} initial="hidden" animate="show">
          <motion.div variants={itemVariants}>
            <NavLink to="/dashboard" end onClick={onNavigate}
              className="sidebar-item-neon flex items-center gap-3 px-3 py-2 rounded-lg text-[hsl(220_14%_76%)]"
              activeClassName="sidebar-item-neon-active">
              <Home className="sidebar-icon h-4 w-4" />
              {!isCollapsed && <span className="sidebar-label text-sm">{t('adminPages.sidebar.home')}</span>}
            </NavLink>
          </motion.div>
          <motion.div variants={itemVariants}>
            <NavLink to="/agents" onClick={onNavigate}
              className="sidebar-item-neon flex items-center gap-3 px-3 py-2 rounded-lg text-[hsl(220_14%_76%)]"
              activeClassName="sidebar-item-neon-active">
              <Monitor className="sidebar-icon h-4 w-4" />
              {!isCollapsed && <span className="sidebar-label text-sm">{t('adminPages.sidebar.myComputersClient')}</span>}
            </NavLink>
          </motion.div>
        </motion.div>
      )}

      {/* Super Admin */}
      {isSuperAdmin && (
        <>
          <div className="sidebar-divider-neon my-2.5 mx-2" />
          {!isCollapsed ? (
            <div>
              <button
                onClick={() => onToggleSection('superAdmin')}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-[hsl(var(--neon-purple)_/_0.05)] cursor-pointer group/super"
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--neon-purple)_/_0.5)] flex items-center gap-1.5 group-hover/super:text-[hsl(var(--neon-purple)_/_0.7)]">
                  <Crown className="h-3 w-3" />
                  Super Admin
                </span>
                <ChevronDown className={cn(
                  "h-3 w-3 text-[hsl(var(--neon-purple)_/_0.3)] transition-transform duration-300",
                  sectionStates.superAdmin && "rotate-180"
                )} />
              </button>
              <AnimatePresence>
                {sectionStates.superAdmin && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-0.5 mt-0.5 ml-1 border-l border-[hsl(var(--neon-purple)_/_0.08)] pl-1">
                      {renderSection('Operacional', 'superOps', superOpsItems, 'super')}
                      {renderSection('Financeiro', 'superFinance', superFinanceItems, 'super')}
                      {renderSection('Sistema', 'superSystem', superSystemItems, 'super')}
                      {renderSection('IA', 'superAI', superAIItems, 'super')}
                      {renderSection('Integrações', 'superIntegrations', superIntegrationsItems, 'super')}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <motion.div className="space-y-0.5" variants={containerVariants} initial="hidden" animate="show">
              {superOpsItems.slice(0, 3).map((item) => (
                <SidebarNavItem key={item.to} item={item} variant="super" isCollapsed={isCollapsed} onNavigate={onNavigate} />
              ))}
            </motion.div>
          )}
        </>
      )}
    </nav>
  );
};
