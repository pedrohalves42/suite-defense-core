import { 
  Home, Shield, Users, ScrollText, Settings, 
  ChevronLeft, ChevronRight, ChevronDown, Server, 
  Activity, CreditCard, Crown, BarChart3, AlertTriangle, 
  Brain, Terminal, Globe, Clock, Gauge, 
  Bell, TrendingUp, PieChart, Target, DollarSign, Presentation, Scale, 
  Heart, Search, Monitor, AppWindow, GitBranch,
  Download, Building2, FileText, Cpu, Network, Percent, ClipboardCheck, FileBarChart,
  AlertCircle, Lightbulb, Wrench, Key, ShieldCheck, FileSearch, Tag, Crosshair,
  Zap, X
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useCriticalInsights } from '@/hooks/useCriticalInsights';
import { useActionCenterCount } from '@/hooks/useActionCenter';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SidebarTenantSelector } from '@/components/SidebarTenantSelector';
import { AppModeBadge } from '@/components/layout/AppModeBadge';
import logoImage from '@/assets/logo-cybshield-new.png';

interface MenuItem {
  icon: any;
  label: string;
  to: string;
  end?: boolean;
  badge?: number;
}

interface AppSidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

// Stagger animation config
const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.03 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] as const } }
};

// Boot-up animation
const bootVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { 
    opacity: 1, 
    scale: 1, 
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } 
  }
};

