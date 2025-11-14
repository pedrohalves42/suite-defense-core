import { Home, Shield, Package, Users, Key, Mail, ScrollText, Settings, ChevronLeft, ChevronRight, Zap, TestTube, Server, FileDown, Activity, CreditCard, Crown, BarChart3, AlertTriangle } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';

export const AppSidebar = () => {
  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useSuperAdmin();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  // CORREÇÃO: Logger removido em produção

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', collapsed.toString());
    // Dispatch custom event for cross-component sync
    window.dispatchEvent(new Event('sidebar-toggle'));
  }, [collapsed]);

  // CORREÇÃO: Memoizar arrays para evitar re-renders desnecessários
  const menuItems = useMemo(() => [
    { icon: Home, label: 'Dashboard', to: '/dashboard', end: true },
    { icon: Server, label: 'Monitoramento', to: '/monitoring' },
    { icon: Server, label: 'Gerenciar Agentes', to: '/agents' },
    { icon: Zap, label: 'Criar Jobs', to: '/jobs' },
    { icon: Shield, label: 'Scans de Vírus', to: '/virus-scans' },
    { icon: Shield, label: 'Quarentena', to: '/quarantine' },
    { icon: Package, label: 'Instalador', to: '/installer' },
    { icon: FileDown, label: 'Exportar Dados', to: '/export' },
    { icon: TestTube, label: 'Teste de Agentes', to: '/agent-test' },
  ], []);

  const adminItems = useMemo(() => [
    { icon: Home, label: 'Dashboard', to: '/admin/dashboard', end: true },
    { icon: Activity, label: 'Monitoramento RT', to: '/admin/monitoring-advanced' },
    { icon: Activity, label: 'Saúde Agentes', to: '/admin/agent-health' },
    { icon: Package, label: 'Instalador Agentes', to: '/admin/agent-installer' },
    { icon: BarChart3, label: 'Pipeline Instalação', to: '/admin/installation-pipeline' },
    { icon: BarChart3, label: 'Analytics Instalação', to: '/admin/installation-analytics' },
    { icon: BarChart3, label: 'Métricas Instalação', to: '/admin/installation-metrics' },
    { icon: ScrollText, label: 'Logs Instalação', to: '/admin/installation-logs' },
    { icon: Users, label: 'Membros', to: '/admin/members' },
    { icon: Mail, label: 'Convites Tenant', to: '/admin/tenant/invites' },
    { icon: AlertTriangle, label: 'Segurança Tenant', to: '/admin/tenant/security' },
    { icon: ScrollText, label: 'Logs Tenant', to: '/admin/tenant/logs' },
    { icon: Settings, label: 'Config Tenant', to: '/admin/tenant/settings' },
    { icon: CreditCard, label: 'Planos', to: '/admin/plan-upgrade' },
    { icon: Activity, label: 'Assinaturas', to: '/admin/subscriptions' },
  ], []);

  const superAdminItems = useMemo(() => [
    { icon: Package, label: 'Gerenciar Tenants', to: '/super-admin/tenants', end: true },
    { icon: BarChart3, label: 'Métricas Globais', to: '/super-admin/metrics' },
    { icon: Activity, label: 'Diagnóstico Agentes', to: '/super-admin/diagnostics' },
    { icon: BarChart3, label: 'Analytics Subs', to: '/super-admin/subscription-analytics' },
    { icon: CreditCard, label: 'Config Stripe', to: '/super-admin/stripe-setup' },
    { icon: Users, label: 'Todos Usuários', to: '/super-admin/users' },
    { icon: Shield, label: 'Features', to: '/super-admin/features' },
    { icon: Key, label: 'Chaves API', to: '/super-admin/api-keys' },
    { icon: Key, label: 'Enrollment Keys', to: '/super-admin/enrollment-keys' },
    { icon: Mail, label: 'Convites', to: '/super-admin/invites' },
    { icon: AlertTriangle, label: 'Segurança', to: '/super-admin/security' },
    { icon: ScrollText, label: 'Logs Auditoria', to: '/super-admin/audit-logs' },
    { icon: Activity, label: 'Logs Sistema', to: '/super-admin/system-logs' },
    { icon: Settings, label: 'Configurações', to: '/super-admin/settings' },
  ], []);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-card border-r border-border transition-all duration-300 z-40 flex flex-col',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo Section */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-cyber rounded-lg border border-primary/20">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="font-bold text-lg bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              CyberShield
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0"
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
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                activeClassName="bg-accent text-accent-foreground font-medium"
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="text-sm">{item.label}</span>}
              </NavLink>
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
                <p className="px-3 py-2 text-xs font-semibold text-destructive uppercase flex items-center gap-2">
                  <Crown className="h-3 w-3" />
                  Super Admin
                </p>
              )}
              {superAdminItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    activeClassName="bg-destructive/10 text-destructive font-medium"
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span className="text-sm">{item.label}</span>}
                  </NavLink>
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
              {!collapsed && (
                <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                  Administração
                </p>
              )}
              {adminItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    activeClassName="bg-accent text-accent-foreground font-medium"
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span className="text-sm">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          </>
        )}
      </nav>
    </aside>
  );
};
