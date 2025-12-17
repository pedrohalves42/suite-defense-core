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

  // Itens destacados com badge visual (UX-02)
  const highlightedRoutes = useMemo(() => new Set([
    '/admin/dashboard',
    '/admin/ai-insights',
    '/admin/security-monitoring',
    '/admin/vulnerabilities',
  ]), []);

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

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen border-r border-border/50 transition-all duration-300 z-40 flex flex-col backdrop-blur-sm',
        'bg-gradient-to-b from-card via-card/95 to-card/90',
        collapsed ? 'w-16' : 'w-60'
      )}
      style={{
        backgroundImage: `radial-gradient(circle at 20% 50%, hsl(var(--primary) / 0.03) 0%, transparent 50%)`,
      }}
    >
      {/* Logo Section */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border/50 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5">
        {!collapsed && (
          <motion.div 
            className="flex items-center gap-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="p-1.5 bg-gradient-to-br from-primary to-accent rounded-lg border border-primary/20 shadow-glow-primary">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              CyberShield
            </span>
          </motion.div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0 hover:bg-accent/50 transition-all duration-300"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-2">
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.to}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
              >
                <NavLink
                  to={item.to}
                  end={item.end}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-gradient-to-r hover:from-accent/50 hover:to-accent/30 hover:text-accent-foreground transition-all duration-300 hover:translate-x-1 hover:shadow-md"
                  activeClassName="bg-gradient-to-r from-accent to-accent/70 text-accent-foreground font-medium shadow-lg border-l-2 border-primary"
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span className="text-sm">{item.label}</span>}
                </NavLink>
              </motion.div>
            );
          })}
        </div>

        {isSuperAdmin && (
          <>
            <div className="my-4 px-4">
              <div className="h-px bg-border" />
            </div>
            <div className="space-y-1 px-2">
              {!collapsed && (
                <motion.p 
                  className="px-3 py-2 text-xs font-semibold uppercase flex items-center gap-2 bg-gradient-to-r from-destructive/20 to-destructive/10 rounded-lg mx-2"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Crown className="h-3 w-3 text-destructive animate-pulse" />
                  <span className="bg-gradient-to-r from-destructive to-red-600 bg-clip-text text-transparent">
                    Super Admin
                  </span>
                </motion.p>
              )}
              {superAdminItems.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                  >
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-gradient-to-r hover:from-destructive/20 hover:to-destructive/10 hover:text-destructive transition-all duration-300 hover:translate-x-1"
                      activeClassName="bg-gradient-to-r from-destructive/20 to-destructive/10 text-destructive font-medium border-l-2 border-destructive"
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.label}</span>}
                    </NavLink>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}

        {isAdmin && (
          <>
            <div className="my-4 px-4">
              <div className="h-px bg-border" />
            </div>
            <div className="space-y-1 px-2">
              {/* Overview Section */}
              {adminItems.filter(item => item.section === 'overview').map((item, idx) => {
                const Icon = item.icon;
                const isHighlighted = highlightedRoutes.has(item.to);
                return (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                  >
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-gradient-to-r hover:from-accent/50 hover:to-accent/30 hover:text-accent-foreground transition-all duration-300 hover:translate-x-1 hover:shadow-md",
                        isHighlighted && "ring-1 ring-primary/30 bg-primary/5"
                      )}
                      activeClassName="bg-gradient-to-r from-accent to-accent/70 text-accent-foreground font-medium shadow-lg border-l-2 border-primary"
                    >
                      <Icon className={cn("h-5 w-5 shrink-0", isHighlighted && "text-primary")} />
                      {!collapsed && (
                        <span className="text-sm flex items-center gap-2">
                          {item.label}
                          {isHighlighted && <span className="text-primary text-xs">★</span>}
                        </span>
                      )}
                    </NavLink>
                  </motion.div>
                );
              })}
              
              {/* Monitoring Section */}
              {!collapsed && <div className="h-px bg-border my-3" />}
              {!collapsed && <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">Monitoramento</p>}
              {adminItems.filter(item => item.section === 'monitoring').map((item, idx) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                  >
                    <NavLink
                      to={item.to}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-gradient-to-r hover:from-accent/50 hover:to-accent/30 hover:text-accent-foreground transition-all duration-300 hover:translate-x-1 hover:shadow-md"
                      activeClassName="bg-gradient-to-r from-accent to-accent/70 text-accent-foreground font-medium shadow-lg border-l-2 border-primary"
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.label}</span>}
                    </NavLink>
                  </motion.div>
                );
              })}
              
              {/* Security Section */}
              {!collapsed && <div className="h-px bg-border my-3" />}
              {!collapsed && <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">Segurança</p>}
              {adminItems.filter(item => item.section === 'security').map((item, idx) => {
                const Icon = item.icon;
                const isHighlighted = highlightedRoutes.has(item.to);
                return (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                  >
                    <NavLink
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-gradient-to-r hover:from-accent/50 hover:to-accent/30 hover:text-accent-foreground transition-all duration-300 hover:translate-x-1 hover:shadow-md",
                        isHighlighted && "ring-1 ring-primary/30 bg-primary/5"
                      )}
                      activeClassName="bg-gradient-to-r from-accent to-accent/70 text-accent-foreground font-medium shadow-lg border-l-2 border-primary"
                    >
                      <Icon className={cn("h-5 w-5 shrink-0", isHighlighted && "text-primary")} />
                      {!collapsed && (
                        <span className="text-sm flex items-center gap-2">
                          {item.label}
                          {isHighlighted && <span className="text-primary text-xs">★</span>}
                        </span>
                      )}
                    </NavLink>
                  </motion.div>
                );
              })}
              
              {/* Infrastructure Section */}
              {!collapsed && <div className="h-px bg-border my-3" />}
              {!collapsed && <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">Infraestrutura</p>}
              {adminItems.filter(item => item.section === 'infrastructure').map((item, idx) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                  >
                    <NavLink
                      to={item.to}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-gradient-to-r hover:from-accent/50 hover:to-accent/30 hover:text-accent-foreground transition-all duration-300 hover:translate-x-1 hover:shadow-md"
                      activeClassName="bg-gradient-to-r from-accent to-accent/70 text-accent-foreground font-medium shadow-lg border-l-2 border-primary"
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.label}</span>}
                    </NavLink>
                  </motion.div>
                );
              })}
              
              {/* AI Section */}
              {!collapsed && <div className="h-px bg-border my-3" />}
              {!collapsed && <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">IA</p>}
              {adminItems.filter(item => item.section === 'ai').map((item, idx) => {
                const Icon = item.icon;
                const isHighlighted = highlightedRoutes.has(item.to);
                return (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                  >
                    <NavLink
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-gradient-to-r hover:from-accent/50 hover:to-accent/30 hover:text-accent-foreground transition-all duration-300 hover:translate-x-1 hover:shadow-md",
                        isHighlighted && "ring-1 ring-primary/30 bg-primary/5"
                      )}
                      activeClassName="bg-gradient-to-r from-accent to-accent/70 text-accent-foreground font-medium shadow-lg border-l-2 border-primary"
                    >
                      <Icon className={cn("h-5 w-5 shrink-0", isHighlighted && "text-primary")} />
                      {!collapsed && (
                        <span className="text-sm flex items-center gap-2">
                          {item.label}
                          {isHighlighted && <span className="text-primary text-xs">★</span>}
                        </span>
                      )}
                    </NavLink>
                  </motion.div>
                );
              })}
              
              {/* Management Section */}
              {!collapsed && <div className="h-px bg-border my-3" />}
              {!collapsed && <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">Gestao</p>}
              {adminItems.filter(item => item.section === 'management').map((item, idx) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                  >
                    <NavLink
                      to={item.to}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-gradient-to-r hover:from-accent/50 hover:to-accent/30 hover:text-accent-foreground transition-all duration-300 hover:translate-x-1 hover:shadow-md"
                      activeClassName="bg-gradient-to-r from-accent to-accent/70 text-accent-foreground font-medium shadow-lg border-l-2 border-primary"
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.label}</span>}
                    </NavLink>
                  </motion.div>
                );
              })}
              
              {/* Billing Section */}
              {!collapsed && <div className="h-px bg-border my-3" />}
              {!collapsed && <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">Financeiro</p>}
              {adminItems.filter(item => item.section === 'billing').map((item, idx) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                  >
                    <NavLink
                      to={item.to}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-gradient-to-r hover:from-accent/50 hover:to-accent/30 hover:text-accent-foreground transition-all duration-300 hover:translate-x-1 hover:shadow-md"
                      activeClassName="bg-gradient-to-r from-accent to-accent/70 text-accent-foreground font-medium shadow-lg border-l-2 border-primary"
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.label}</span>}
                    </NavLink>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </nav>
    </aside>
  );
};