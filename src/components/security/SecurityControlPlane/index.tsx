import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Shield, AlertTriangle, Activity, CheckCircle, XCircle, Database, Eye, Clock, Power, RefreshCw, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { TenantClaimAlerts } from '../TenantClaimAlerts';
import { PipelineHealthInline } from '@/components/pipeline/PipelineHealthInline';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import { useSecurityControlPlane } from './useSecurityControlPlane';
import { StatusItem } from './StatusItem';

export function SecurityControlPlane() {
  const {
    dashboardData, isLoading, refetch, tenant, tenantLoading,
    rlsCoverage, isEmergencyMode,
    runRlsTestsMutation, activateKillSwitchMutation, deactivateKillSwitchMutation,
  } = useSecurityControlPlane();

  const getRlsCoverageColor = (pct: number) => {
    if (pct >= 95) return 'text-green-500';
    if (pct >= 80) return 'text-yellow-500';
    return 'text-red-500';
  };

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
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <Alert variant="destructive" className="border-2 border-destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle className="text-lg font-bold">🚨 SISTEMA EM MODO DE EMERGÊNCIA</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>O Kill Switch foi ativado. Operações críticas estão bloqueadas.</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="ml-4"><Power className="h-4 w-4 mr-2" />Normalizar Sistema</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirmar Normalização</AlertDialogTitle>
                      <AlertDialogDescription>Certifique-se de que a ameaça foi mitigada antes de normalizar o sistema.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deactivateKillSwitchMutation.mutate()} disabled={deactivateKillSwitchMutation.isPending}>
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Shield className="h-6 w-6" />Security Control Plane</h2>
          <p className="text-muted-foreground">Monitoramento contínuo de segurança em tempo real</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
          <Button variant="secondary" size="sm" onClick={() => runRlsTestsMutation.mutate()} disabled={runRlsTestsMutation.isPending}>
            <Zap className="h-4 w-4 mr-2" />{runRlsTestsMutation.isPending ? 'Executando...' : 'Verificar RLS'}
          </Button>
          {!isEmergencyMode && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" data-testid="kill-switch-button"><Power className="h-4 w-4 mr-2" />Kill Switch</Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid="kill-switch-dialog">
                <AlertDialogHeader>
                  <AlertDialogTitle>⚠️ Ativar Kill Switch?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação colocará o sistema em modo de emergência. Todas as operações críticas serão bloqueadas imediatamente.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => activateKillSwitchMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={activateKillSwitchMutation.isPending}>
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
          className={`h-3 w-3 rounded-full ${isEmergencyMode ? 'bg-red-500' : dashboardData?.critical_events_24h === 0 ? 'bg-green-500' : 'bg-yellow-500'}`}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        />
        <span>Última atualização: {dashboardData?.snapshot_at ? formatBrazilDateTime(dashboardData.snapshot_at, 'full') : 'Aguardando...'}</span>
      </div>

      <PipelineHealthInline tenantId={tenant?.id} tenantLoading={tenantLoading} />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card data-testid="rls-status-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cobertura RLS</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getRlsCoverageColor(rlsCoverage)}`}>{rlsCoverage}%</div>
              <Progress value={rlsCoverage} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-2">{dashboardData?.tables_with_rls || 0} de {dashboardData?.total_tables || 0} tabelas</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card data-testid="views-security-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Views sem Invoker</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="views-without-invoker">{dashboardData?.views_without_invoker || 0}</div>
              {(dashboardData?.views_without_invoker || 0) > 0 ? (
                <Badge variant="destructive" className="mt-2"><XCircle className="h-3 w-3 mr-1" />Requer Correção</Badge>
              ) : (
                <Badge variant="outline" className="mt-2 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />Compliant</Badge>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card data-testid="security-events-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Eventos Críticos (24h)</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="critical-events">{dashboardData?.critical_events_24h || 0}</div>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-green-500" />{dashboardData?.blocked_attacks_24h || 0} bloqueados</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Testes RLS (24h)</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData?.rls_failures_24h === 0 ? <span className="text-green-500">✓ Passing</span> : <span className="text-red-500">{dashboardData?.rls_failures_24h} falhas</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {dashboardData?.last_rls_test ? `Último: ${formatBrazilDateTime(dashboardData.last_rls_test, 'short')}` : 'Nenhum teste executado'}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Críticos Abertos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData?.open_critical_alerts || 0}</div>
            {(dashboardData?.open_critical_alerts || 0) > 0 && <Badge variant="destructive" className="mt-2">Requer Atenção</Badge>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Incidentes Abertos</CardTitle>
            <Activity className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData?.open_incidents || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs Falhando (1h)</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData?.failed_jobs_1h || 0}</div>
            {(dashboardData?.failed_jobs_1h || 0) > 5 && <Badge variant="warning" className="mt-2">Monitorar</Badge>}
          </CardContent>
        </Card>
      </div>

      <TenantClaimAlerts />

      {/* System Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Status de Segurança</CardTitle>
          <CardDescription>Resumo executivo do estado de segurança do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatusItem label="Isolamento de Tenant" status={rlsCoverage >= 95 ? 'ok' : rlsCoverage >= 80 ? 'warning' : 'critical'} />
            <StatusItem label="Proteção de Views" status={(dashboardData?.views_without_invoker || 0) === 0 ? 'ok' : 'critical'} />
            <StatusItem label="Testes RLS" status={(dashboardData?.rls_failures_24h || 0) === 0 ? 'ok' : 'critical'} />
            <StatusItem label="Modo do Sistema" status={isEmergencyMode ? 'critical' : 'ok'} value={isEmergencyMode ? 'Emergência' : 'Normal'} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SecurityControlPlane;
