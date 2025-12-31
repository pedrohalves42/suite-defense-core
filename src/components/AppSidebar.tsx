import { 
  Home, Shield, Users, ScrollText, Settings, 
  ChevronLeft, ChevronRight, ChevronDown, Server, 
  Activity, CreditCard, Crown, BarChart3, AlertTriangle, 
  Brain, Terminal, Globe, Clock, Gauge, 
  Bell, TrendingUp, PieChart, Target, DollarSign, Presentation, Scale, 
  Heart, Search, Monitor, AppWindow, GitBranch,
  Download, Building2, FileText, Cpu, Network, Percent, ClipboardCheck, FileBarChart
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { SidebarTenantSelector } from '@/components/SidebarTenantSelector';

interface MenuItem {
  icon: any;
  label: string;
  to: string;
  end?: boolean;
  badge?: number;
}

export const AppSidebar = () => {
  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useSuperAdmin();
  const { data: criticalInsightsCount = 0 } = useCriticalInsights();
  const { urgentCount } = useActionCenterCount();
  const location = useLocation();
  
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  // Section collapse states - saved to localStorage
  const [sectionStates, setSectionStates] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sidebar-sections-v2');
    return saved ? JSON.parse(saved) : {
      protection: true,
      management: false,
      advanced: false,
      superAdmin: true
    };
  });

  // Save section states
  useEffect(() => {
    localStorage.setItem('sidebar-sections-v2', JSON.stringify(sectionStates));
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
    { icon: Target, label: 'Central de Ações', to: '/admin/action-center', end: true, badge: urgentCount > 0 ? urgentCount : undefined },
    { icon: Home, label: 'Painel Geral', to: '/admin/dashboard' },
    { icon: Activity, label: 'Tempo Real', to: '/admin/monitoring-advanced' },
    { icon: Cpu, label: 'Meus Computadores', to: '/admin/agent-health' },
  ], [urgentCount]);

  // === PROTEÇÃO (colapsável - expandido por padrão) ===
  const protectionItems = useMemo<MenuItem[]>(() => [
    { icon: AlertTriangle, label: 'Alertas', to: '/admin/security-monitoring' },
    { icon: Shield, label: 'Vulnerabilidades', to: '/admin/vulnerabilities' },
    { icon: AlertTriangle, label: 'Quarentena', to: '/quarantine' },
    { icon: Globe, label: 'Navegação Web', to: '/admin/web-activity' },
    { icon: Clock, label: 'Histórico', to: '/admin/agent-timeline' },
  ], []);

  // === GESTÃO (colapsável) ===
  const managementItems = useMemo<MenuItem[]>(() => [
    { icon: Users, label: 'Grupos', to: '/admin/agent-groups' },
    { icon: Shield, label: 'Políticas', to: '/admin/security-policies' },
    { icon: AppWindow, label: 'Programas', to: '/admin/software-inventory' },
    { icon: Users, label: 'Equipe', to: '/admin/members' },
    { icon: Settings, label: 'Configurações', to: '/admin/tenant' },
    { icon: Bell, label: 'Notificações', to: '/admin/notification-channels' },
  ], []);

  // === AVANÇADO (colapsável) ===
  const advancedItems = useMemo<MenuItem[]>(() => [
    { icon: Clock, label: 'Automações', to: '/admin/automations' },
    { icon: Download, label: 'Instalações', to: '/admin/installations' },
    { icon: GitBranch, label: 'Versões', to: '/admin/agent-releases' },
    { icon: Terminal, label: 'Diagnóstico', to: '/admin/agent-diagnostics' },
    { icon: Gauge, label: 'Saúde Sistema', to: '/admin/system-health' },
    { icon: ClipboardCheck, label: 'SOC 2', to: '/admin/soc2-compliance' },
    { icon: FileText, label: 'Auditoria', to: '/admin/system-audit' },
    { icon: FileBarChart, label: 'Relatórios', to: '/admin/reports' },
    { icon: Scale, label: 'Compliance', to: '/admin/compliance-timeline' },
    { icon: Brain, label: 'Regras IA', to: '/admin/rules-management', badge: criticalInsightsCount > 0 ? criticalInsightsCount : undefined },
    { icon: CreditCard, label: 'Planos', to: '/admin/plan-upgrade' },
  ], [criticalInsightsCount]);

  // === SUPER ADMIN ===
  const superAdminItems = useMemo<MenuItem[]>(() => [
    { icon: Building2, label: 'Minha Empresa', to: '/admin/dashboard', end: false },
    { icon: Server, label: 'Empresas', to: '/super-admin/tenants', end: true },
    { icon: GitBranch, label: 'Versões', to: '/admin/agent-releases', end: false },
    { icon: Percent, label: 'Rollout', to: '/super-admin/rollout-policies', end: false },
    { icon: BarChart3, label: 'Métricas', to: '/super-admin/metrics' },
    { icon: PieChart, label: 'Assinaturas', to: '/super-admin/subscription-analytics' },
    { icon: DollarSign, label: 'Indicadores', to: '/super-admin/unit-economics' },
    { icon: TrendingUp, label: 'Retenção', to: '/super-admin/cohort-analysis' },
    { icon: Target, label: 'Projeções', to: '/super-admin/revenue-projections' },
    { icon: Presentation, label: 'Pipeline', to: '/super-admin/sales-pipeline' },
    { icon: Scale, label: 'Apresentação', to: '/super-admin/pitch-deck' },
    { icon: AlertTriangle, label: 'Riscos', to: '/super-admin/risk-analysis' },
    { icon: CreditCard, label: 'Pagamentos', to: '/super-admin/stripe-setup' },
    { icon: Users, label: 'Usuários', to: '/super-admin/users' },
    { icon: Shield, label: 'Funcionalidades', to: '/super-admin/features' },
    { icon: ScrollText, label: 'Auditoria', to: '/super-admin/audit-logs' },
    { icon: Activity, label: 'Logs', to: '/super-admin/system-logs' },
    { icon: Settings, label: 'Configurações', to: '/super-admin/settings' },
  ], []);

  const renderNavItem = (item: MenuItem, idx: number, variant: 'default' | 'super' = 'default') => {
    const Icon = item.icon;
    const isSuper = variant === 'super';
    
    const navContent = (
      <NavLink
        to={item.to}
        end={item.end}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground transition-all duration-200",
          isSuper 
            ? "hover:bg-destructive/10 hover:text-destructive"
            : "hover:bg-accent hover:text-accent-foreground",
          collapsed && "justify-center px-2"
        )}
        activeClassName={cn(
          "font-medium",
          isSuper 
            ? "bg-destructive/10 text-destructive"
            : "bg-accent text-accent-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="text-sm flex-1">{item.label}</span>
            {item.badge && item.badge > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {item.badge}
              </Badge>
            )}
          </>
        )}
      </NavLink>
    );

    if (collapsed) {
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
    
    if (collapsed) {
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
          'fixed left-0 top-0 h-screen border-r border-border bg-card transition-all duration-300 z-40 flex flex-col',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary rounded-lg">
                <Shield className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground">CyberShield</span>
            </div>
          )}
          {collapsed && (
            <div className="p-1.5 bg-primary rounded-lg mx-auto">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className={cn("shrink-0 h-8 w-8", collapsed && "absolute right-1 top-3")}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Quick Search */}
        {!collapsed && (
          <div className="px-2 py-2 border-b border-border">
            <Button 
              variant="outline" 
              className="w-full justify-start text-muted-foreground h-9 px-3"
              onClick={() => window.dispatchEvent(new CustomEvent('open-search'))}
            >
              <Search className="h-4 w-4 mr-2" />
              <span className="flex-1 text-left text-sm">Buscar...</span>
              <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
            </Button>
          </div>
        )}

        {collapsed && (
          <div className="px-2 py-2 border-b border-border">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="w-full h-9"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-search'))}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Buscar (⌘K)
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Tenant Selector */}
        <div className="border-b border-border">
          <SidebarTenantSelector collapsed={collapsed} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {isAdmin ? (
            <>
              {/* VISÃO GERAL - sempre visível */}
              <div className="space-y-0.5 mb-3">
                {overviewItems.map((item, idx) => renderNavItem(item, idx))}
              </div>

              <div className="my-2 mx-2 h-px bg-border" />

              {/* PROTEÇÃO */}
              {renderCollapsibleSection('Proteção', 'protection', protectionItems)}

              <div className="my-2" />

              {/* GESTÃO */}
              {renderCollapsibleSection('Gestão', 'management', managementItems)}

              <div className="my-2" />

              {/* AVANÇADO */}
              {renderCollapsibleSection('Avançado', 'advanced', advancedItems)}
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
                {!collapsed && <span className="text-sm">Início</span>}
              </NavLink>
              <NavLink
                to="/agents"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                activeClassName="bg-accent text-accent-foreground font-medium"
              >
                <Monitor className="h-4 w-4" />
                {!collapsed && <span className="text-sm">Meus Computadores</span>}
              </NavLink>
            </div>
          )}

          {/* Super Admin */}
          {isSuperAdmin && (
            <>
              <div className="my-3 mx-2 h-px bg-border" />
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
                      <div className="space-y-0.5 mt-1">
                        {superAdminItems.map((item, idx) => renderNavItem(item, idx, 'super'))}
                      </div>
                    </AnimatePresence>
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                <div className="space-y-0.5">
                  {superAdminItems.slice(0, 5).map((item, idx) => renderNavItem(item, idx, 'super'))}
                </div>
              )}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-2">
          {!collapsed ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Heart className="h-3 w-3" />
              <span>CyberShield v2.0</span>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center py-2">
                  <Heart className="h-3 w-3 text-muted-foreground" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                CyberShield v2.0
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
};
