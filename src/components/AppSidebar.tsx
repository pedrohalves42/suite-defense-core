import { Home, Shield, Package, Users, Key, Mail, ScrollText, Settings, ChevronLeft, ChevronRight, Zap, TestTube, Server, FileDown, Activity, CreditCard, Crown, BarChart3, AlertTriangle, Brain, CheckCircle, Terminal, Globe, Clock, Gauge, Inbox, ShieldCheck, Bell, TrendingUp, PieChart, Target, DollarSign, Presentation, Scale, Code, Heart } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';

export const AppSidebar = () => {
  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useSuperAdmin();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', collapsed.toString());
    window.dispatchEvent(new Event('sidebar-toggle'));
  }, [collapsed]);

  const menuItems = useMemo(() => [
    { icon: Home, label: 'Dashboard', to: '/dashboard', end: true },
    { icon: Server, label: 'Monitoramento', to: '/monitoring' },
    { icon: Server, label: 'Meus Computadores', to: '/agents' },
    { icon: Zap, label: 'Tarefas', to: '/jobs' },
    { icon: Shield, label: 'Verificações de Vírus', to: '/virus-scans' },
    { icon: Shield, label: 'Quarentena', to: '/quarantine' },
    { icon: Package, label: 'Instalador', to: '/installer' },
    { icon: FileDown, label: 'Exportar Dados', to: '/export' },
    { icon: TestTube, label: 'Testar Computadores', to: '/agent-test' },
  ], []);

  const adminItems = useMemo(() => [
    // === OVERVIEW ===
    { icon: Home, label: 'Painel de Controle', to: '/admin/dashboard', end: true, section: 'overview' },
    
    // === MONITORAMENTO ===
    { icon: Activity, label: 'Tempo Real', to: '/admin/monitoring-advanced', section: 'monitoring' },
    { icon: Activity, label: 'Status dos Computadores', to: '/admin/agent-health', section: 'monitoring' },
    { icon: Terminal, label: 'Diagnóstico', to: '/admin/agent-diagnostics', section: 'monitoring' },
    
    // === SEGURANÇA ===
    { icon: ShieldCheck, label: 'Políticas', to: '/admin/security-policies', section: 'security' },
    { icon: Shield, label: 'Monitoramento', to: '/admin/security-monitoring', section: 'security' },
    { icon: Package, label: 'Programas Instalados', to: '/admin/software-inventory', section: 'security' },
    { icon: AlertTriangle, label: 'Vulnerabilidades', to: '/admin/vulnerabilities', section: 'security' },
    { icon: Globe, label: 'Navegação Web', to: '/admin/web-activity', section: 'security' },
    { icon: Clock, label: 'Histórico', to: '/admin/agent-timeline', section: 'security' },
    { icon: ScrollText, label: 'Laudos', to: '/admin/reports', section: 'security' },
    
    // === INFRAESTRUTURA ===
    { icon: Package, label: 'Instalações', to: '/admin/installations', section: 'infrastructure' },
    { icon: Package, label: 'Versões do Software', to: '/admin/agent-releases', section: 'infrastructure' },
    { icon: Heart, label: 'Saúde do Sistema', to: '/admin/slo-dashboard', section: 'infrastructure' },
    { icon: Gauge, label: 'Limites de Taxa', to: '/admin/rate-limiting', section: 'infrastructure' },
    { icon: Inbox, label: 'Tarefas Pendentes', to: '/admin/dead-letter-queue', section: 'infrastructure' },
    { icon: Code, label: 'API', to: '/admin/api-docs', section: 'infrastructure' },
    
    // === INTELIGÊNCIA ARTIFICIAL ===
    { icon: Brain, label: 'Insights', to: '/admin/ai-insights', section: 'ai' },
    { icon: CheckCircle, label: 'Ações', to: '/admin/ai-actions', section: 'ai' },
    { icon: BarChart3, label: 'Métricas', to: '/admin/ai-metrics', section: 'ai' },
    { icon: Shield, label: 'Governança', to: '/admin/ai-governance', section: 'ai' },
    
    // === GESTÃO ===
    { icon: Users, label: 'Equipe', to: '/admin/members', section: 'management' },
    { icon: Mail, label: 'Convites', to: '/admin/invites', section: 'management' },
    { icon: Settings, label: 'Configurações', to: '/admin/tenant', section: 'management' },
    { icon: Bell, label: 'Notificações', to: '/admin/notification-settings', section: 'management' },
    
    // === FINANCEIRO ===
    { icon: CreditCard, label: 'Planos', to: '/admin/plan-upgrade', section: 'billing' },
    { icon: Activity, label: 'Assinaturas', to: '/admin/subscriptions', section: 'billing' },
  ], []);

  const superAdminItems = useMemo(() => [
    { icon: Home, label: 'Minha Empresa', to: '/admin/dashboard', end: false },
    { icon: Package, label: 'Empresas', to: '/super-admin/tenants', end: true },
    { icon: Package, label: 'Versões do Software', to: '/admin/agent-releases', end: false },
    { icon: BarChart3, label: 'Métricas Globais', to: '/super-admin/metrics' },
    { icon: BarChart3, label: 'Análise de Assinaturas', to: '/super-admin/subscription-analytics' },
    // === FINANCEIRO ===
    { icon: DollarSign, label: 'Indicadores Financeiros', to: '/super-admin/unit-economics' },
    { icon: PieChart, label: 'Análise de Retenção', to: '/super-admin/cohort-analysis' },
    { icon: TrendingUp, label: 'Projeções de Receita', to: '/super-admin/revenue-projections' },
    { icon: Target, label: 'Pipeline de Vendas', to: '/super-admin/sales-pipeline' },
    { icon: Presentation, label: 'Apresentação', to: '/super-admin/pitch-deck' },
    { icon: Scale, label: 'Análise de Riscos', to: '/super-admin/risk-analysis' },
    { icon: CreditCard, label: 'Pagamentos', to: '/super-admin/stripe-setup' },
    { icon: Users, label: 'Todos os Usuários', to: '/super-admin/users' },
    { icon: Shield, label: 'Funcionalidades', to: '/super-admin/features' },
    { icon: Key, label: 'Chaves de API', to: '/super-admin/api-keys' },
    { icon: Key, label: 'Chaves de Instalação', to: '/super-admin/enrollment-keys' },
    { icon: Mail, label: 'Convites', to: '/super-admin/invites' },
    { icon: AlertTriangle, label: 'Segurança', to: '/super-admin/security' },
    { icon: ScrollText, label: 'Registros de Auditoria', to: '/super-admin/audit-logs' },
    { icon: Activity, label: 'Registros do Sistema', to: '/super-admin/system-logs' },
    { icon: Settings, label: 'Configurações', to: '/super-admin/settings' },
  ], []);

  const renderNavItem = (item: { icon: any; label: string; to: string; end?: boolean }, idx: number, variant: 'default' | 'super' = 'default') => {
    const Icon = item.icon;
    const isSuper = variant === 'super';
    
    return (
      <motion.div
        key={item.to}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: idx * 0.03 }}
      >
        <NavLink
          to={item.to}
          end={item.end}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground transition-all duration-200",
            isSuper 
              ? "hover:bg-destructive/10 hover:text-destructive"
              : "hover:bg-accent hover:text-accent-foreground"
          )}
          activeClassName={cn(
            "font-medium",
            isSuper 
              ? "bg-destructive/10 text-destructive"
              : "bg-accent text-accent-foreground"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="text-sm">{item.label}</span>}
        </NavLink>
      </motion.div>
    );
  };

  const renderSection = (title: string, items: any[], variant: 'default' | 'super' = 'default') => (
    <>
      {!collapsed && <div className="h-px bg-border my-2 mx-2" />}
      {!collapsed && (
        <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </p>
      )}
      {items.map((item, idx) => renderNavItem(item, idx, variant))}
    </>
  );

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen border-r border-border bg-card transition-all duration-300 z-40 flex flex-col',
        collapsed ? 'w-16' : 'w-56'
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
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0 h-8 w-8"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

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
            {!collapsed && (
              <p className="px-3 py-1 text-xs font-medium text-destructive uppercase tracking-wider flex items-center gap-1">
                <Crown className="h-3 w-3" />
                Super Admin
              </p>
            )}
            <div className="space-y-0.5">
              {superAdminItems.map((item, idx) => renderNavItem(item, idx, 'super'))}
            </div>
          </>
        )}

        {/* Admin Menu */}
        {isAdmin && (
          <>
            <div className="my-3 mx-2 h-px bg-border" />
            
            {/* Overview */}
            <div className="space-y-0.5">
              {adminItems.filter(i => i.section === 'overview').map((item, idx) => renderNavItem(item, idx))}
            </div>

            {renderSection('Monitoramento', adminItems.filter(i => i.section === 'monitoring'))}
            {renderSection('Segurança', adminItems.filter(i => i.section === 'security'))}
            {renderSection('Infraestrutura', adminItems.filter(i => i.section === 'infrastructure'))}
            {renderSection('Inteligência Artificial', adminItems.filter(i => i.section === 'ai'))}
            {renderSection('Gestão', adminItems.filter(i => i.section === 'management'))}
            {renderSection('Financeiro', adminItems.filter(i => i.section === 'billing'))}
          </>
        )}
      </nav>
    </aside>
  );
};
