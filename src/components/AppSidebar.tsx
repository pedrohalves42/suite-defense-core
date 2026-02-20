import { 
  Home, Shield, Users, ScrollText, Settings, 
  ChevronLeft, ChevronRight, ChevronDown, Server, 
  Activity, CreditCard, Crown, BarChart3, AlertTriangle, 
  Brain, Terminal, Globe, Clock, Gauge, 
  Bell, TrendingUp, PieChart, Target, DollarSign, Presentation, Scale, 
  Heart, Search, Monitor, AppWindow, GitBranch,
  Download, Building2, FileText, Cpu, Network, Percent, ClipboardCheck, FileBarChart,
  AlertCircle, Lightbulb, Wrench, Key, ShieldCheck, FileSearch, Tag, Crosshair
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
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

  // Section collapse states - saved to localStorage
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

  // Save section states
  useEffect(() => {
    localStorage.setItem('sidebar-sections-v3', JSON.stringify(sectionStates));
  }, [sectionStates]);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', collapsed.toString());
    window.dispatchEvent(new Event('sidebar-toggle'));
  }, [collapsed]);

  // Toggle section
  const toggleSection = useCallback((section: string) => {
    setSectionStates(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  // Check if current route is in section
  const isRouteInSection = useCallback((items: MenuItem[]) => {
    return items.some(item => location.pathname.startsWith(item.to));
  }, [location.pathname]);

  // Keyboard shortcut for search (Cmd+K)
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

  // === VISÃO GERAL (sempre visível) ===
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
    { icon: Settings, label: t('adminPages.sidebar.settingsLabel'), to: '/super-admin/settings' },
  ], [t]);

  const renderNavItem = (item: MenuItem, idx: number, variant: 'default' | 'super' = 'default') => {
    const Icon = item.icon;
    const isSuper = variant === 'super';
    const isActive = location.pathname === item.to || (item.to !== '/admin/dashboard' && location.pathname.startsWith(item.to));
    
    const isCollapsed = !mobile && collapsed;

    const navContent = (
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground transition-all duration-200 relative",
          isSuper 
            ? "hover:bg-destructive/10 hover:text-destructive"
            : "hover:bg-muted hover:text-foreground",
          isCollapsed && "justify-center px-2"
        )}
        activeClassName={cn(
          "font-medium text-foreground",
          isSuper 
            ? "bg-destructive/10 text-destructive"
            : "bg-primary/5"
        )}
      >
        {/* Barra vertical Graphite Green para item ativo */}
        {isActive && !isSuper && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r" />
        )}
        <Icon className="h-4 w-4 shrink-0" />
        {!isCollapsed && (
          <>
            <span className="text-sm flex-1">{item.label}</span>
            {item.badge && item.badge > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-warning/10 text-warning border-0">
                {item.badge}
              </Badge>
            )}
          </>
        )}
      </NavLink>
    );

    if (isCollapsed) {
      return (
        <motion.div
          key={item.to}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: idx * 0.02 }}
        >
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                {navContent}
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                {item.label}
                {item.badge && item.badge > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                    {item.badge}
                  </Badge>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </motion.div>
      );
    }
    
    return (
      <motion.div
        key={item.to}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, delay: idx * 0.02 }}
      >
        {navContent}
      </motion.div>
    );
  };

  const renderCollapsibleSection = (
    title: string, 
    sectionKey: string,
    items: MenuItem[], 
    variant: 'default' | 'super' = 'default'
  ) => {
    const isOpen = sectionStates[sectionKey];
    const hasActiveItem = isRouteInSection(items);
    
    const isCollapsed = !mobile && collapsed;
    
    if (isCollapsed) {
      return (
        <div className="space-y-0.5">
          {items.map((item, idx) => renderNavItem(item, idx, variant))}
        </div>
      );
    }

    return (
      <Collapsible open={isOpen} onOpenChange={() => toggleSection(sectionKey)}>
        <CollapsibleTrigger className="w-full">
          <div className={cn(
            "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors",
            hasActiveItem ? "bg-accent/50" : "hover:bg-accent/30"
          )}>
            <span className={cn(
              "text-xs font-medium uppercase tracking-wider",
              hasActiveItem ? "text-primary" : "text-muted-foreground"
            )}>
              {title}
            </span>
            <ChevronDown className={cn(
              "h-3 w-3 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <AnimatePresence>
            <div className="space-y-0.5 mt-1">
              {items.map((item, idx) => renderNavItem(item, idx, variant))}
            </div>
          </AnimatePresence>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'h-screen border-r border-border',
          'bg-card transition-all duration-300 flex flex-col',
          mobile ? 'w-full relative' : 'fixed left-0 top-0 z-40',
          !mobile && (collapsed ? 'w-16' : 'w-52')
        )}
      >
        {/* Logo CyberShield Cloud + Mode Badge */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-border/30">
          {(!collapsed || mobile) && (
            <div className="flex items-center gap-2">
              <img 
                src={logoImage} 
                alt="CyberShield Logo" 
                className="h-8 w-auto object-contain"
              />
              <AppModeBadge collapsed={false} />
            </div>
          )}
          {!mobile && collapsed && (
            <div className="flex flex-col items-center gap-1 mx-auto">
              <img 
                src={logoImage} 
                alt="CyberShield Logo" 
                className="h-6 w-auto object-contain"
              />
              <AppModeBadge collapsed={true} />
            </div>
          )}
          {!mobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              className={cn("shrink-0 h-8 w-8 btn-enterprise-ghost", collapsed && "absolute right-1 top-3")}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {/* Quick Search */}
        {(!collapsed || mobile) && (
          <div className="px-2 py-2 border-b border-border/30">
            <Button 
              variant="outline" 
              className="w-full justify-start text-muted-foreground/70 h-9 px-3 border-border/50 hover:bg-accent/30"
              onClick={() => { window.dispatchEvent(new CustomEvent('open-search')); onNavigate?.(); }}
            >
              <Search className="h-4 w-4 mr-2" />
              <span className="flex-1 text-left text-sm">{t('adminPages.sidebar.search')}</span>
              {!mobile && <kbd className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>}
            </Button>
          </div>
        )}

        {!mobile && collapsed && (
          <div className="px-2 py-2 border-b border-border/30">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="w-full h-9 btn-enterprise-ghost"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-search'))}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {t('adminPages.sidebar.searchTooltip')}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Tenant Selector */}
        <div className="border-b border-border/30">
          <SidebarTenantSelector collapsed={mobile ? false : collapsed} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {isAdmin ? (
            <>
              {/* VISÃO GERAL - sempre visível */}
              <div className="space-y-0.5 mb-3">
                {overviewItems.map((item, idx) => renderNavItem(item, idx))}
              </div>

              <div className="my-2 mx-2 h-px bg-border/30" />

              {/* PROTEÇÃO */}
              {renderCollapsibleSection(t('adminPages.sidebar.protection'), 'protection', protectionItems)}

              <div className="my-2" />

              {renderCollapsibleSection(t('adminPages.sidebar.management'), 'management', managementItems)}

              <div className="my-2" />

              {renderCollapsibleSection(t('adminPages.sidebar.compliance'), 'compliance', complianceItems)}

              <div className="my-2" />

              {renderCollapsibleSection(t('adminPages.sidebar.advanced'), 'advanced', advancedItems)}
            </>
          ) : (
            // Non-admin basic menu
            <div className="space-y-0.5">
              <NavLink
                to="/dashboard"
                end
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                activeClassName="bg-accent text-accent-foreground font-medium"
              >
                <Home className="h-4 w-4" />
                {(!collapsed || mobile) && <span className="text-sm">{t('adminPages.sidebar.home')}</span>}
              </NavLink>
              <NavLink
                to="/agents"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                activeClassName="bg-accent text-accent-foreground font-medium"
              >
                <Monitor className="h-4 w-4" />
                {(!collapsed || mobile) && <span className="text-sm">{t('adminPages.sidebar.myComputersClient')}</span>}
              </NavLink>
            </div>
          )}

          {/* Super Admin */}
          {isSuperAdmin && (
            <>
              <div className="my-3 mx-2 h-px bg-border/30" />
              {!collapsed ? (
                <Collapsible 
                  open={sectionStates.superAdmin} 
                  onOpenChange={() => toggleSection('superAdmin')}
                >
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-destructive/10 cursor-pointer">
                      <span className="text-xs font-medium text-destructive uppercase tracking-wider flex items-center gap-1">
                        <Crown className="h-3 w-3" />
                        Super Admin
                      </span>
                      <ChevronDown className={cn(
                        "h-3 w-3 text-destructive transition-transform duration-200",
                        sectionStates.superAdmin && "rotate-180"
                      )} />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <AnimatePresence>
                      <div className="space-y-1 mt-1">
                        {renderCollapsibleSection(t('adminPages.sidebar.operational'), 'superOps', superOpsItems, 'super')}
                        
                        <div className="my-1" />
                        
                        {renderCollapsibleSection(t('adminPages.sidebar.financial'), 'superFinance', superFinanceItems, 'super')}
                        
                        <div className="my-1" />
                        
                        {renderCollapsibleSection(t('adminPages.sidebar.system'), 'superSystem', superSystemItems, 'super')}
                      </div>
                    </AnimatePresence>
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                <div className="space-y-0.5">
                  {superOpsItems.slice(0, 3).map((item, idx) => renderNavItem(item, idx, 'super'))}
                </div>
              )}
            </>
          )}
        </nav>

        {/* Footer elegante */}
        <div className="border-t border-border/30 p-3">
          {(!collapsed || mobile) ? (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/50">
              <Shield className="h-3 w-3" />
              <span className="tracking-wide">v5.0.3</span>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center py-1">
                  <Shield className="h-3 w-3 text-muted-foreground/50" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                CyberShield v5.0.3
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
};
