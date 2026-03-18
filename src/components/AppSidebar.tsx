import { 
  Home, Shield, Users, ScrollText, Settings, 
  ChevronLeft, ChevronRight, ChevronDown, Server, 
  Activity, CreditCard, Crown, BarChart3, AlertTriangle, 
  Brain, Terminal, Globe, Clock, Gauge, 
  Bell, TrendingUp, PieChart, Target, DollarSign, Presentation, Scale, 
  Heart, Search, Monitor, AppWindow, GitBranch,
  Download, FileText, Cpu, Percent, ClipboardCheck, FileBarChart,
  AlertCircle, Wrench, Key, ShieldCheck, FileSearch,
  Zap, X, UserPlus, ListTodo, BookOpen, ShieldAlert, Fingerprint,
  Eye, Workflow, Plug, Palette, Map, Code,
  BrainCircuit, Sparkles, BarChart, Bot, Layers
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
import { useFavorites } from '@/hooks/useFavorites';
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
  const { favorites, isFavorite } = useFavorites();
  const location = useLocation();
  const { t } = useTranslation();
  
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  const [sectionStates, setSectionStates] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sidebar-sections-v5');
    return saved ? JSON.parse(saved) : {
      protection: true,
      management: true,
      compliance: false,
      advanced: false,
      aiAnalysis: false,
      superAdmin: false,
      superOps: true,
      superFinance: false,
      superSystem: false,
      superAI: false,
      superIntegrations: false,
    };
  });

  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebar-sections-v5', JSON.stringify(sectionStates));
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

  // ─── USER-FACING: Visible by default ─────────────────────
  const overviewItems = useMemo<MenuItem[]>(() => [
    { icon: Target, label: 'Pendências', to: '/admin/action-center', end: true, badge: urgentCount > 0 ? urgentCount : undefined },
    { icon: Home, label: 'Início', to: '/admin/dashboard' },
    { icon: Presentation, label: 'Resumo Executivo', to: '/admin/executive' },
    { icon: Cpu, label: 'Meus Computadores', to: '/admin/agent-center' },
    { icon: Activity, label: 'Tempo Real', to: '/admin/monitoring-advanced' },
    { icon: Sparkles, label: 'Novo Cliente', to: '/admin/onboarding' },
  ], [urgentCount]);

  const securityItems = useMemo<MenuItem[]>(() => [
    { icon: AlertTriangle, label: 'Central de Ameaças', to: '/admin/threat-center' },
    { icon: ShieldCheck, label: 'Vulnerabilidades', to: '/admin/vulnerability-center' },
    { icon: Globe, label: 'Segurança de Rede', to: '/admin/network-security' },
    { icon: AppWindow, label: 'Segurança de Ativos', to: '/admin/asset-security' },
    { icon: AlertCircle, label: 'Itens Suspeitos', to: '/quarantine' },
    { icon: AlertCircle, label: 'Resolver Alertas', to: '/admin/alert-resolution' },
  ], []);

  const managementItems = useMemo<MenuItem[]>(() => [
    { icon: Shield, label: 'Regras', to: '/admin/security-policies' },
    { icon: Crown, label: 'Equipe', to: '/admin/members' },
    { icon: FileBarChart, label: 'Relatórios', to: '/admin/reports' },
    { icon: Bell, label: 'Avisos', to: '/admin/notification-channels' },
    { icon: Settings, label: 'Configurações', to: '/admin/tenant' },
  ], []);

  // ─── ADMIN: Collapsed by default ─────────────────────
  const complianceItems = useMemo<MenuItem[]>(() => [
    { icon: ClipboardCheck, label: 'Visão Geral', to: '/admin/compliance-hub' },
    { icon: FileSearch, label: 'Provas & Auditoria', to: '/admin/compliance-hub?tab=evidence' },
    { icon: Workflow, label: 'Procedimentos', to: '/admin/compliance-hub?tab=procedures' },
    { icon: BarChart3, label: 'Risco', to: '/admin/compliance-hub?tab=risk' },
  ], []);

  const intelligenceItems = useMemo<MenuItem[]>(() => [
    { icon: BrainCircuit, label: 'Insights', to: '/admin/intelligence-hub', badge: criticalInsightsCount > 0 ? criticalInsightsCount : undefined },
    { icon: Zap, label: 'Automação', to: '/admin/intelligence-hub?tab=automation' },
    { icon: Eye, label: 'Governança', to: '/admin/intelligence-hub?tab=governance' },
    { icon: BookOpen, label: 'Conhecimento', to: '/admin/intelligence-hub?tab=knowledge' },
  ], [criticalInsightsCount]);

  const advancedItems = useMemo<MenuItem[]>(() => [
    { icon: Download, label: 'Instalações', to: '/admin/installations' },
    { icon: GitBranch, label: 'Atualizações', to: '/admin/agent-releases' },
    { icon: Terminal, label: 'Diagnóstico', to: '/admin/diagnostics' },
    { icon: Clock, label: 'Tarefas Agendadas', to: '/admin/automations' },
    { icon: Zap, label: 'Correção Automática', to: '/admin/auto-remediation' },
    { icon: ShieldAlert, label: 'Proteção ao Vivo', to: '/admin/realtime-security' },
    { icon: UserPlus, label: 'Convites', to: '/admin/invites' },
    { icon: ListTodo, label: 'Tarefas', to: '/admin/tasks' },
    { icon: Fingerprint, label: 'Minha Conta', to: '/admin/my-account' },
    { icon: CreditCard, label: 'Planos', to: '/admin/plan-upgrade' },
  ], []);

  // ─── SUPER ADMIN Menu Items ─────────────────────
  const superOpsItems = useMemo<MenuItem[]>(() => [
    { icon: Server, label: 'Empresas', to: '/super-admin/tenants', end: true },
    { icon: Key, label: 'Chaves de Cadastro', to: '/super-admin/enrollment-keys' },
    { icon: Percent, label: 'Rollout', to: '/super-admin/rollout-policies' },
    { icon: Users, label: 'Usuários', to: '/super-admin/users' },
    { icon: Shield, label: 'Funcionalidades', to: '/super-admin/features' },
    { icon: Clock, label: 'Suspensão', to: '/super-admin/tenant-suspension' },
  ], []);

  const superFinanceItems = useMemo<MenuItem[]>(() => [
    { icon: BarChart3, label: 'Métricas', to: '/super-admin/metrics' },
    { icon: PieChart, label: 'Assinaturas', to: '/super-admin/subscription-analytics' },
    { icon: DollarSign, label: 'Indicadores', to: '/super-admin/unit-economics' },
    { icon: TrendingUp, label: 'Retenção', to: '/super-admin/cohort-analysis' },
    { icon: Target, label: 'Projeções', to: '/super-admin/revenue-projections' },
    { icon: Presentation, label: 'Pipeline', to: '/super-admin/sales-pipeline' },
    { icon: Scale, label: 'Apresentação', to: '/super-admin/pitch-deck' },
    { icon: AlertTriangle, label: 'Riscos', to: '/super-admin/risk-analysis' },
    
    { icon: CreditCard, label: 'Pagamentos', to: '/super-admin/stripe-setup' },
  ], []);

  const superSystemItems = useMemo<MenuItem[]>(() => [
    { icon: ScrollText, label: 'Auditoria', to: '/super-admin/audit-logs' },
    { icon: Activity, label: 'Logs', to: '/super-admin/system-logs' },
    { icon: Gauge, label: 'Operações', to: '/admin/operations-hub' },
    { icon: Heart, label: 'Saúde', to: '/admin/operations-hub?tab=health' },
    { icon: BarChart, label: 'Performance', to: '/admin/operations-hub?tab=performance' },
    { icon: Wrench, label: 'Ferramentas', to: '/admin/operations-hub?tab=tools' },
  ], []);

  const superAIItems = useMemo<MenuItem[]>(() => [
    { icon: BarChart, label: 'Métricas IA', to: '/admin/ai-metrics' },
    { icon: Eye, label: 'Governança IA', to: '/admin/ai-governance' },
    { icon: Bot, label: 'Autonomia IA', to: '/admin/ai-autonomy' },
  ], []);

  const superIntegrationsItems = useMemo<MenuItem[]>(() => [
    { icon: Plug, label: 'ITSM', to: '/admin/itsm' },
    { icon: FileText, label: 'Exportar SIEM', to: '/admin/siem-export' },
    { icon: Palette, label: 'Marca Própria', to: '/admin/white-label' },
    { icon: Map, label: 'Plataformas', to: '/admin/platforms' },
    { icon: Code, label: 'API', to: '/admin/api-docs' },
    { icon: Bell, label: 'Notificações', to: '/admin/notification-settings' },
  ], []);

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
    variant: 'default' | 'super' = 'default',
    icon?: any
  ) => {
    const isOpen = sectionStates[sectionKey];
    const hasActiveItem = isRouteInSection(items);
    const isSuper = variant === 'super';
    
    if (isCollapsed) {
      return (
        <motion.div className="space-y-0.5" variants={containerVariants} initial="hidden" animate="show">
          {items.map((item, idx) => renderNavItem(item, idx, variant))}
        </motion.div>
      );
    }

    return (
      <div className="mb-0.5">
        <button 
          onClick={() => toggleSection(sectionKey)} 
          className={cn(
            "w-full flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-all duration-200 group/section",
            isSuper 
              ? "hover:bg-[hsl(var(--neon-purple)_/_0.05)]" 
              : "hover:bg-[hsl(var(--neon-cyan)_/_0.04)]",
            hasActiveItem && !isSuper && "bg-[hsl(var(--neon-cyan)_/_0.03)]",
            hasActiveItem && isSuper && "bg-[hsl(var(--neon-purple)_/_0.03)]"
          )}
        >
          <span className={cn(
            "flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-bold transition-colors",
            isSuper 
              ? "text-[hsl(var(--neon-purple)_/_0.5)] group-hover/section:text-[hsl(var(--neon-purple)_/_0.7)]"
              : "text-[hsl(var(--neon-cyan)_/_0.45)] group-hover/section:text-[hsl(var(--neon-cyan)_/_0.7)]",
            hasActiveItem && !isSuper && "!text-[hsl(var(--neon-cyan)_/_0.8)]",
            hasActiveItem && isSuper && "!text-[hsl(var(--neon-purple)_/_0.8)]"
          )}>
            {title}
          </span>
          <div className={cn(
            "flex items-center gap-1.5"
          )}>
            {!isOpen && hasActiveItem && (
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                isSuper ? "bg-[hsl(var(--neon-purple))]" : "bg-[hsl(var(--neon-cyan))]"
              )} />
            )}
            <ChevronDown className={cn(
              "h-3 w-3 transition-all duration-300",
              isSuper 
                ? "text-[hsl(var(--neon-purple)_/_0.3)] group-hover/section:text-[hsl(var(--neon-purple)_/_0.6)]"
                : "text-[hsl(var(--neon-cyan)_/_0.3)] group-hover/section:text-[hsl(var(--neon-cyan)_/_0.6)]",
              isOpen && "rotate-180"
            )} />
          </div>
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <motion.div 
                className="space-y-0.5 mt-0.5 ml-1 border-l border-[hsl(var(--neon-cyan)_/_0.06)] pl-1"
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
            <motion.div variants={containerVariants} initial="show" animate="show" className="space-y-1">
              {/* FAVORITES - pinned pages */}
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
                      {favItems.map((item, idx) => (
                        <div key={`fav-${item.to}`}>
                          {renderNavItem(item, idx)}
                        </div>
                      ))}
                    </div>
                    <div className="sidebar-divider-neon my-2.5 mx-2" />
                  </>
                );
              })()}

              {/* OVERVIEW - always visible, no section header */}
              <div className="space-y-0.5">
                {overviewItems.map((item, idx) => (
                  <div key={item.to}>
                    {renderNavItem(item, idx)}
                  </div>
                ))}
              </div>

              <div className="sidebar-divider-neon my-2.5 mx-2" />

              {/* Main protection & management sections */}
              {renderCollapsibleSection('🛡️ Proteção', 'protection', securityItems)}
              {renderCollapsibleSection('⚙️ Organização', 'management', managementItems)}

              <div className="sidebar-divider-neon my-2.5 mx-2" />
              
              {/* Admin sections - more compact */}
              <div className="px-3 py-0.5">
                <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--neon-cyan)_/_0.2)]">Administração</span>
              </div>

              {renderCollapsibleSection('📋 Normas e Regras', 'compliance', complianceItems)}
              {renderCollapsibleSection('🧠 Automação Inteligente', 'aiAnalysis', intelligenceItems)}
              {renderCollapsibleSection('🔧 Ferramentas', 'advanced', advancedItems)}
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
                    onClick={() => toggleSection('superAdmin')}
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
                          {renderCollapsibleSection('Operacional', 'superOps', superOpsItems, 'super')}
                          {renderCollapsibleSection('Financeiro', 'superFinance', superFinanceItems, 'super')}
                          {renderCollapsibleSection('Sistema', 'superSystem', superSystemItems, 'super')}
                          {renderCollapsibleSection('IA', 'superAI', superAIItems, 'super')}
                          {renderCollapsibleSection('Integrações', 'superIntegrations', superIntegrationsItems, 'super')}
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
                CyberShield v5.0.13
              </span>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center">
                  <Zap className="h-3 w-3 text-[hsl(var(--neon-cyan)_/_0.4)] neon-pulse" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="glass-panel text-[hsl(190_95%_70%)] border-[hsl(190_95%_55%_/_0.2)]">
                CyberShield v5.0.13
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
};
