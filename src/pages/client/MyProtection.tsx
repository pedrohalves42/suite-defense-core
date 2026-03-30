import { useQuery } from '@tanstack/react-query';
import { isAgentOnline } from '@/lib/agent-status-constants';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert,
  Monitor,
  AlertTriangle,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Download
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, ptBR } from '@/lib/date-utils';


export const MyProtection = () => {
  
  const { tenant } = useTenant();

  // Fetch all data for unified view
  const { data, isLoading } = useQuery({
    queryKey: ['my-protection', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const [agentsRes, alertsRes, reportsRes, avRes] = await Promise.all([
        supabase.rpc('get_agents_list', {
          p_tenant_id: tenant.id,
          p_include_archived: false,
        }),
        supabase
          .from('system_alerts')
          .select('id, severity, resolved')
          .eq('tenant_id', tenant.id)
          .eq('resolved', false),
        supabase
          .from('generated_reports')
          .select('id, title, risk_score, created_at, file_url')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('antivirus_status')
          .select('id, status')
          .eq('tenant_id', tenant.id)
          .neq('status', 'active')
      ]);

      const agents = (agentsRes.data as unknown as Array<{ id: string; agent_name: string; last_heartbeat: string | null; status: string }>) || [];
      const onlineAgents = agents.filter(a => isAgentOnline(a.last_heartbeat));
      const offlineAgents = agents.filter(a => !isAgentOnline(a.last_heartbeat));

      const activeAlerts = alertsRes.data || [];
      const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical').length;
      
      const avIssues = avRes.data?.length || 0;

      const latestReport = reportsRes.data?.[0] || null;
      
      // Calculate next check time (daily at 16:00 Brasília)
      const now = new Date();
      const nextCheckDate = new Date();
      nextCheckDate.setHours(19, 0, 0, 0); // 19:00 UTC = 16:00 Brasília
      if (now > nextCheckDate) {
        nextCheckDate.setDate(nextCheckDate.getDate() + 1);
      }
      const isToday = nextCheckDate.toDateString() === now.toDateString();
      const nextCheck = isToday 
        ? 'Hoje às 16:00' 
        : format(nextCheckDate, "d 'de' MMM 'às' 16:00", { locale: ptBR });

      // Calculate overall protection score (0-100)
      let score = 100;
      score -= criticalAlerts * 15;
      score -= (activeAlerts.length - criticalAlerts) * 5;
      score -= offlineAgents.length * 3;
      score -= avIssues * 10;
      score = Math.max(0, Math.min(100, score));

      // Determine protection status
      let protectionStatus: 'protected' | 'attention' | 'critical';
      if (score >= 80) protectionStatus = 'protected';
      else if (score >= 50) protectionStatus = 'attention';
      else protectionStatus = 'critical';

      // Build issues list with friendly messages
      const issues: Array<{ text: string; severity: 'critical' | 'warning' | 'info'; action?: string }> = [];
      if (criticalAlerts > 0) {
        issues.push({ 
          text: `${criticalAlerts} problema(s) grave(s) encontrado(s)`, 
          severity: 'critical',
          action: 'Verifique a aba de segurança'
        });
      }
      if (avIssues > 0) {
        issues.push({ 
          text: `${avIssues} computador(es) com antivírus desativado`, 
          severity: 'warning',
          action: 'Ative o Windows Defender'
        });
      }
      if (offlineAgents.length > 0) {
        issues.push({ 
          text: `${offlineAgents.length} computador(es) não está conectando`, 
          severity: 'info',
          action: 'Verifique se está ligado'
        });
      }

      return {
        score,
        protectionStatus,
        totalComputers: agents.length,
        onlineComputers: onlineAgents.length,
        offlineComputers: offlineAgents.length,
        activeAlerts: activeAlerts.length,
        criticalAlerts,
        issues,
        latestReport,
        nextCheck
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 300_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const getStatusConfig = () => {
    if (!data) return { icon: Shield, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Carregando...', description: '' };
    
    switch (data.protectionStatus) {
      case 'protected':
        return { 
          icon: ShieldCheck, 
          color: 'text-green-500', 
          bg: 'bg-green-500/10', 
          label: 'Você está protegido',
          description: 'Todos os sistemas funcionando normalmente'
        };
      case 'attention':
        return { 
          icon: ShieldAlert, 
          color: 'text-yellow-500', 
          bg: 'bg-yellow-500/10', 
          label: 'Atenção necessária',
          description: 'Alguns itens precisam da sua atenção'
        };
      case 'critical':
        return { 
          icon: ShieldAlert, 
          color: 'text-red-500', 
          bg: 'bg-red-500/10', 
          label: 'Proteção comprometida',
          description: 'Ação urgente necessária'
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Minha Proteção</h1>
        <p className="text-muted-foreground">Visão geral da segurança dos seus computadores</p>
      </div>

      {/* Main Protection Status */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Card className={`${statusConfig.bg} border-2 ${data?.protectionStatus === 'protected' ? 'border-green-500/30' : data?.protectionStatus === 'attention' ? 'border-yellow-500/30' : 'border-red-500/30'}`}>
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center">
              <div className={`p-4 rounded-full ${statusConfig.bg} mb-4`}>
                <StatusIcon className={`h-16 w-16 ${statusConfig.color}`} />
              </div>
              <h2 className={`text-2xl font-bold mb-2 ${statusConfig.color}`}>
                {statusConfig.label}
              </h2>
              <p className="text-muted-foreground mb-4">{statusConfig.description}</p>
              
              {/* Score Circle */}
              <div className="relative w-24 h-24 mb-4">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-muted/30"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * (data?.score || 0)) / 100}
                    strokeLinecap="round"
                    className={statusConfig.color}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-2xl font-bold ${statusConfig.color}`}>{data?.score || 0}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Pontuação de segurança</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Monitor className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{data?.totalComputers || 0}</p>
            <p className="text-xs text-muted-foreground">Computadores</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-6 w-6 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold text-green-600">{data?.onlineComputers || 0}</p>
            <p className="text-xs text-muted-foreground">Online</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className={`h-6 w-6 mx-auto mb-2 ${(data?.activeAlerts || 0) > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
            <p className={`text-2xl font-bold ${(data?.activeAlerts || 0) > 0 ? 'text-yellow-600' : ''}`}>
              {data?.activeAlerts || 0}
            </p>
            <p className="text-xs text-muted-foreground">Alertas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-bold">{data?.nextCheck || '--'}</p>
            <p className="text-xs text-muted-foreground">Próxima verificação</p>
          </CardContent>
        </Card>
      </div>

      {/* Issues List */}
      {data?.issues && data.issues.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              O que precisa de atenção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.issues.map((issue, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`flex items-center justify-between gap-3 p-3 rounded-lg ${
                  issue.severity === 'critical' ? 'bg-red-500/10' : 
                  issue.severity === 'warning' ? 'bg-yellow-500/10' : 'bg-muted'
                }`}
              >
                <div className="flex items-center gap-3">
                  {issue.severity === 'critical' ? (
                    <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  ) : issue.severity === 'warning' ? (
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                  ) : (
                    <Monitor className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <div>
                    <span className="text-sm font-medium">{issue.text}</span>
                    {issue.action && (
                      <p className="text-xs text-muted-foreground">{issue.action}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Latest Report */}
      {data?.latestReport && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Último Relatório
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{data.latestReport.title}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(data.latestReport.created_at), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={data.latestReport.risk_score >= 60 ? 'destructive' : data.latestReport.risk_score >= 30 ? 'secondary' : 'outline'}>
                  Risco: {data.latestReport.risk_score}
                </Badge>
                {data.latestReport.file_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={data.latestReport.file_url} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-1" />
                      PDF
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/client/computers">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Monitor className="h-5 w-5 text-primary" />
                <span className="font-medium">Ver computadores</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/client/security">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-medium">Status de segurança</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/client/reports">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-medium">Todos os relatórios</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
};
