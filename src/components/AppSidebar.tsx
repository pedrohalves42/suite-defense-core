import { 
  Home, Shield, Package, Users, Key, Mail, ScrollText, Settings, 
  ChevronLeft, ChevronRight, ChevronDown, Zap, TestTube, Server, 
  FileDown, Activity, CreditCard, Crown, BarChart3, AlertTriangle, 
  Brain, CheckCircle, Terminal, Globe, Clock, Gauge, Inbox, ShieldCheck, 
  Bell, TrendingUp, PieChart, Target, DollarSign, Presentation, Scale, 
  Code, Heart, Search, Monitor, AppWindow, ListTodo, Receipt, GitBranch,
  Download, Star, Building2, FileText, Cpu, Network, Percent
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useCriticalInsights } from '@/hooks/useCriticalInsights';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

interface MenuItem {
  icon: any;
  label: string;
  to: string;
  end?: boolean;
  section?: string;
  badge?: number;
}

export const AppSidebar = () => {
  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useSuperAdmin();
  const { data: criticalInsightsCount = 0 } = useCriticalInsights();
  const location = useLocation();
  
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  // Section collapse states - saved to localStorage
  const [sectionStates, setSectionStates] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sidebar-sections');
    return saved ? JSON.parse(saved) : {
      monitoring: true,
      security: true,
      infrastructure: false,
      ai: false,
      management: false,
      billing: false,
      superAdmin: true
    };
  });

  // Save section states
  useEffect(() => {
    localStorage.setItem('sidebar-sections', JSON.stringify(sectionStates));
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
        // Dispatch custom event for search modal
        window.dispatchEvent(new CustomEvent('open-search'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Humanized menu items with differentiated icons
  const menuItems = useMemo<MenuItem[]>(() => [
    { icon: Home, label: 'Início', to: '/dashboard', end: true },
    { icon: Activity, label: 'Tempo Real', to: '/monitoring' },
    { icon: Monitor, label: 'Meus Computadores', to: '/agents' },
    { icon: ListTodo, label: 'Tarefas', to: '/jobs' },
    { icon: ShieldCheck, label: 'Verificações', to: '/virus-scans' },
    { icon: AlertTriangle, label: 'Quarentena', to: '/quarantine' },
    { icon: Download, label: 'Instalador', to: '/installer' },
    { icon: FileDown, label: 'Exportar', to: '/export' },
    { icon: TestTube, label: 'Testar', to: '/agent-test' },
  ], []);

  const adminItems = useMemo<MenuItem[]>(() => [
    // === OVERVIEW ===
    { icon: Home, label: 'Painel Principal', to: '/admin/dashboard', end: true, section: 'overview' },
    
    // === MONITORAMENTO (consolidado: Tempo Real + Status + Diagnóstico) ===
    { icon: Activity, label: 'Tempo Real', to: '/admin/monitoring-advanced', section: 'monitoring' },
    { icon: Cpu, label: 'Meus Computadores', to: '/admin/agent-health', section: 'monitoring' },
    
    // === SEGURANÇA (consolidado: removido Central duplicada, Histórico + Timeline em um) ===
    { icon: Users, label: 'Grupos', to: '/admin/agent-groups', section: 'security' },
    { icon: ShieldCheck, label: 'Políticas', to: '/admin/security-policies', section: 'security' },
    { icon: Shield, label: 'Alertas', to: '/admin/security-monitoring', section: 'security' },
    { icon: AppWindow, label: 'Programas', to: '/admin/software-inventory', section: 'security' },
    { icon: AlertTriangle, label: 'Vulnerabilidades', to: '/admin/vulnerabilities', section: 'security' },
    { icon: Globe, label: 'Navegação Web', to: '/admin/web-activity', section: 'security' },
    { icon: Clock, label: 'Histórico', to: '/admin/agent-timeline', section: 'security' },
    { icon: FileText, label: 'Relatórios', to: '/admin/reports', section: 'security' },
    
    // === INFRAESTRUTURA (para técnicos) ===
    { icon: Network, label: 'Instalações', to: '/admin/installations', section: 'infrastructure' },
    { icon: GitBranch, label: 'Releases', to: '/admin/agent-releases', section: 'infrastructure' },
    { icon: Terminal, label: 'Diagnóstico', to: '/admin/agent-diagnostics', section: 'infrastructure' },
    { icon: Heart, label: 'Saúde do Sistema', to: '/admin/slo-dashboard', section: 'infrastructure' },
    { icon: Inbox, label: 'Fila de Tarefas', to: '/admin/dead-letter-queue', section: 'infrastructure' },
    { icon: Code, label: 'API', to: '/admin/api-docs', section: 'infrastructure' },
    
    // === INTELIGÊNCIA ARTIFICIAL ===
    { icon: Brain, label: 'Insights', to: '/admin/ai-insights', section: 'ai', badge: criticalInsightsCount },
    { icon: CheckCircle, label: 'Ações', to: '/admin/ai-actions', section: 'ai' },
    { icon: BarChart3, label: 'Métricas', to: '/admin/ai-metrics', section: 'ai' },
    { icon: Scale, label: 'Decisões', to: '/admin/decision-audit', section: 'ai' },
    
    // === GESTÃO ===
    { icon: Users, label: 'Equipe', to: '/admin/members', section: 'management' },
    { icon: Mail, label: 'Convites', to: '/admin/invites', section: 'management' },
    { icon: Settings, label: 'Configurações', to: '/admin/tenant', section: 'management' },
    { icon: Bell, label: 'Notificações', to: '/admin/notification-settings', section: 'management' },
    
    // === FINANCEIRO ===
    { icon: CreditCard, label: 'Planos', to: '/admin/plan-upgrade', section: 'billing' },
    { icon: Receipt, label: 'Assinaturas', to: '/admin/subscriptions', section: 'billing' },
  ], []);

  const superAdminItems = useMemo<MenuItem[]>(() => [
    { icon: Building2, label: 'Minha Empresa', to: '/admin/dashboard', end: false },
    { icon: Server, label: 'Empresas', to: '/super-admin/tenants', end: true },
    { icon: GitBranch, label: 'Versões', to: '/admin/agent-releases', end: false },
    { icon: Percent, label: 'Rollout', to: '/super-admin/rollout-policies', end: false },
    { icon: BarChart3, label: 'Métricas Globais', to: '/super-admin/metrics' },
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
    { icon: Key, label: 'Chaves API', to: '/super-admin/api-keys' },
    { icon: Key, label: 'Chaves Instalação', to: '/super-admin/enrollment-keys' },
    { icon: Mail, label: 'Convites', to: '/super-admin/invites' },
    { icon: ShieldCheck, label: 'Segurança', to: '/super-admin/security' },
    { icon: ScrollText, label: 'Auditoria', to: '/super-admin/audit-logs' },
    { icon: Activity, label: 'Logs', to: '/super-admin/system-logs' },
    { icon: Settings, label: 'Configurações', to: '/super-admin/settings' },
  ], []);

  const renderNavItem = (item: MenuItem, idx: number, variant: 'default' | 'super' = 'default') => {
    const Icon = item.icon;
    const isSuper = variant === 'super';
    const isActive = location.pathname === item.to || (item.end === false && location.pathname.startsWith(item.to));
    
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

    // Wrap in tooltip when collapsed
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
      // When sidebar is collapsed, just show items without section headers
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

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {/* User Menu */}
          <div className="space-y-0.5">
            {menuItems.map((item, idx) => renderNavItem(item, idx))}
          </div>

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
                    <div className="space-y-0.5 mt-1">
                      {superAdminItems.map((item, idx) => renderNavItem(item, idx, 'super'))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                <div className="space-y-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex justify-center py-2">
                        <Crown className="h-4 w-4 text-destructive" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">Super Admin</TooltipContent>
                  </Tooltip>
                  {superAdminItems.map((item, idx) => renderNavItem(item, idx, 'super'))}
                </div>
              )}
            </>
          )}

          {/* Admin Menu */}
          {isAdmin && (
            <>
              <div className="my-3 mx-2 h-px bg-border" />
              
              {/* Overview - always visible */}
              <div className="space-y-0.5 mb-2">
                {adminItems.filter(i => i.section === 'overview').map((item, idx) => renderNavItem(item, idx))}
              </div>

              {/* Collapsible Sections */}
              <div className="space-y-1">
                {renderCollapsibleSection('📊 Monitoramento', 'monitoring', adminItems.filter(i => i.section === 'monitoring'))}
                {renderCollapsibleSection('🛡️ Segurança', 'security', adminItems.filter(i => i.section === 'security'))}
                {renderCollapsibleSection('⚙️ Infraestrutura', 'infrastructure', adminItems.filter(i => i.section === 'infrastructure'))}
                {renderCollapsibleSection('🤖 Inteligência Artificial', 'ai', adminItems.filter(i => i.section === 'ai'))}
                {renderCollapsibleSection('👥 Gestão', 'management', adminItems.filter(i => i.section === 'management'))}
                {renderCollapsibleSection('💳 Financeiro', 'billing', adminItems.filter(i => i.section === 'billing'))}
              </div>
            </>
          )}
        </nav>
      </aside>
    </TooltipProvider>
  );
};
