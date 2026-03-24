import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, FileWarning, Bug, Globe, AlertTriangle } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/tech-tooltip';
import { formatBrazilDateTime } from '@/lib/date-utils';
import type { SecurityReport } from './types';

interface ReportSummaryCardsProps {
  report: SecurityReport;
}

export function ReportSummaryCards({ report }: ReportSummaryCardsProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Sumário do Relatório</span>
            <Badge variant="outline">
              {formatBrazilDateTime(report.generated_at, 'full')}
            </Badge>
          </CardTitle>
          <CardDescription>
            Filtro: {report.agent_filter === 'all' ? 'Todos os Agentes' : `Agente ${report.agent_filter}`}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              Computadores Ativos <HelpTooltip term="endpoint" />
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.statistics.total_agents}</div>
            <p className="text-xs text-muted-foreground">Monitorados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              Software Inventariado <HelpTooltip term="inventário de software" />
            </CardTitle>
            <FileWarning className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.statistics.total_software}</div>
            <p className="text-xs text-muted-foreground">Aplicações instaladas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              Vulnerabilidades <HelpTooltip term="vulnerabilidade" />
            </CardTitle>
            <Bug className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {report.statistics.total_vulnerabilities}
            </div>
            <p className="text-xs text-muted-foreground">
              {report.statistics.critical_vulnerabilities} críticas, {report.statistics.high_vulnerabilities} altas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Antivírus</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.statistics.antivirus_engines}</div>
            <p className="text-xs text-muted-foreground">
              {report.statistics.threats_found} ameaças detectadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atividade Web</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.statistics.unique_domains}</div>
            <p className="text-xs text-muted-foreground">Domínios únicos acessados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scans de Vírus</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {report.statistics.malicious_scans}/{report.statistics.total_scans}
            </div>
            <p className="text-xs text-muted-foreground">Arquivos maliciosos detectados</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
