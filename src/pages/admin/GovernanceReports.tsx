import { useState } from 'react';
import { useGovernanceReports, useWeeklyMetrics, useCreateReport, useApproveReport } from '@/hooks/useGovernanceReports';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  FileText, 
  Plus, 
  Download, 
  CheckCircle2, 
  Clock, 
  Calendar,
  TrendingUp,
  AlertTriangle,
  Loader2,
  FileCheck
} from 'lucide-react';
import { format, ptBR } from '@/lib/date-utils';
import { subDays, startOfWeek, endOfWeek } from 'date-fns';
// jsPDF imported dynamically to avoid test/build issues

export default function GovernanceReports() {
  const { tenant } = useTenant();
  const { data: reports, isLoading } = useGovernanceReports();
  const { data: weeklyMetrics, isLoading: metricsLoading } = useWeeklyMetrics();
  const createReport = useCreateReport();
  const approveReport = useApproveReport();
  const [generatingReport, setGeneratingReport] = useState(false);

  const handleGenerateWeeklyReport = async () => {
    if (!tenant?.id || !weeklyMetrics) return;
    
    setGeneratingReport(true);
    try {
      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

      const executiveSummary = `
Relatório Semanal de Governança - ${format(weekStart, "dd/MM", { locale: ptBR })} a ${format(weekEnd, "dd/MM/yyyy", { locale: ptBR })}

📊 Resumo Executivo:
- Tasks Abertas: ${weeklyMetrics.tasks_opened || 0}
- Tasks Resolvidas: ${weeklyMetrics.tasks_resolved || 0}
- Riscos Aceitos: ${weeklyMetrics.tasks_risk_accepted || 0}
- Violações de SLA: ${weeklyMetrics.sla_breached || 0}
- Decisões Humanas: ${weeklyMetrics.human_decisions || 0}

⏱️ Tempo Médio de Resolução: ${weeklyMetrics.avg_resolution_hours?.toFixed(1) || 'N/A'}h

${weeklyMetrics.sla_breached > 0 ? '⚠️ ATENÇÃO: Houve violações de SLA esta semana.' : '✅ Sem violações de SLA esta semana.'}
${weeklyMetrics.critical_open > 0 ? `🔴 ${weeklyMetrics.critical_open} tasks críticas em aberto.` : ''}
      `.trim();

      await createReport.mutateAsync({
        reportType: 'weekly',
        periodStart: format(weekStart, 'yyyy-MM-dd'),
        periodEnd: format(weekEnd, 'yyyy-MM-dd'),
        executiveSummary,
        keyMetrics: weeklyMetrics as unknown as import('@/integrations/supabase/types').Json,
      });
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleApproveReport = (reportId: string) => {
    approveReport.mutate(reportId);
  };

  const handleExportPDF = async (report: typeof reports[0]) => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    
    const { loadLogoForPDF, addLogoToPDF } = await import('@/lib/pdfLogoHelper');
    const logoDataUrl = await loadLogoForPDF();
    addLogoToPDF(doc, logoDataUrl, 26, 6, 16);
    doc.setFontSize(18);
    doc.text('Relatório de Governança', 46, 20);
    
    doc.setFontSize(12);
    doc.text(`Período: ${format(new Date(report.period_start), "dd/MM/yyyy", { locale: ptBR })} - ${format(new Date(report.period_end), "dd/MM/yyyy", { locale: ptBR })}`, 20, 35);
    doc.text(`Tipo: ${report.report_type === 'weekly' ? 'Semanal' : report.report_type === 'monthly' ? 'Mensal' : 'Trimestral'}`, 20, 45);
    doc.text(`Gerado em: ${format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 20, 55);
    
    if (report.approved_at) {
      doc.setTextColor(0, 128, 0);
      doc.text(`Aprovado em: ${format(new Date(report.approved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 20, 65);
      doc.setTextColor(0, 0, 0);
    }
    
    doc.line(20, 75, 190, 75);
    
    doc.setFontSize(10);
    const summaryLines = doc.splitTextToSize(report.executive_summary || '', 170);
    doc.text(summaryLines, 20, 85);
    
    doc.save(`governance-report-${format(new Date(report.period_start), 'yyyy-MM-dd')}.pdf`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Relatórios de Governança
          </h1>
          <p className="text-muted-foreground">
            Relatórios executivos de compliance e governança
          </p>
        </div>
        <Button 
          onClick={handleGenerateWeeklyReport}
          disabled={generatingReport || metricsLoading}
        >
          {generatingReport ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Gerar Relatório Semanal
        </Button>
      </div>

      {/* Current Week Metrics Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Métricas da Semana Atual
          </CardTitle>
          <CardDescription>
            Preview dos dados que serão incluídos no próximo relatório
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metricsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : weeklyMetrics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">Tasks Abertas</p>
                <p className="text-2xl font-bold">{weeklyMetrics.tasks_opened || 0}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">Resolvidas</p>
                <p className="text-2xl font-bold text-green-600">{weeklyMetrics.tasks_resolved || 0}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">Violações SLA</p>
                <p className={`text-2xl font-bold ${weeklyMetrics.sla_breached > 0 ? 'text-red-600' : ''}`}>
                  {weeklyMetrics.sla_breached || 0}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">Tempo Médio</p>
                <p className="text-2xl font-bold">{weeklyMetrics.avg_resolution_hours?.toFixed(1) || 'N/A'}h</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Nenhuma métrica disponível</p>
          )}
        </CardContent>
      </Card>

      {/* Reports List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Histórico de Relatórios
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reports && reports.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {reports.map((report) => (
                  <div key={report.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-primary/10">
                          <Calendar className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">
                            Relatório {report.report_type === 'weekly' ? 'Semanal' : report.report_type === 'monthly' ? 'Mensal' : 'Trimestral'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(report.period_start), "dd/MM", { locale: ptBR })} - {format(new Date(report.period_end), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {report.approved_at ? (
                          <Badge className="gap-1 bg-green-500">
                            <CheckCircle2 className="h-3 w-3" />
                            Aprovado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <Clock className="h-3 w-3" />
                            Pendente
                          </Badge>
                        )}
                      </div>
                    </div>

                    {report.executive_summary && (
                      <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-3">
                        {report.executive_summary}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      {!report.approved_at && (
                        <Button 
                          size="sm" 
                          onClick={() => handleApproveReport(report.id)}
                          disabled={approveReport.isPending}
                        >
                          {approveReport.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          Aprovar
                        </Button>
                      )}
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleExportPDF(report)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Exportar PDF
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum relatório gerado ainda</p>
              <p className="text-sm">Clique em "Gerar Relatório Semanal" para criar o primeiro</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
