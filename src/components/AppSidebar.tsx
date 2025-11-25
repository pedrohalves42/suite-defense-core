import { Home, Shield, Package, Users, Key, Mail, ScrollText, Settings, ChevronLeft, ChevronRight, Zap, TestTube, Server, FileDown, Activity, CreditCard, Crown, BarChart3, AlertTriangle, Brain, CheckCircle, Terminal, Globe, Clock } from 'lucide-react';
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
    { icon: Server, label: 'Gerenciar Agentes', to: '/agents' },
    { icon: Zap, label: 'Criar Jobs', to: '/jobs' },
    { icon: Shield, label: 'Scans de Virus', to: '/virus-scans' },
    { icon: Shield, label: 'Quarentena', to: '/quarantine' },
    { icon: Package, label: 'Instalador', to: '/installer' },
    { icon: FileDown, label: 'Exportar Dados', to: '/export' },
    { icon: TestTube, label: 'Teste de Agentes', to: '/agent-test' },
  ], []);

  const adminItems = useMemo(() => [
    // === OVERVIEW ===
    { icon: Home, label: 'Dashboard', to: '/admin/dashboard', end: true, section: 'overview' },
    
    // === MONITORAMENTO ===
    { icon: Activity, label: 'Monitoramento RT', to: '/admin/monitoring-advanced', section: 'monitoring' },
    { icon: Activity, label: 'Saude Agentes', to: '/admin/agent-health', section: 'monitoring' },
    { icon: Activity, label: 'Diagnostico', to: '/admin/agent-diagnostics', section: 'monitoring' },
    { icon: Terminal, label: 'Troubleshooting', to: '/admin/agent-troubleshooting', section: 'monitoring' },
    { icon: AlertTriangle, label: 'Problematicos', to: '/admin/problematic-agents', section: 'monitoring' },
    
    // === SEGURANÇA ===
    { icon: Package, label: 'Inventario Software', to: '/admin/software-inventory', section: 'security' },
    { icon: AlertTriangle, label: 'Vulnerabilidades', to: '/admin/vulnerabilities', section: 'security' },
    { icon: Globe, label: 'Atividade Web', to: '/admin/web-activity', section: 'security' },
    { icon: Clock, label: 'Timeline Agente', to: '/admin/agent-timeline', section: 'security' },
    
    // === INFRAESTRUTURA ===
    { icon: Package, label: 'Instalacoes', to: '/admin/installations', section: 'infrastructure' },
    { icon: Package, label: 'Agent Releases', to: '/admin/agent-releases', section: 'infrastructure' },
    
    // === INTELIGÊNCIA ARTIFICIAL ===
    { icon: Brain, label: 'IA Insights', to: '/admin/ai-insights', section: 'ai' },
    { icon: CheckCircle, label: 'IA Acoes', to: '/admin/ai-actions', section: 'ai' },
    
    // === GESTÃO ===
    { icon: Users, label: 'Membros', to: '/admin/members', section: 'management' },
    { icon: Settings, label: 'Tenant', to: '/admin/tenant', section: 'management' },
    
    // === FINANCEIRO ===
    { icon: CreditCard, label: 'Planos', to: '/admin/plan-upgrade', section: 'billing' },
    { icon: Activity, label: 'Assinaturas', to: '/admin/subscriptions', section: 'billing' },
  ], []);

  const superAdminItems = useMemo(() => [
    { icon: Home, label: 'Meu Tenant (Admin)', to: '/admin/dashboard', end: false },
    { icon: Package, label: 'Gerenciar Tenants', to: '/super-admin/tenants', end: true },
    { icon: Package, label: 'Agent Releases', to: '/admin/agent-releases', end: false },
    { icon: BarChart3, label: 'Metricas Globais', to: '/super-admin/metrics' },
    { icon: BarChart3, label: 'Analytics Subs', to: '/super-admin/subscription-analytics' },
    { icon: CreditCard, label: 'Config Stripe', to: '/super-admin/stripe-setup' },
    { icon: Users, label: 'Todos Usuarios', to: '/super-admin/users' },
    { icon: Shield, label: 'Features', to: '/super-admin/features' },
    { icon: Key, label: 'Chaves API', to: '/super-admin/api-keys' },
    { icon: Key, label: 'Enrollment Keys', to: '/super-admin/enrollment-keys' },
    { icon: Mail, label: 'Convites', to: '/super-admin/invites' },
    { icon: AlertTriangle, label: 'Seguranca', to: '/super-admin/security' },
    { icon: ScrollText, label: 'Logs Auditoria', to: '/super-admin/audit-logs' },
    { icon: Activity, label: 'Logs Sistema', to: '/super-admin/system-logs' },
    { icon: Settings, label: 'Configuracoes', to: '/super-admin/settings' },
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
              {!collapsed && <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">Seguranca</p>}
              {adminItems.filter(item => item.section === 'security').map((item, idx) => {
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