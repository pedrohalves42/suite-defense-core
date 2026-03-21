import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { DashboardAgent, DashboardJob } from "@/types/dashboard";
import { logger } from '@/lib/logger';

interface DashboardPDFReportProps {
  agents: DashboardAgent[];
  jobs: DashboardJob[];
  tenantName: string;
  onlinePercentage: string;
  successRate: string;
  offlineCount: number;
  failedJobs: number;
  alerts: number;
  systemState: 'healthy' | 'warning' | 'critical';
}

export function DashboardPDFReport({
  agents, jobs, tenantName, onlinePercentage, successRate,
  offlineCount, failedJobs, alerts, systemState,
}: DashboardPDFReportProps) {
  const [generating, setGenerating] = useState(false);

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const jsPDFModule = await import("jspdf");
      const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
      await import("jspdf-autotable");

      const doc = new jsPDF() as any;

      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR');
      const timeStr = now.toLocaleTimeString('pt-BR');

      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text('CyberShield — Relatório Executivo', 14, 18);
      doc.setFontSize(10);
      doc.text(`${tenantName} • Gerado em ${dateStr} às ${timeStr}`, 14, 28);

      // Status badge
      const stateLabel = systemState === 'healthy' ? 'SAUDÁVEL' : systemState === 'critical' ? 'CRÍTICO' : 'ATENÇÃO';
      const stateColor: [number, number, number] = systemState === 'healthy' ? [34, 197, 94] : systemState === 'critical' ? [239, 68, 68] : [234, 179, 8];
      doc.setFillColor(...stateColor);
      doc.roundedRect(150, 32, 46, 8, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text(stateLabel, 173, 37.5, { align: 'center' });

      // KPIs Section
      let y = 52;
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(14);
      doc.text('Indicadores Principais', 14, y);
      y += 8;

      const kpis = [
        ['Computadores Monitorados', `${agents.length}`],
        ['Online', `${onlinePercentage}%`],
        ['Offline', `${offlineCount}`],
        ['Taxa de Sucesso', `${successRate}%`],
        ['Alertas Ativos', `${alerts}`],
        ['Falhas (24h)', `${failedJobs}`],
      ];

      (doc as any).autoTable({
        startY: y,
        head: [['Métrica', 'Valor']],
        body: kpis,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 10 },
        bodyStyles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 12;

      // Jobs by status
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text('Distribuição de Verificações', 14, y);
      y += 8;

      const statusCounts = jobs.reduce((acc, j) => {
        const label = j.status === 'completed' ? 'Concluída' : j.status === 'failed' ? 'Falha' : j.status === 'queued' ? 'Aguardando' : j.status;
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      (doc as any).autoTable({
        startY: y,
        head: [['Status', 'Quantidade', '% do Total']],
        body: Object.entries(statusCounts).map(([status, count]) => [
          status, count.toString(), `${((count / Math.max(jobs.length, 1)) * 100).toFixed(1)}%`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 10 },
        bodyStyles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 12;

      // Top 10 agents by jobs
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text('Top 10 Computadores Mais Ativos', 14, y);
      y += 8;

      const agentJobCounts = agents
        .map(a => ({
          name: a.agent_name,
          jobs: jobs.filter(j => j.agent_name === a.agent_name).length,
          online: a.last_heartbeat && (now.getTime() - new Date(a.last_heartbeat).getTime()) < 5 * 60 * 1000,
        }))
        .sort((a, b) => b.jobs - a.jobs)
        .slice(0, 10);

      (doc as any).autoTable({
        startY: y,
        head: [['Computador', 'Verificações', 'Status']],
        body: agentJobCounts.map(a => [a.name, a.jobs.toString(), a.online ? 'Online' : 'Offline']),
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 10 },
        bodyStyles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 12;

      // Recommendations
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text('Recomendações', 14, y);
      y += 8;

      const recommendations: string[] = [];
      if (offlineCount > 0) recommendations.push(`• Verificar ${offlineCount} computador(es) offline e restaurar conectividade.`);
      if (failedJobs > 0) recommendations.push(`• Investigar ${failedJobs} verificação(ões) com falha nas últimas 24h.`);
      if (Number(onlinePercentage) < 90) recommendations.push('• Cobertura de proteção abaixo de 90% — considerar ação urgente.');
      if (alerts > 0) recommendations.push(`• ${alerts} alerta(s) ativo(s) requerem atenção imediata.`);
      if (recommendations.length === 0) recommendations.push('• Sistema operando dentro dos parâmetros esperados. Nenhuma ação necessária.');

      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      recommendations.forEach(rec => {
        doc.text(rec, 14, y);
        y += 6;
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`CyberShield • ${tenantName} • Página ${i}/${pageCount}`, 105, 290, { align: 'center' });
      }

      doc.save(`relatorio-executivo-${now.toISOString().split('T')[0]}.pdf`);
      toast.success('Relatório PDF gerado com sucesso!');
    } catch (err) {
      logger.error('Erro ao gerar PDF:', err);
      toast.error('Erro ao gerar relatório PDF');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={generatePDF}
      disabled={generating}
      className="gap-2"
    >
      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      Relatório PDF
    </Button>
  );
}
