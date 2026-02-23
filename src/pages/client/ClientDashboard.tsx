import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { 
  Monitor, 
  ShieldCheck, 
  AlertTriangle, 
  Activity,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Lightbulb,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

// Health Score Gauge Component
const HealthGauge = ({ score }: { score: number }) => {
  const getColor = () => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getLabel = () => {
    if (score >= 80) return 'Excelente';
    if (score >= 50) return 'Atenção';
    return 'Crítico';
  };

  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/30"
          />
          <motion.circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className={getColor()}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${getColor()}`}>{score}</span>
          <span className="text-xs text-muted-foreground">pontos</span>
        </div>
      </div>
      <span className={`mt-2 text-sm font-medium ${getColor()}`}>{getLabel()}</span>
    </div>
  );
};

export const ClientDashboard = () => {
  const { tenant } = useTenant();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['client-dashboard-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      // Fetch agents - ADR-026: Use agents_safe view to protect hmac_secret
      const { data: agents } = await supabase
        .from('agents_safe')
        .select('id, status, last_heartbeat, agent_name')
        .eq('tenant_id', tenant.id);

      // Fetch recent alerts
      const { data: alerts } = await supabase
        .from('system_alerts')
        .select('id, alert_type, severity, resolved')
        .eq('tenant_id', tenant.id)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(10);

      // Fetch recent reports
      const { data: reports } = await supabase
        .from('generated_reports')
        .select('id, title, created_at, risk_score')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(5);

      // Fetch vulnerability count
      const { count: vulnCount } = await supabase
        .from('vuln_findings')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);

      // Fetch antivirus status
      const { data: avStatus } = await supabase
        .from('antivirus_status')
        .select('status, threats_found')
        .eq('tenant_id', tenant.id);

      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      const onlineAgents = agents?.filter(a => 
        a.last_heartbeat && new Date(a.last_heartbeat) > fiveMinutesAgo
      ).length || 0;

      const offlineAgents = (agents?.length || 0) - onlineAgents;

      // Calculate health score (0-100)
      let healthScore = 100;
      
      // Deduct points for critical alerts
      const criticalAlerts = alerts?.filter(a => a.severity === 'critical').length || 0;
      healthScore -= criticalAlerts * 15;
      
      // Deduct for other alerts
      healthScore -= ((alerts?.length || 0) - criticalAlerts) * 5;
      
      // Deduct for vulnerabilities
      healthScore -= Math.min((vulnCount || 0) * 2, 20);
      
      // Deduct for offline agents
      const totalAgents = agents?.length || 0;
      if (totalAgents > 0) {
        healthScore -= Math.round((offlineAgents / totalAgents) * 20);
      }
      
      // Deduct for AV issues
      const avDisabled = avStatus?.filter(a => a.status !== 'enabled').length || 0;
      const avThreats = avStatus?.reduce((sum, a) => sum + (a.threats_found || 0), 0) || 0;
      healthScore -= avDisabled * 10;
      healthScore -= avThreats * 5;
      
      // Clamp to 0-100
      healthScore = Math.max(0, Math.min(100, healthScore));

      return {
        totalAgents: agents?.length || 0,
        onlineAgents,
        offlineAgents,
        unresolvedAlerts: alerts?.length || 0,
        criticalAlerts,
        recentReports: reports || [],
        vulnerabilities: vulnCount || 0,
        healthScore,
        hasAvIssues: avDisabled > 0 || avThreats > 0
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 120000, // COST-OPT: 30s → 2min
  });

  // Generate next steps based on current status
  const getNextSteps = () => {
    const steps: { icon: React.ReactNode; text: string; link: string; priority: 'high' | 'medium' | 'low' }[] = [];

    if ((stats?.criticalAlerts || 0) > 0) {
      steps.push({
        icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
        text: `Revise ${stats?.criticalAlerts} alerta(s) crítico(s)`,
        link: '/client/dashboard',
        priority: 'high'
      });
    }

    if ((stats?.offlineAgents || 0) > 0) {
      steps.push({
        icon: <XCircle className="h-4 w-4 text-yellow-500" />,
        text: `Verifique ${stats?.offlineAgents} computador(es) offline`,
        link: '/client/computers',
        priority: 'medium'
      });
    }

    if ((stats?.vulnerabilities || 0) > 0) {
      steps.push({
        icon: <ShieldCheck className="h-4 w-4 text-orange-500" />,
        text: `Confira ${stats?.vulnerabilities} vulnerabilidade(s) detectada(s)`,
        link: '/client/security',
        priority: 'medium'
      });
    }

    if (stats?.hasAvIssues) {
      steps.push({
        icon: <ShieldCheck className="h-4 w-4 text-red-500" />,
        text: 'Verifique o status do antivírus',
        link: '/client/security',
        priority: 'high'
      });
    }

    if (steps.length === 0) {
      steps.push({
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
        text: 'Tudo em dia! Continue monitorando.',
        link: '/client/computers',
        priority: 'low'
      });
    }

    return steps.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const nextSteps = getNextSteps();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bem-vindo ao CyberShield</h1>
        <p className="text-muted-foreground">
          Veja o status de segurança dos seus computadores
        </p>
      </div>

      {/* Contextual Welcome Message */}
      {(stats?.healthScore || 0) >= 80 && (stats?.unresolvedAlerts || 0) === 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-green-500/5 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-500/10">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">
                    🎉 Parabéns! Seus computadores estão protegidos!
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Continue monitorando para manter a segurança em dia.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {(stats?.criticalAlerts || 0) > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-red-500/10 border-red-500/30 animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-500/10">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <p className="font-medium text-red-700 dark:text-red-400">
                    ⚠️ Atenção! Existem {stats?.criticalAlerts} alerta(s) crítico(s)
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Revise os alertas abaixo e tome as ações necessárias.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Health Score + Next Steps Row */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Health Score Card */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Saúde da Segurança
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center py-4">
            <HealthGauge score={stats?.healthScore || 0} />
          </CardContent>
        </Card>

        {/* Next Steps Card */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Próximos Passos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {nextSteps.slice(0, 4).map((step, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Link to={step.link}>
                    <div className={`flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-muted/80 ${
                      step.priority === 'high' ? 'bg-red-500/5 border border-red-500/20' :
                      step.priority === 'medium' ? 'bg-yellow-500/5 border border-yellow-500/20' :
                      'bg-muted/50'
                    }`}>
                      <div className="flex items-center gap-3">
                        {step.icon}
                        <span className="text-sm font-medium">{step.text}</span>
                      </div>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Computadores
            </CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalAgents || 0}</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {stats?.onlineAgents || 0} online
              </Badge>
              {(stats?.offlineAgents || 0) > 0 && (
                <Badge variant="secondary" className="bg-muted">
                  <XCircle className="h-3 w-3 mr-1" />
                  {stats.offlineAgents} offline
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Alertas Ativos
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.unresolvedAlerts || 0}</div>
            {(stats?.criticalAlerts || 0) > 0 ? (
              <p className="text-xs text-destructive">
                {stats.criticalAlerts} crítico(s) requer atenção
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum alerta crítico
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vulnerabilidades
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.vulnerabilities || 0}</div>
            <p className="text-xs text-muted-foreground">
              Encontradas nos seus computadores
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status Geral
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {(stats?.criticalAlerts || 0) > 0 ? (
              <>
                <div className="text-2xl font-bold text-destructive">Atenção</div>
                <p className="text-xs text-muted-foreground">
                  Existem alertas que precisam de ação
                </p>
              </>
            ) : (stats?.unresolvedAlerts || 0) > 0 ? (
              <>
                <div className="text-2xl font-bold text-yellow-600">Moderado</div>
                <p className="text-xs text-muted-foreground">
                  Alguns alertas para revisar
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">Protegido</div>
                <p className="text-xs text-muted-foreground">
                  Tudo funcionando normalmente
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Relatórios Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recentReports && stats.recentReports.length > 0 ? (
            <div className="space-y-3">
              {stats.recentReports.map((report: any) => (
                <div 
                  key={report.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{report.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatBrazilDateTime(report.created_at)}
                    </p>
                  </div>
                  {report.risk_score !== null && (
                    <Badge 
                      variant={report.risk_score >= 60 ? 'destructive' : report.risk_score >= 30 ? 'secondary' : 'default'}
                    >
                      Risco: {report.risk_score}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              Nenhum relatório gerado ainda
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
