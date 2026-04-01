import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Monitor, ShieldCheck, AlertTriangle, Activity,
  CheckCircle2, XCircle, ArrowRight, Lightbulb
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HealthGauge } from './components/HealthGauge';
import { useClientDashboard, type ClientDashboardStats } from './useClientDashboard';

function getNextSteps(stats: ClientDashboardStats | null | undefined) {
  const steps: { icon: React.ReactNode; text: string; link: string; priority: 'high' | 'medium' | 'low' }[] = [];

  if ((stats?.criticalAlerts || 0) > 0) {
    steps.push({ icon: <AlertTriangle className="h-4 w-4 text-red-500" />, text: `Revise ${stats?.criticalAlerts} alerta(s) crítico(s)`, link: '/client/dashboard', priority: 'high' });
  }
  if ((stats?.offlineAgents || 0) > 0) {
    steps.push({ icon: <XCircle className="h-4 w-4 text-yellow-500" />, text: `Verifique ${stats?.offlineAgents} computador(es) offline`, link: '/client/computers', priority: 'medium' });
  }
  if ((stats?.vulnerabilities || 0) > 0) {
    steps.push({ icon: <ShieldCheck className="h-4 w-4 text-orange-500" />, text: `Confira ${stats?.vulnerabilities} vulnerabilidade(s) detectada(s)`, link: '/client/security', priority: 'medium' });
  }
  if (stats?.hasAvIssues) {
    steps.push({ icon: <ShieldCheck className="h-4 w-4 text-red-500" />, text: 'Verifique o status do antivírus', link: '/client/security', priority: 'high' });
  }
  if (steps.length === 0) {
    steps.push({ icon: <CheckCircle2 className="h-4 w-4 text-green-500" />, text: 'Tudo em dia! Continue monitorando.', link: '/client/computers', priority: 'low' });
  }

  return steps.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });
}

export const ClientDashboard = () => {
  const { stats, isLoading } = useClientDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  const nextSteps = getNextSteps(stats);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bem-vindo ao CyberShield</h1>
        <p className="text-muted-foreground">Veja o status de segurança dos seus computadores</p>
      </div>

      {/* Contextual banners */}
      {(stats?.healthScore || 0) >= 80 && (stats?.unresolvedAlerts || 0) === 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-green-500/5 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-500/10"><CheckCircle2 className="h-6 w-6 text-green-500" /></div>
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">🎉 Parabéns! Seus computadores estão protegidos!</p>
                  <p className="text-sm text-muted-foreground">Continue monitorando para manter a segurança em dia.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {(stats?.criticalAlerts || 0) > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-red-500/10 border-red-500/30 animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-500/10"><AlertTriangle className="h-6 w-6 text-red-500" /></div>
                <div>
                  <p className="font-medium text-red-700 dark:text-red-400">⚠️ Atenção! Existem {stats?.criticalAlerts} alerta(s) crítico(s)</p>
                  <p className="text-sm text-muted-foreground">Revise os alertas abaixo e tome as ações necessárias.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Health Score + Next Steps */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />Saúde da Segurança
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center py-4">
            <HealthGauge score={stats?.healthScore || 0} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />Próximos Passos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {nextSteps.slice(0, 4).map((step, index) => (
                <motion.div key={index} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }}>
                  <Link to={step.link}>
                    <div className={`flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-muted/80 ${
                      step.priority === 'high' ? 'bg-red-500/5 border border-red-500/20' :
                      step.priority === 'medium' ? 'bg-yellow-500/5 border border-yellow-500/20' : 'bg-muted/50'
                    }`}>
                      <div className="flex items-center gap-3">{step.icon}<span className="text-sm font-medium">{step.text}</span></div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Computadores</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalAgents || 0}</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />{stats?.onlineAgents || 0} online
              </Badge>
              {(stats?.offlineAgents || 0) > 0 && (
                <Badge variant="secondary" className="bg-muted">
                  <XCircle className="h-3 w-3 mr-1" />{stats?.offlineAgents} offline
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alertas Ativos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.unresolvedAlerts || 0}</div>
            {(stats?.criticalAlerts || 0) > 0 ? (
              <p className="text-xs text-destructive">{stats?.criticalAlerts} crítico(s) requer atenção</p>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum alerta crítico</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pontos Fracos</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.vulnerabilities || 0}</div>
            <p className="text-xs text-muted-foreground">Encontradas nos seus computadores</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status Geral</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {(stats?.criticalAlerts || 0) > 0 ? (
              <><div className="text-2xl font-bold text-destructive">Atenção</div><p className="text-xs text-muted-foreground">Existem alertas que precisam de ação</p></>
            ) : (stats?.unresolvedAlerts || 0) > 0 ? (
              <><div className="text-2xl font-bold text-yellow-600">Moderado</div><p className="text-xs text-muted-foreground">Alguns alertas para revisar</p></>
            ) : (
              <><div className="text-2xl font-bold text-green-600">Protegido</div><p className="text-xs text-muted-foreground">Tudo funcionando normalmente</p></>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Reports */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Relatórios Recentes</CardTitle></CardHeader>
        <CardContent>
          {stats?.recentReports && stats.recentReports.length > 0 ? (
            <div className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {stats.recentReports.map((report: any) => (
                <div key={report.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{report.title}</p>
                    <p className="text-sm text-muted-foreground">{formatBrazilDateTime(report.created_at)}</p>
                  </div>
                  {report.risk_score !== null && (
                    <Badge variant={report.risk_score >= 60 ? 'destructive' : report.risk_score >= 30 ? 'secondary' : 'default'}>
                      Risco: {report.risk_score}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">Nenhum relatório gerado ainda</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
