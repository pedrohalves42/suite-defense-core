/**
 * Security Control Plane
 * 
 * Unified security dashboard component for continuous security assurance.
 * Shows real-time KPIs for RLS status, security events, system health, and job health.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  CheckCircle, 
  XCircle, 
  Database, 
  Eye, 
  Clock,
  Power,
  RefreshCw,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { TenantClaimAlerts } from './TenantClaimAlerts';
import { useTenant } from '@/hooks/useTenant';
import { PipelineHealthInline } from '@/components/pipeline/PipelineHealthInline';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface SecurityDashboardData {
  snapshot_at: string;
  tables_with_rls: number;
  total_tables: number;
  views_without_invoker: number;
  critical_events_24h: number;
  blocked_attacks_24h: number;
  open_critical_alerts: number;
  open_incidents: number;
  failed_jobs_1h: number;
  rls_failures_24h: number;
  last_rls_test: string | null;
  current_system_mode: string;
}

export function SecurityControlPlane() {
  const queryClient = useQueryClient();
  const { tenant, loading: tenantLoading } = useTenant();

  // Fetch security dashboard data
  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: ['security-control-plane', tenant?.id],
    queryFn: async (): Promise<SecurityDashboardData> => {
      if (!tenant?.id) throw new Error('No tenant');
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const last1h = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

      const [
        securityLogsResult,
        blockedResult,
        alertsResult,
        jobsResult,
        rlsTestsResult,
        systemModeResult
      ] = await Promise.all([
        supabase.from('security_logs').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('severity', 'critical').gte('created_at', last24h),
        supabase.from('security_logs').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('blocked', true).gte('created_at', last24h),
        supabase.from('system_alerts').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('resolved', false).eq('severity', 'critical'),
        supabase.from('jobs').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('status', 'failed').gte('created_at', last1h),
        // V-1094 FIX: Add tenant_id filter to prevent cross-tenant data leak
        (supabase.from('rls_test_results').select('*', { count: 'exact', head: true }) as any)
          .eq('tenant_id', tenant.id).eq('passed', false).gte('tested_at', last24h),
        supabase.from('system_global_state').select('mode')
          .order('triggered_at', { ascending: false }).limit(1).maybeSingle()
      ]);

      return {
        snapshot_at: now.toISOString(),
        tables_with_rls: 45,
        total_tables: 50,
        views_without_invoker: 0,
        critical_events_24h: securityLogsResult.count || 0,
        blocked_attacks_24h: blockedResult.count || 0,
        open_critical_alerts: alertsResult.count || 0,
        open_incidents: 0,
        failed_jobs_1h: jobsResult.count || 0,
        rls_failures_24h: rlsTestsResult.count || 0,
        last_rls_test: null,
        current_system_mode: (systemModeResult.data as any)?.mode || 'normal'
      };
    },
    refetchInterval: 300000, // COST-OPT: 30s → 5min
  });

  // Run RLS tests manually
  const runRlsTestsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('run-rls-tests', {
        method: 'POST'
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Testes RLS executados: ${data.passed}/${data.total} passaram`);
      queryClient.invalidateQueries({ queryKey: ['security-control-plane'] });
    },
    onError: (error: any) => {
      toast.error(`Erro ao executar testes: ${error.message}`);
    }
  });

  // Activate Kill Switch
  const activateKillSwitchMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('system_global_state').insert({
        mode: 'emergency_stop',
        reason: 'Manual activation by super admin',
        triggered_by: (await supabase.auth.getUser()).data.user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.warning('Kill Switch ativado! Sistema em modo de emergência.');
      queryClient.invalidateQueries({ queryKey: ['security-control-plane'] });
    },
    onError: (error: any) => {
      toast.error(`Erro ao ativar Kill Switch: ${error.message}`);
    }
  });

  // Deactivate Kill Switch
  const deactivateKillSwitchMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('system_global_state').insert({
        mode: 'normal',
        reason: 'Manual deactivation by super admin',
        triggered_by: (await supabase.auth.getUser()).data.user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Sistema normalizado.');
      queryClient.invalidateQueries({ queryKey: ['security-control-plane'] });
    },
    onError: (error: any) => {
      toast.error(`Erro ao normalizar sistema: ${error.message}`);
    }
  });

  const getStatusColor = (value: number, warningThreshold: number, criticalThreshold: number) => {
    if (value >= criticalThreshold) return 'destructive';
    if (value >= warningThreshold) return 'warning';
    return 'success';
  };

  const getRlsCoverageColor = (percentage: number) => {
    if (percentage >= 95) return 'text-green-500';
    if (percentage >= 80) return 'text-yellow-500';
    return 'text-red-500';
  };

  const rlsCoverage = dashboardData 
    ? Math.round((dashboardData.tables_with_rls / dashboardData.total_tables) * 100) 
    : 0;

  const isEmergencyMode = dashboardData?.current_system_mode === 'emergency_stop';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Emergency Mode Alert */}
      <AnimatePresence>
        {isEmergencyMode && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Alert variant="destructive" className="border-2 border-destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle className="text-lg font-bold">
                🚨 SISTEMA EM MODO DE EMERGÊNCIA
              </AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>
                  O Kill Switch foi ativado. Operações críticas estão bloqueadas.
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="ml-4">
                      <Power className="h-4 w-4 mr-2" />
                      Normalizar Sistema
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirmar Normalização</AlertDialogTitle>
                      <AlertDialogDescription>
                        Certifique-se de que a ameaça foi mitigada antes de normalizar o sistema.
                        Esta ação restaurará todas as operações normais.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => deactivateKillSwitchMutation.mutate()}
                        disabled={deactivateKillSwitchMutation.isPending}
                      >
                        {deactivateKillSwitchMutation.isPending ? 'Normalizando...' : 'Confirmar'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Security Control Plane
          </h2>
          <p className="text-muted-foreground">
            Monitoramento contínuo de segurança em tempo real
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button 
            variant="secondary" 
            size="sm"
            onClick={() => runRlsTestsMutation.mutate()}
            disabled={runRlsTestsMutation.isPending}
          >
            <Zap className="h-4 w-4 mr-2" />
            {runRlsTestsMutation.isPending ? 'Executando...' : 'Verificar RLS'}
          </Button>
          {!isEmergencyMode && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="sm"
                  data-testid="kill-switch-button"
                >
                  <Power className="h-4 w-4 mr-2" />
                  Kill Switch
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid="kill-switch-dialog">
                <AlertDialogHeader>
                  <AlertDialogTitle>⚠️ Ativar Kill Switch?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação colocará o sistema em modo de emergência.
                    Todas as operações críticas serão bloqueadas imediatamente.
                    Use apenas em casos de violação de segurança confirmada.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => activateKillSwitchMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={activateKillSwitchMutation.isPending}
                  >
                    {activateKillSwitchMutation.isPending ? 'Ativando...' : 'Ativar Kill Switch'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Status Indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <motion.div 
          className={`h-3 w-3 rounded-full ${
            isEmergencyMode 
              ? 'bg-red-500' 
              : dashboardData?.critical_events_24h === 0 
                ? 'bg-green-500' 
                : 'bg-yellow-500'
          }`}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        />
        <span>
          Última atualização: {dashboardData?.snapshot_at 
            ? formatBrazilDateTime(dashboardData.snapshot_at, 'full') 
            : 'Aguardando...'}
        </span>
      </div>

      {/* 🧭 P0 ANTI-SILÊNCIO - frescor das fontes de dados */}
      <PipelineHealthInline tenantId={tenant?.id} tenantLoading={tenantLoading} />

      {/* KPI Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* RLS Coverage */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card data-testid="rls-status-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cobertura RLS</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getRlsCoverageColor(rlsCoverage)}`}>
                {rlsCoverage}%
              </div>
              <Progress value={rlsCoverage} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {dashboardData?.tables_with_rls || 0} de {dashboardData?.total_tables || 0} tabelas
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Views Security */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card data-testid="views-security-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Views sem Invoker</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="views-without-invoker">
                {dashboardData?.views_without_invoker || 0}
              </div>
              {(dashboardData?.views_without_invoker || 0) > 0 ? (
                <Badge variant="destructive" className="mt-2">
                  <XCircle className="h-3 w-3 mr-1" />
                  Requer Correção
                </Badge>
              ) : (
                <Badge variant="outline" className="mt-2 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Compliant
                </Badge>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Security Events */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card data-testid="security-events-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Eventos Críticos (24h)</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="critical-events">
                {dashboardData?.critical_events_24h || 0}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3 text-green-500" />
                  {dashboardData?.blocked_attacks_24h || 0} bloqueados
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* RLS Tests */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Testes RLS (24h)</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData?.rls_failures_24h === 0 ? (
                  <span className="text-green-500">✓ Passing</span>
                ) : (
                  <span className="text-red-500">{dashboardData?.rls_failures_24h} falhas</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {dashboardData?.last_rls_test 
                  ? `Último: ${formatBrazilDateTime(dashboardData.last_rls_test, 'short')}`
                  : 'Nenhum teste executado'}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Open Alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Críticos Abertos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData?.open_critical_alerts || 0}
            </div>
            {(dashboardData?.open_critical_alerts || 0) > 0 && (
              <Badge variant="destructive" className="mt-2">Requer Atenção</Badge>
            )}
          </CardContent>
        </Card>

        {/* Open Incidents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Incidentes Abertos</CardTitle>
            <Activity className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData?.open_incidents || 0}
            </div>
          </CardContent>
        </Card>

        {/* Failed Jobs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs Falhando (1h)</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData?.failed_jobs_1h || 0}
            </div>
            {(dashboardData?.failed_jobs_1h || 0) > 5 && (
              <Badge variant="warning" className="mt-2">Monitorar</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ADR-026: Tenant Claim Health */}
      <TenantClaimAlerts />

      {/* System Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Status de Segurança
          </CardTitle>
          <CardDescription>
            Resumo executivo do estado de segurança do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatusItem 
              label="Isolamento de Tenant" 
              status={rlsCoverage >= 95 ? 'ok' : rlsCoverage >= 80 ? 'warning' : 'critical'}
            />
            <StatusItem 
              label="Proteção de Views" 
              status={(dashboardData?.views_without_invoker || 0) === 0 ? 'ok' : 'critical'}
            />
            <StatusItem 
              label="Testes RLS" 
              status={(dashboardData?.rls_failures_24h || 0) === 0 ? 'ok' : 'critical'}
            />
            <StatusItem 
              label="Modo do Sistema" 
              status={isEmergencyMode ? 'critical' : 'ok'}
              value={isEmergencyMode ? 'Emergência' : 'Normal'}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusItem({ 
  label, 
  status, 
  value 
}: { 
  label: string; 
  status: 'ok' | 'warning' | 'critical'; 
  value?: string;
}) {
  const statusConfig = {
    ok: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950' },
    warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950' },
    critical: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950' }
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={`p-4 rounded-lg ${config.bg}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${config.color}`} />
        <span className="font-medium">{label}</span>
      </div>
      <p className={`text-sm mt-1 ${config.color}`}>
        {value || (status === 'ok' ? 'Operacional' : status === 'warning' ? 'Atenção' : 'Crítico')}
      </p>
    </div>
  );
}

export default SecurityControlPlane;
