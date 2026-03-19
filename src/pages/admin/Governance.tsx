import { useState } from 'react';
import { useGovernanceStats } from '@/hooks/useGovernanceStats';
import { useTaskStats } from '@/hooks/useTasks';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Users, 
  TrendingUp, 
  Shield,
  XCircle,
  AlertOctagon,
  ListTodo,
  Timer,
  FileText,
  Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CoverageGates } from '@/components/governance/CoverageGates';
import { RiskDebtCard } from '@/components/governance/RiskDebtCard';
import { KillSwitchControl } from '@/components/governance/KillSwitchControl';
import { generateTrustReportPDF } from '@/lib/trustReportPDF';
import { toast } from 'sonner';

export default function Governance() {
  const { data: govStats, isLoading: govLoading } = useGovernanceStats();
  const { data: taskStats, isLoading: taskLoading } = useTaskStats();
  const { tenant } = useTenant();
  const [generatingReport, setGeneratingReport] = useState(false);

  const isLoading = govLoading || taskLoading;

  const handleTrustReport = async () => {
    if (!tenant?.id) return;
    setGeneratingReport(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      await generateTrustReportPDF(tenant.id, startDate, endDate);
      toast.success('Trust Report gerado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar Trust Report');
    } finally {
      setGeneratingReport(false);
    }
  };

  // Calculate governance health score (0-100)
  const calculateHealthScore = () => {
    if (!govStats) return 0;
    
    let score = 100;
    
    // Penalize for unassigned critical tasks
    if (govStats.critical_open > 0) score -= govStats.critical_open * 15;
    if (govStats.unassigned_tasks > 0) score -= govStats.unassigned_tasks * 5;
    if (govStats.sla_breached_active > 0) score -= govStats.sla_breached_active * 10;
    
    return Math.max(0, Math.min(100, score));
  };

  const healthScore = calculateHealthScore();

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getHealthLabel = (score: number) => {
    if (score >= 80) return 'Excelente';
    if (score >= 60) return 'Bom';
    if (score >= 40) return 'Atenção';
    return 'Crítico';
  };

  // Compliance checklist items
  const checklistItems = [
    {
      label: 'Tasks críticas com owner',
      status: govStats ? govStats.critical_open === 0 || govStats.unassigned_tasks === 0 : false,
      urgent: govStats ? govStats.critical_open > 0 && govStats.unassigned_tasks > 0 : false,
    },
    {
      label: 'Nenhum SLA violado ativo',
      status: govStats ? govStats.sla_breached_active === 0 : false,
      urgent: govStats ? govStats.sla_breached_active > 0 : false,
    },
    {
      label: 'Tasks resolvidas nas últimas 24h',
      status: govStats ? govStats.resolved_24h > 0 : false,
      urgent: false,
    },
    {
      label: 'Menos de 5 tasks ativas',
      status: govStats ? govStats.active_tasks < 5 : false,
      urgent: govStats ? govStats.active_tasks >= 10 : false,
    },
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72 mt-2" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Governança Operacional
          </h1>
          <p className="text-muted-foreground mt-1">
            Visão consolidada do trabalho real e conformidade
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTrustReport} disabled={generatingReport}>
            {generatingReport ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Trust Report (PDF)
          </Button>
        <Button asChild>
          <Link to="/admin/tasks">
            <ListTodo className="h-4 w-4 mr-2" />
            Ver Todas as Tasks
          </Link>
        </Button>
      </div>

      {/* Health Score Card */}
      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Score de Saúde da Governança</CardTitle>
          <CardDescription>Baseado em tasks abertas, SLAs e atribuições</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <span className={`text-5xl font-bold ${getHealthColor(healthScore)}`}>
                {healthScore}
              </span>
              <p className="text-sm text-muted-foreground mt-1">/100</p>
            </div>
            <div className="flex-1">
              <Progress value={healthScore} className="h-4" />
              <p className={`text-sm font-medium mt-2 ${getHealthColor(healthScore)}`}>
                {getHealthLabel(healthScore)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasks Ativas</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{govStats?.active_tasks || 0}</div>
            <p className="text-xs text-muted-foreground">
              {taskStats?.in_progress_count || 0} em progresso
            </p>
          </CardContent>
        </Card>

        <Card className={govStats?.unassigned_tasks && govStats.unassigned_tasks > 0 ? 'border-yellow-500' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sem Owner</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{govStats?.unassigned_tasks || 0}</div>
            <p className="text-xs text-muted-foreground">
              Precisam de atribuição
            </p>
          </CardContent>
        </Card>

        <Card className={govStats?.sla_breached_active && govStats.sla_breached_active > 0 ? 'border-destructive' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SLA Violado</CardTitle>
            <Clock className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {govStats?.sla_breached_active || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Requerem ação imediata
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {govStats?.avg_resolution_hours 
                ? `${govStats.avg_resolution_hours.toFixed(1)}h` 
                : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              Resolução de tasks
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Critical/High Priority */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-red-500" />
              Prioridades Críticas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Tasks Críticas Abertas</span>
              <Badge variant={govStats?.critical_open ? "destructive" : "secondary"}>
                {govStats?.critical_open || 0}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Tasks Alta Prioridade</span>
              <Badge variant={govStats?.high_open ? "default" : "secondary"}>
                {govStats?.high_open || 0}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Resolvidas (24h)</span>
              <Badge variant="outline" className="text-green-600">
                {govStats?.resolved_24h || 0}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Ignoradas (24h)</span>
              <Badge variant="outline">
                {govStats?.ignored_24h || 0}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Checklist de Conformidade
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {checklistItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                {item.status ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : item.urgent ? (
                  <XCircle className="h-5 w-5 text-red-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                )}
                <span className={`text-sm ${item.urgent ? 'text-destructive font-medium' : ''}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ações Rápidas</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Button asChild variant="outline">
            <Link to="/admin/tasks?status=open">
              Tasks Abertas ({taskStats?.open_count || 0})
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/tasks?slaBreach=true">
              SLA Violado ({govStats?.sla_breached_active || 0})
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/action-center">
              Action Center
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/soc2-dashboard">
              SOC2 Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* New Governance Controls */}
      <div className="grid gap-4 md:grid-cols-2">
        <CoverageGates />
        <RiskDebtCard />
      </div>

      {/* Kill Switch Control */}
      <KillSwitchControl />
    </div>
  );
}