export const AppSidebar = ({ mobile = false, onNavigate }: AppSidebarProps) => {
  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useSuperAdmin();
  const { data: criticalInsightsCount = 0 } = useCriticalInsights();
  const { urgentCount } = useActionCenterCount();
  const location = useLocation();
  const { t } = useTranslation();
  
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  const [sectionStates, setSectionStates] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sidebar-sections-v3');
    return saved ? JSON.parse(saved) : {
      protection: true,
      management: false,
      compliance: false,
      advanced: false,
      superAdmin: true,
      superOps: true,
      superFinance: false,
      superSystem: false
    };
  });

  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebar-sections-v3', JSON.stringify(sectionStates));
  }, [sectionStates]);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', collapsed.toString());
    window.dispatchEvent(new Event('sidebar-toggle'));
  }, [collapsed]);

  const toggleSection = useCallback((section: string) => {
    setSectionStates(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const isRouteInSection = useCallback((items: MenuItem[]) => {
    return items.some(item => location.pathname.startsWith(item.to));
  }, [location.pathname]);

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

  // ─── Menu Items ───────────────────────────────────
  const overviewItems = useMemo<MenuItem[]>(() => [
    { icon: Target, label: t('adminPages.sidebar.actionCenter'), to: '/admin/action-center', end: true, badge: urgentCount > 0 ? urgentCount : undefined },
    { icon: Home, label: t('adminPages.sidebar.generalPanel'), to: '/admin/dashboard' },
    { icon: Activity, label: t('adminPages.sidebar.realTime'), to: '/admin/monitoring-advanced' },
    { icon: Cpu, label: t('adminPages.sidebar.myComputers'), to: '/admin/agent-health' },
  ], [urgentCount, t]);

  const protectionItems = useMemo<MenuItem[]>(() => [
    { icon: AlertTriangle, label: t('adminPages.sidebar.alerts'), to: '/admin/security-monitoring' },
    { icon: ShieldCheck, label: t('adminPages.sidebar.vulnerabilities'), to: '/admin/vulnerabilities' },
    { icon: AlertCircle, label: t('adminPages.sidebar.quarantine'), to: '/quarantine' },
    { icon: Globe, label: t('adminPages.sidebar.webNavigation'), to: '/admin/web-activity' },
    { icon: FileSearch, label: t('adminPages.sidebar.history'), to: '/admin/agent-timeline' },
  ], [t]);

  const managementItems = useMemo<MenuItem[]>(() => [
    { icon: Users, label: t('adminPages.sidebar.groups'), to: '/admin/agent-groups' },
    { icon: Tag, label: 'Tags', to: '/admin/agent-tags' },
    { icon: Shield, label: t('adminPages.sidebar.policies'), to: '/admin/security-policies' },
    { icon: AppWindow, label: t('adminPages.sidebar.programs'), to: '/admin/software-inventory' },
    { icon: Crown, label: t('adminPages.sidebar.team'), to: '/admin/members' },
    { icon: FileBarChart, label: t('adminPages.sidebar.reports'), to: '/admin/reports' },
    { icon: Bell, label: t('adminPages.sidebar.notifications'), to: '/admin/notification-channels' },
    { icon: Settings, label: t('adminPages.sidebar.settings'), to: '/admin/tenant' },
  ], [t]);

  const complianceItems = useMemo<MenuItem[]>(() => [
    { icon: ClipboardCheck, label: t('adminPages.sidebar.soc2'), to: '/admin/soc2-compliance' },
    { icon: ScrollText, label: t('adminPages.sidebar.audit'), to: '/admin/system-audit' },
    { icon: Scale, label: t('adminPages.sidebar.complianceLabel'), to: '/admin/compliance-timeline' },
    { icon: FileText, label: 'Compliance Automation', to: '/admin/compliance-automation' },
    { icon: Crosshair, label: 'Threat Intelligence', to: '/admin/threat-intelligence' },
    { icon: Brain, label: t('adminPages.sidebar.aiRules'), to: '/admin/rules-management', badge: criticalInsightsCount > 0 ? criticalInsightsCount : undefined },
  ], [criticalInsightsCount, t]);

  const advancedItems = useMemo<MenuItem[]>(() => [
    { icon: Download, label: t('adminPages.sidebar.installations'), to: '/admin/installations' },
    { icon: GitBranch, label: t('adminPages.sidebar.versions'), to: '/admin/agent-releases' },
    { icon: Terminal, label: t('adminPages.sidebar.diagnostics'), to: '/admin/diagnostics' },
    { icon: Clock, label: t('adminPages.sidebar.automations'), to: '/admin/automations' },
    { icon: Gauge, label: t('adminPages.sidebar.systemHealth'), to: '/admin/system-health' },
    { icon: Wrench, label: t('adminPages.sidebar.jobHealth'), to: '/admin/job-health' },
    { icon: Lightbulb, label: t('adminPages.sidebar.insightTriage'), to: '/admin/insight-triage' },
    { icon: TrendingUp, label: t('adminPages.sidebar.confidenceGap'), to: '/admin/confidence-gap' },
    { icon: AlertCircle, label: t('adminPages.sidebar.alertResolution'), to: '/admin/alert-resolution' },
    { icon: CreditCard, label: t('adminPages.sidebar.plans'), to: '/admin/plan-upgrade' },
  ], [t]);

  const superOpsItems = useMemo<MenuItem[]>(() => [
    { icon: Server, label: t('adminPages.sidebar.companies'), to: '/super-admin/tenants', end: true },
    { icon: Key, label: t('adminPages.sidebar.enrollmentKeys'), to: '/super-admin/enrollment-keys' },
    { icon: Percent, label: t('adminPages.sidebar.rollout'), to: '/super-admin/rollout-policies' },
    { icon: Users, label: t('adminPages.sidebar.users'), to: '/super-admin/users' },
    { icon: Shield, label: t('adminPages.sidebar.features'), to: '/super-admin/features' },
    { icon: Clock, label: t('adminPages.sidebar.suspension'), to: '/super-admin/tenant-suspension' },
  ], [t]);

  const superFinanceItems = useMemo<MenuItem[]>(() => [
    { icon: BarChart3, label: t('adminPages.sidebar.metrics'), to: '/super-admin/metrics' },
    { icon: PieChart, label: t('adminPages.sidebar.subscriptions'), to: '/super-admin/subscription-analytics' },
    { icon: DollarSign, label: t('adminPages.sidebar.indicators'), to: '/super-admin/unit-economics' },
    { icon: TrendingUp, label: t('adminPages.sidebar.retention'), to: '/super-admin/cohort-analysis' },
    { icon: Target, label: t('adminPages.sidebar.projections'), to: '/super-admin/revenue-projections' },
    { icon: Presentation, label: t('adminPages.sidebar.pipeline'), to: '/super-admin/sales-pipeline' },
    { icon: Scale, label: t('adminPages.sidebar.presentation'), to: '/super-admin/pitch-deck' },
    { icon: AlertTriangle, label: t('adminPages.sidebar.risksLabel'), to: '/super-admin/risk-analysis' },
    { icon: CreditCard, label: t('adminPages.sidebar.payments'), to: '/super-admin/stripe-setup' },
  ], [t]);

  const superSystemItems = useMemo<MenuItem[]>(() => [
    { icon: ScrollText, label: t('adminPages.sidebar.auditLogs'), to: '/super-admin/audit-logs' },
    { icon: Activity, label: t('adminPages.sidebar.logs'), to: '/super-admin/system-logs' },
    { icon: Clock, label: 'Saúde dos Crons', to: '/admin/cron-health' },
    { icon: Settings, label: t('adminPages.sidebar.settingsLabel'), to: '/super-admin/settings' },
  ], [t]);

  // ─── Determine effective width ───────────────────
  const isCollapsed = !mobile && collapsed && !hovered;
  const effectiveWidth = mobile ? 'w-full' : (isCollapsed ? 'w-16' : 'w-56');

  // ─── Render nav item ─────────────────────────────
  const renderNavItem = (item: MenuItem, idx: number, variant: 'default' | 'super' = 'default') => {
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

  // ─── Collapsible Section ─────────────────────────
  const renderCollapsibleSection = (
    title: string, 
    sectionKey: string,
    items: MenuItem[], 
    variant: 'default' | 'super' = 'default'
  ) => {
    const isOpen = sectionStates[sectionKey];
    const hasActiveItem = isRouteInSection(items);
    
    if (isCollapsed) {
      return (
        <motion.div className="space-y-0.5" variants={containerVariants} initial="hidden" animate="show">
          {items.map((item, idx) => renderNavItem(item, idx, variant))}
        </motion.div>
      );
    }

    return (
      <div>
        <button 
          onClick={() => toggleSection(sectionKey)} 
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-[hsl(var(--neon-cyan)_/_0.04)] group/section"
        >
          <span className={cn(
            "sidebar-section-label transition-colors",
            hasActiveItem && "!text-[hsl(var(--neon-cyan)_/_0.8)]"
          )}>
            {title}
          </span>
          <ChevronDown className={cn(
            "h-3 w-3 text-[hsl(var(--neon-cyan)_/_0.3)] transition-all duration-300 group-hover/section:text-[hsl(var(--neon-cyan)_/_0.6)]",
            isOpen && "rotate-180"
          )} />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <motion.div 
                className="space-y-0.5 mt-1"
                variants={containerVariants}
                initial="hidden"
                animate="show"
              >
                {items.map((item, idx) => renderNavItem(item, idx, variant))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

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

        {/* ─── Header ───────────────────────── */}
        <div className="relative z-20 h-14 flex items-center justify-between px-3 border-b border-[hsl(var(--neon-cyan)_/_0.08)]">
          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2"
            >
              <div className="relative">
                <img src={logoImage} alt="CyberShield" className="h-7 w-auto object-contain" />
                {/* Neon glow behind logo */}
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
              onClick={() => { setCollapsed(!collapsed); setHovered(false); }}
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

        {/* ─── Search ───────────────────────── */}
        {!isCollapsed && (
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
        )}
        {isCollapsed && (
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
        )}

        {/* ─── Tenant Selector ──────────────── */}
        <div className="relative z-20 border-b border-[hsl(var(--neon-cyan)_/_0.06)]">
          <SidebarTenantSelector collapsed={mobile ? false : isCollapsed} />
        </div>

        {/* ─── Navigation ───────────────────── */}
        <nav className="relative z-20 flex-1 overflow-y-auto py-2 px-2 scrollbar-thin">
          {isAdmin ? (
            <motion.div variants={containerVariants} initial="hidden" animate="show">
              {/* OVERVIEW - always visible */}
              <div className="space-y-0.5 mb-2">
                {overviewItems.map((item, idx) => renderNavItem(item, idx))}
              </div>

              <div className="sidebar-divider-neon my-2 mx-2" />

              {renderCollapsibleSection(t('adminPages.sidebar.protection'), 'protection', protectionItems)}
              <div className="my-1.5" />
              {renderCollapsibleSection(t('adminPages.sidebar.management'), 'management', managementItems)}
              <div className="my-1.5" />
              {renderCollapsibleSection(t('adminPages.sidebar.compliance'), 'compliance', complianceItems)}
              <div className="my-1.5" />
              {renderCollapsibleSection(t('adminPages.sidebar.advanced'), 'advanced', advancedItems)}
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
              <div className="sidebar-divider-neon my-3 mx-2" />
              {!isCollapsed ? (
                <div>
                  <button 
                    onClick={() => toggleSection('superAdmin')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[hsl(var(--neon-purple)_/_0.06)] cursor-pointer group/super"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[hsl(var(--neon-purple)_/_0.6)] flex items-center gap-1.5">
                      <Crown className="h-3 w-3" />
                      <span className="text-shadow-[0_0_8px_hsl(var(--neon-purple)_/_0.3)]">Super Admin</span>
                    </span>
                    <ChevronDown className={cn(
                      "h-3 w-3 text-[hsl(var(--neon-purple)_/_0.4)] transition-transform duration-300",
                      sectionStates.superAdmin && "rotate-180"
                    )} />
                  </button>
                  <AnimatePresence>
                    {sectionStates.superAdmin && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1 mt-1">
                          {renderCollapsibleSection(t('adminPages.sidebar.operational'), 'superOps', superOpsItems, 'super')}
                          <div className="my-1" />
                          {renderCollapsibleSection(t('adminPages.sidebar.financial'), 'superFinance', superFinanceItems, 'super')}
                          <div className="my-1" />
                          {renderCollapsibleSection(t('adminPages.sidebar.system'), 'superSystem', superSystemItems, 'super')}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.div className="space-y-0.5" variants={containerVariants} initial="hidden" animate="show">
                  {superOpsItems.slice(0, 3).map((item, idx) => renderNavItem(item, idx, 'super'))}
                </motion.div>
              )}
            </>
          )}
        </nav>

        {/* ─── Footer ───────────────────────── */}
        <div className="relative z-20 border-t border-[hsl(var(--neon-cyan)_/_0.08)] p-3">
          {!isCollapsed ? (
            <div className="flex items-center justify-center gap-2">
              <Zap className="h-3 w-3 text-[hsl(var(--neon-cyan)_/_0.4)] neon-pulse" />
              <span className="text-[10px] tracking-[0.1em] text-[hsl(var(--neon-cyan)_/_0.3)] font-mono uppercase">
                CyberShield v5.0.10
              </span>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center py-1">
                  <Zap className="h-3 w-3 text-[hsl(var(--neon-cyan)_/_0.4)] neon-pulse" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="glass-panel text-[hsl(190_95%_70%)] border-[hsl(190_95%_55%_/_0.2)]">
                CyberShield v5.0.10
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
};
