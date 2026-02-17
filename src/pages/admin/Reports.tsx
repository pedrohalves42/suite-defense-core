import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, Loader2, Shield, AlertTriangle, Bug, Globe, FileWarning, FileSpreadsheet, Award, History, Scale } from "lucide-react";
import { toast } from "sonner";
import { HelpTooltip } from "@/components/ui/tech-tooltip";
import { GeneratedReportsList } from "@/components/admin/GeneratedReportsList";
import { ComplianceReportGenerator } from "@/components/admin/ComplianceReportGenerator";
import { SecurityAuditReport } from "@/components/security/SecurityAuditReport";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { useTenant } from "@/hooks/useTenant";
// jsPDF and autoTable imported dynamically to avoid test/build issues

interface Agent {
  id: string;
  agent_name: string;
  status: string;
}

interface RiskClassification {
  level: string;
  color: string;
  description: string;
}

interface UnprotectedPCs {
  no_antivirus: number;
  outdated_av: number;
  offline_agents: number;
  agents_without_av?: Array<{ agent_name: string; hostname: string; last_heartbeat: string }>;
}

interface Recommendation {
  priority: number;
  category: string;
  title: string;
  description: string;
}

interface SecurityReport {
  success?: boolean;
  generated_at: string;
  tenant_id: string;
  agent_filter: string;
  risk_score?: number;
  risk_classification?: RiskClassification;
  unprotected_pcs?: UnprotectedPCs;
  recommendations?: Recommendation[];
  statistics: {
    total_agents: number;
    total_software: number;
    total_vulnerabilities: number;
    critical_vulnerabilities: number;
    high_vulnerabilities: number;
    medium_vulnerabilities?: number;
    low_vulnerabilities?: number;
    antivirus_engines: number;
    threats_found: number;
    unique_domains: number;
    malicious_scans: number;
    total_scans: number;
    security_events: number;
    failed_login_attempts_24h?: number;
  };
  data?: {
    agents: any[];
    software_inventory: any[];
    vulnerabilities: any[];
    antivirus_status: any[];
    web_activity: any[];
    virus_scans: any[];
    security_events: any[];
    failed_login_attempts?: any[];
  };
}

export default function Reports() {
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [isGenerating, setIsGenerating] = useState(false);
  const { tenant } = useTenant();

  const { data: agents } = useQuery({
    queryKey: ["agents", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      // ADR-026: Use agents_safe view to protect hmac_secret
      const { data, error } = await supabase
        .from("agents_safe")
        .select("id, agent_name, status")
        .eq("tenant_id", tenant.id)
        .eq("status", "active")
        .order("agent_name");

      if (error) throw error;
      return data as Agent[];
    },
    enabled: !!tenant?.id,
  });

  const { data: report, refetch: refetchReport, isLoading: isLoadingReport } = useQuery({
    queryKey: ["security-report", selectedAgent],
    queryFn: async () => {
      const params = new URLSearchParams({ format: "summary" });
      if (selectedAgent !== "all") {
        params.append("agent_id", selectedAgent);
      }

      const { data, error } = await supabase.functions.invoke(
        `generate-security-report?${params.toString()}`,
        { method: "GET" }
      );

      if (error) throw error;
      return data as SecurityReport;
    },
    enabled: false,
  });

  const handleGenerateReport = async (downloadFull: boolean = false) => {
    setIsGenerating(true);
    try {
      const params = new URLSearchParams();
      if (selectedAgent !== "all") {
        params.append("agent_id", selectedAgent);
      }

      if (downloadFull) {
        params.append("format", "json");
      } else {
        params.append("format", "summary");
      }

      const { data, error } = await supabase.functions.invoke(
        `generate-security-report?${params.toString()}`,
        { method: "GET" }
      );

      if (error) throw error;

      if (downloadFull) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `security-report-${selectedAgent}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast.success("Relatório completo baixado com sucesso!");
      } else {
        await refetchReport();
        toast.success("Relatório de segurança gerado com sucesso!");
      }
    } catch (error: any) {
      console.error("Error generating report:", error);
      const errorMessage = error?.message || "Erro desconhecido";
      
      if (errorMessage.includes('NO_TENANT') || errorMessage.includes('não está associado')) {
        toast.error("Você não está associado a nenhum tenant. Contate o administrador.");
      } else if (errorMessage.includes('Edge Function') || errorMessage.includes('Failed to fetch')) {
        toast.error("Erro ao conectar com o servidor. Tente novamente em alguns segundos.");
      } else {
        toast.error(`Erro ao gerar relatório: ${errorMessage}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    setIsGenerating(true);
    try {
      toast.info("Gerando relatório PDF...");
      
      const params = new URLSearchParams({ format: "json" });
      if (selectedAgent !== "all") {
        params.append("agent_id", selectedAgent);
      }

      const { data, error } = await supabase.functions.invoke(
        `generate-security-report?${params.toString()}`,
        { method: "GET" }
      );

      if (error) {
        console.error("Edge function error:", error);
        throw new Error(`Erro ao buscar dados: ${error.message}`);
      }

      if (!data) {
        throw new Error("Nenhum dado retornado do servidor");
      }

      const reportData = data as SecurityReport;
      
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 20;

      // Header with dark background
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 45, 'F');
      
      // Logo/Title
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.text('CYBERSHIELD', pageWidth / 2, 18, { align: 'center' });
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('Relatório de Segurança', pageWidth / 2, 28, { align: 'center' });
      
      doc.setFontSize(10);
      const dateStr = formatBrazilDateTime(reportData.generated_at, 'full');
      doc.text(`Gerado em: ${dateStr}`, pageWidth / 2, 38, { align: 'center' });
      
      yPos = 55;

      // Filter info
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(10);
      const filterText = reportData.agent_filter === 'all' ? 'Todos os Agentes' : `Agente: ${reportData.agent_filter}`;
      doc.text(`Filtro: ${filterText}`, 14, yPos);
      yPos += 10;

      // Executive Summary Section
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMÁRIO EXECUTIVO', 14, yPos);
      yPos += 8;

      // Summary cards as table
      const summaryData = [
        ['Agentes Ativos', String(reportData.statistics.total_agents)],
        ['Software Inventariado', String(reportData.statistics.total_software)],
        ['Vulnerabilidades', String(reportData.statistics.total_vulnerabilities)],
        ['Vulnerab. Críticas', String(reportData.statistics.critical_vulnerabilities)],
        ['Vulnerab. Altas', String(reportData.statistics.high_vulnerabilities)],
        ['Engines Antivírus', String(reportData.statistics.antivirus_engines)],
        ['Ameaças Detectadas', String(reportData.statistics.threats_found)],
        ['Domínios Únicos', String(reportData.statistics.unique_domains)],
        ['Scans Maliciosos', `${reportData.statistics.malicious_scans}/${reportData.statistics.total_scans}`],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [['Métrica', 'Valor']],
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'center' } },
        margin: { left: 14, right: 14 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Software Inventory Section
      if (reportData.data?.software_inventory && reportData.data.software_inventory.length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('INVENTÁRIO DE SOFTWARE', 14, yPos);
        yPos += 6;

        const softwareData = reportData.data.software_inventory.slice(0, 20).map((sw: any) => [
          (sw.name || '').substring(0, 30),
          (sw.version || '-').substring(0, 15),
          (sw.vendor || '-').substring(0, 20),
          sw.risk_level || 'unknown'
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Nome', 'Versão', 'Fornecedor', 'Risco']],
          body: softwareData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 3 },
          columnStyles: { 
            3: { 
              cellWidth: 25,
              halign: 'center'
            } 
          },
          margin: { left: 14, right: 14 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 12;
        
        if (reportData.data.software_inventory.length > 20) {
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text(`... e mais ${reportData.data.software_inventory.length - 20} aplicações`, 14, yPos);
          yPos += 10;
        }
      }

      // Vulnerabilities Section
      if (reportData.data?.vulnerabilities && reportData.data.vulnerabilities.length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('VULNERABILIDADES DETECTADAS', 14, yPos);
        yPos += 6;

        const vulnData = reportData.data.vulnerabilities.slice(0, 15).map((vuln: any) => [
          vuln.severity || '-',
          (vuln.title || vuln.check_key || '-').substring(0, 35),
          (vuln.description || '-').substring(0, 40),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Severidade', 'Título', 'Descrição']],
          body: vulnData,
          theme: 'striped',
          headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 3 },
          columnStyles: { 
            0: { cellWidth: 25, halign: 'center' }
          },
          margin: { left: 14, right: 14 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 12;
      }

      // Antivirus Status Section
      if (reportData.data?.antivirus_status && reportData.data.antivirus_status.length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('STATUS DO ANTIVÍRUS', 14, yPos);
        yPos += 6;

        const avData = reportData.data.antivirus_status.map((av: any) => [
          av.engine_name || '-',
          av.engine_version || '-',
          av.status || '-',
          av.threats_found || '0'
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Engine', 'Versão', 'Status', 'Ameaças']],
          body: avData,
          theme: 'striped',
          headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 9, cellPadding: 3 },
          margin: { left: 14, right: 14 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 12;
      }

      // Web Activity Section (Top 30)
      if (reportData.data?.web_activity && reportData.data.web_activity.length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('ATIVIDADE WEB (Top 30 Domínios)', 14, yPos);
        yPos += 6;

        const webData = reportData.data.web_activity.slice(0, 30).map((web: any) => [
          (web.domain || '-').substring(0, 40),
          web.source || '-',
          formatBrazilDateTime(web.visited_at, 'date')
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Domínio', 'Fonte', 'Data']],
          body: webData,
          theme: 'striped',
          headStyles: { fillColor: [139, 92, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 3 },
          margin: { left: 14, right: 14 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 12;
      }

      // Footer on last page
      const totalPages = doc.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Página ${i} de ${totalPages} | CyberShield Security Platform | www.cybershield.com.br`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }

      // Save PDF
      const agentName = selectedAgent === 'all' ? 'todos' : agents?.find(a => a.id === selectedAgent)?.agent_name || selectedAgent;
      doc.save(`relatorio-seguranca-${agentName}-${new Date().toISOString().split('T')[0]}.pdf`);
      
      toast.success("Relatório PDF gerado com sucesso!");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("Erro ao exportar PDF: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  // NEW: Export professional "Laudo de Segurança" PDF with certification seal, QR code, validity date
  const handleExportLaudo = async () => {
    setIsGenerating(true);
    try {
      toast.info("Gerando Laudo de Segurança...");
      
      const params = new URLSearchParams({ format: "json" });
      if (selectedAgent !== "all") {
        params.append("agent_id", selectedAgent);
      }

      const { data, error } = await supabase.functions.invoke(
        `generate-security-report?${params.toString()}`,
        { method: "GET" }
      );

      if (error) throw new Error(`Erro ao buscar dados: ${error.message}`);
      if (!data) throw new Error("Nenhum dado retornado do servidor");

      const reportData = data as SecurityReport;
      
      const QRCode = await import('qrcode');
      
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 0;

      // Generate unique laudo ID and dates
      const laudoId = crypto.randomUUID().substring(0, 8).toUpperCase();
      const generatedDate = new Date(reportData.generated_at);
      const validUntilDate = new Date(generatedDate);
      validUntilDate.setDate(validUntilDate.getDate() + 30);
      
      const dateStrFull = generatedDate.toLocaleDateString('pt-BR', { 
        day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo'
      });
      const validUntilStr = validUntilDate.toLocaleDateString('pt-BR', { 
        day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo'
      });

      // Generate QR code for verification
      const verificationUrl = `https://cybershield.com.br/verificar/${laudoId}`;
      const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, { 
        width: 100, 
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' }
      });

      // Helper function to format values (fix "N" issue)
      const formatValue = (value: any, fallback: string = 'Não disponível'): string => {
        if (value === null || value === undefined || value === '' || value === 'N' || value === 'N/A') {
          return fallback;
        }
        return String(value);
      };

      // Extract risk data with proper fallbacks
      const riskScore = reportData.risk_score ?? 0;
      const riskClass = reportData.risk_classification || { 
        level: 'Não calculado', 
        color: 'gray', 
        description: 'Aguardando análise de segurança' 
      };
      const stats = reportData.statistics;
      const unprotected = reportData.unprotected_pcs || { no_antivirus: 0, outdated_av: 0, offline_agents: 0 };

      // ==================== PAGE 1: COVER ====================
      // Full dark background
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      // Logo area with shield icon
      doc.setFillColor(37, 99, 235);
      doc.circle(pageWidth / 2, 55, 22, 'F');
      doc.setFillColor(59, 130, 246);
      doc.circle(pageWidth / 2, 55, 18, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('CS', pageWidth / 2, 60, { align: 'center' });
      
      // Title
      doc.setFontSize(32);
      doc.text('LAUDO DE SEGURANÇA', pageWidth / 2, 100, { align: 'center' });
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('Análise Completa de Vulnerabilidades e Riscos', pageWidth / 2, 112, { align: 'center' });
      
      // Risk Score Circle with gradient effect
      const getRiskColor = (): [number, number, number] => {
        if (riskClass.color === 'green') return [34, 197, 94];
        if (riskClass.color === 'yellow') return [234, 179, 8];
        if (riskClass.color === 'orange') return [249, 115, 22];
        return [239, 68, 68];
      };
      const riskColor = getRiskColor();
      
      // Outer ring
      doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
      doc.circle(pageWidth / 2, 155, 32, 'F');
      // Inner dark circle
      doc.setFillColor(15, 23, 42);
      doc.circle(pageWidth / 2, 155, 26, 'F');
      // Score text
      doc.setTextColor(riskColor[0], riskColor[1], riskColor[2]);
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.text(String(riskScore), pageWidth / 2, 160, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text('SCORE', pageWidth / 2, 170, { align: 'center' });
      
      // Risk level badge
      doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
      doc.roundedRect(pageWidth / 2 - 35, 185, 70, 12, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`RISCO: ${formatValue(riskClass.level, 'PENDENTE')}`, pageWidth / 2, 193, { align: 'center' });
      
      // Metadata box
      doc.setFillColor(30, 41, 59);
      doc.roundedRect(30, 210, pageWidth - 60, 50, 5, 5, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      const filterText = reportData.agent_filter === 'all' 
        ? 'Todos os Computadores' 
        : `Computador: ${agents?.find(a => a.id === reportData.agent_filter)?.agent_name || reportData.agent_filter}`;
      
      doc.text(`Laudo Nº: ${laudoId}`, 40, 225);
      doc.text(`Data de Emissão: ${dateStrFull}`, 40, 235);
      doc.text(`Válido até: ${validUntilStr}`, 40, 245);
      doc.text(`Escopo: ${filterText}`, 40, 255);
      
      // Footer on cover
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text('CyberShield Security Platform', pageWidth / 2, pageHeight - 25, { align: 'center' });
      doc.text('www.cybershield.com.br', pageWidth / 2, pageHeight - 17, { align: 'center' });

      // ==================== PAGE 2: EXECUTIVE SUMMARY ====================
      doc.addPage();
      yPos = 20;
      
      // Header bar
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`LAUDO DE SEGURANÇA - Nº ${laudoId}`, pageWidth / 2, 10, { align: 'center' });
      
      // Section 1 title
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('1. SUMÁRIO EXECUTIVO', 14, yPos + 10);
      yPos += 20;
      
      // Risk classification box with proper color coding
      const bgColors: Record<string, [number, number, number]> = {
        green: [220, 252, 231],
        yellow: [254, 249, 195],
        orange: [255, 237, 213],
        red: [254, 226, 226],
        gray: [241, 245, 249]
      };
      const textColors: Record<string, [number, number, number]> = {
        green: [22, 101, 52],
        yellow: [113, 63, 18],
        orange: [154, 52, 18],
        red: [153, 27, 27],
        gray: [71, 85, 105]
      };
      
      const bgColor = bgColors[riskClass.color] || bgColors.gray;
      const txtColor = textColors[riskClass.color] || textColors.gray;
      
      doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
      doc.roundedRect(14, yPos, pageWidth - 28, 30, 3, 3, 'F');
      
      doc.setTextColor(txtColor[0], txtColor[1], txtColor[2]);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Classificação: ${formatValue(riskClass.level, 'Pendente')} (Score: ${riskScore}/100)`, 20, yPos + 12);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(formatValue(riskClass.description, 'Análise de risco em andamento'), 20, yPos + 22);
      yPos += 40;
      
      // Visual Risk Bar
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Indicador Visual de Risco:', 14, yPos);
      yPos += 6;
      
      // Background bar
      doc.setFillColor(229, 231, 235);
      doc.roundedRect(14, yPos, pageWidth - 28, 8, 2, 2, 'F');
      // Filled portion based on score
      const barWidth = ((100 - riskScore) / 100) * (pageWidth - 28);
      doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
      doc.roundedRect(14, yPos, Math.max(barWidth, 5), 8, 2, 2, 'F');
      
      // Labels under bar
      yPos += 12;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('0 (Crítico)', 14, yPos);
      doc.text('100 (Seguro)', pageWidth - 14, yPos, { align: 'right' });
      yPos += 12;

      // Key metrics table
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Principais Indicadores:', 14, yPos);
      yPos += 6;
      
      const keyMetrics = [
        ['Computadores Monitorados', formatValue(stats.total_agents, '0')],
        ['Computadores Desprotegidos', formatValue(unprotected.no_antivirus, '0')],
        ['Antivírus Desatualizado', formatValue(unprotected.outdated_av, '0')],
        ['Computadores Offline', formatValue(unprotected.offline_agents, '0')],
        ['Vulnerabilidades Críticas', formatValue(stats.critical_vulnerabilities, '0')],
        ['Vulnerabilidades Altas', formatValue(stats.high_vulnerabilities, '0')],
        ['Ameaças Detectadas', formatValue(stats.threats_found, '0')],
        ['Tentativas Login Suspeitas (24h)', formatValue(stats.failed_login_attempts_24h, '0')],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [['Indicador', 'Valor']],
        body: keyMetrics,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        styles: { fontSize: 10 },
        columnStyles: { 1: { halign: 'center', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 15;

      // ==================== VULNERABILITY PIE CHART (Visual) ====================
      if (yPos > pageHeight - 80) { doc.addPage(); yPos = 25; }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Distribuição de Vulnerabilidades por Severidade:', 14, yPos);
      yPos += 10;
      
      const vulnCritical = stats.critical_vulnerabilities || 0;
      const vulnHigh = stats.high_vulnerabilities || 0;
      const vulnMedium = stats.medium_vulnerabilities || 0;
      const vulnLow = stats.low_vulnerabilities || 0;
      const vulnTotal = vulnCritical + vulnHigh + vulnMedium + vulnLow;
      
      if (vulnTotal > 0) {
        // Draw legend with colored boxes
        const legendItems = [
          { label: `Críticas: ${vulnCritical}`, color: [220, 38, 38] as [number, number, number], pct: Math.round((vulnCritical / vulnTotal) * 100) },
          { label: `Altas: ${vulnHigh}`, color: [249, 115, 22] as [number, number, number], pct: Math.round((vulnHigh / vulnTotal) * 100) },
          { label: `Médias: ${vulnMedium}`, color: [234, 179, 8] as [number, number, number], pct: Math.round((vulnMedium / vulnTotal) * 100) },
          { label: `Baixas: ${vulnLow}`, color: [34, 197, 94] as [number, number, number], pct: Math.round((vulnLow / vulnTotal) * 100) },
        ];
        
        // Draw horizontal bars for each severity
        legendItems.forEach((item, idx) => {
          const barY = yPos + (idx * 12);
          // Label
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(15, 23, 42);
          doc.text(item.label, 14, barY + 6);
          // Bar background
          doc.setFillColor(229, 231, 235);
          doc.roundedRect(55, barY, 100, 8, 2, 2, 'F');
          // Bar filled
          const filledWidth = (item.pct / 100) * 100;
          doc.setFillColor(item.color[0], item.color[1], item.color[2]);
          doc.roundedRect(55, barY, Math.max(filledWidth, 2), 8, 2, 2, 'F');
          // Percentage
          doc.setTextColor(100, 100, 100);
          doc.text(`${item.pct}%`, 160, barY + 6);
        });
        yPos += 55;
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(34, 197, 94);
        doc.text('✓ Nenhuma vulnerabilidade detectada', 14, yPos);
        yPos += 15;
      }

      // ==================== SECTION: O QUE ISSO SIGNIFICA PARA VOCÊ ====================
      if (yPos > pageHeight - 100) { doc.addPage(); yPos = 25; }
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('📋 O QUE ISSO SIGNIFICA PARA VOCÊ?', 14, yPos);
      yPos += 10;
      
      // Box de explicação humanizada
      doc.setFillColor(239, 246, 255); // blue-50
      doc.roundedRect(14, yPos, pageWidth - 28, 70, 4, 4, 'F');
      doc.setDrawColor(59, 130, 246);
      doc.setLineWidth(0.3);
      doc.roundedRect(14, yPos, pageWidth - 28, 70, 4, 4, 'S');
      
      doc.setTextColor(30, 64, 175); // blue-800
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Em linguagem simples:', 20, yPos + 10);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(55, 65, 81); // gray-700
      
      // Gerar explicação baseada nos dados
      let explanation = '';
      if (riskScore >= 80) {
        explanation = 'Seus computadores estão bem protegidos! Continue mantendo os programas atualizados e o antivírus ativo.';
      } else if (riskScore >= 60) {
        explanation = 'Sua proteção está boa, mas há alguns pontos de atenção. Recomendamos verificar as atualizações pendentes.';
      } else if (riskScore >= 40) {
        explanation = 'Há riscos moderados que precisam de atenção. Algumas falhas de segurança foram encontradas e devem ser corrigidas.';
      } else {
        explanation = 'ATENÇÃO: Foram encontrados riscos significativos. Recomendamos ação imediata para proteger seus dados e sistemas.';
      }
      
      const explanationLines = doc.splitTextToSize(explanation, pageWidth - 48);
      explanationLines.forEach((line: string, i: number) => {
        doc.text(line, 20, yPos + 20 + (i * 5));
      });
      
      // Principais pontos de atenção
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 64, 175);
      doc.text('Principais pontos:', 20, yPos + 38);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(55, 65, 81);
      
      const bulletPoints = [];
      if (stats.critical_vulnerabilities > 0) {
        bulletPoints.push(`• ${stats.critical_vulnerabilities} problema(s) crítico(s) que podem permitir invasões`);
      }
      if (stats.threats_found > 0) {
        bulletPoints.push(`• ${stats.threats_found} ameaça(s) de vírus detectada(s)`);
      }
      if (unprotected.no_antivirus > 0) {
        bulletPoints.push(`• ${unprotected.no_antivirus} computador(es) sem proteção antivírus`);
      }
      if (unprotected.offline_agents > 0) {
        bulletPoints.push(`• ${unprotected.offline_agents} computador(es) offline (não monitorados)`);
      }
      if (bulletPoints.length === 0) {
        bulletPoints.push('• Nenhum problema crítico detectado no momento');
      }
      
      bulletPoints.slice(0, 3).forEach((point, i) => {
        doc.text(point.substring(0, 80), 20, yPos + 46 + (i * 5));
      });
      
      // O que fazer agora
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 64, 175);
      doc.text('O que fazer agora:', 20, yPos + 62);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(55, 65, 81);
      
      let actionText = riskScore >= 60 
        ? 'Continue monitorando. Agende uma revisão mensal.'
        : 'Entre em contato conosco para resolver os problemas identificados.';
      doc.text(actionText, 20, yPos + 68);
      
      yPos += 80;

      // ==================== SECTION 2: METHODOLOGY (EXPANDED) ====================
      if (yPos > pageHeight - 60) { doc.addPage(); yPos = 25; }
      
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('2. METODOLOGIA DE ANÁLISE', 14, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const methodIntro = [
        'Este laudo foi elaborado seguindo padrões internacionais de segurança da informação.',
        'A metodologia CyberShield combina coleta automatizada com análise inteligente de dados.',
      ];
      
      methodIntro.forEach(line => {
        doc.text(line, 14, yPos);
        yPos += 5;
      });
      yPos += 5;
      
      // Standards box
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(14, yPos, pageWidth - 28, 28, 3, 3, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Padrões de Referência:', 20, yPos + 8);
      doc.setFont('helvetica', 'normal');
      doc.text('• ISO 27001 - Gestão de Segurança da Informação', 20, yPos + 15);
      doc.text('• NIST Cybersecurity Framework', 100, yPos + 15);
      doc.text('• CVE (Common Vulnerabilities and Exposures)', 20, yPos + 22);
      doc.text('• LGPD - Lei Geral de Proteção de Dados', 100, yPos + 22);
      yPos += 35;
      
      // Verification steps
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Verificações Realizadas:', 14, yPos);
      yPos += 6;
      
      const verifications = [
        ['1.', 'Inventário de software instalado em todos os endpoints'],
        ['2.', 'Varredura de vulnerabilidades conhecidas (base CVE/NVD)'],
        ['3.', 'Verificação de status e atualização do antivírus'],
        ['4.', 'Análise de atividade web e domínios acessados'],
        ['5.', 'Monitoramento de tentativas de acesso suspeitas'],
        ['6.', 'Correlação de eventos de segurança'],
      ];
      
      doc.setFont('helvetica', 'normal');
      verifications.forEach(([num, text]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(num, 18, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(text, 25, yPos);
        yPos += 5;
      });
      yPos += 5;
      
      // Limitations box
      doc.setFillColor(254, 249, 195);
      doc.roundedRect(14, yPos, pageWidth - 28, 18, 3, 3, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(113, 63, 18);
      doc.text('Limitações:', 20, yPos + 7);
      doc.setFont('helvetica', 'normal');
      doc.text('Este laudo reflete o estado no momento da geração. Novas vulnerabilidades podem surgir após a emissão.', 20, yPos + 13);
      doc.setTextColor(15, 23, 42);
      yPos += 25;

      // ==================== PAGE 3+: FINDINGS ====================
      doc.addPage();
      yPos = 25;
      
      // Header bar
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`LAUDO DE SEGURANÇA - Nº ${laudoId}`, pageWidth / 2, 10, { align: 'center' });
      
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('3. ACHADOS DE SEGURANÇA', 14, yPos);
      yPos += 12;

      // 3.1 Vulnerabilities
      if (reportData.data?.vulnerabilities && reportData.data.vulnerabilities.length > 0) {
        doc.setFontSize(14);
        doc.text('3.1 Vulnerabilidades Detectadas', 14, yPos);
        yPos += 8;

        const vulnData = reportData.data.vulnerabilities.slice(0, 20).map((v: any) => [
          formatValue(v.severity, 'Desconhecido').toUpperCase(),
          formatValue(v.title || v.check_key, 'Sem título').substring(0, 35),
          formatValue(v.description, 'Sem descrição').substring(0, 50),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Severidade', 'Título', 'Descrição']],
          body: vulnData,
          theme: 'striped',
          headStyles: { fillColor: [220, 38, 38] },
          styles: { fontSize: 8 },
          didParseCell: (data: any) => {
            if (data.column.index === 0 && data.section === 'body') {
              const sev = data.cell.raw?.toString().toLowerCase();
              if (sev === 'critical') data.cell.styles.textColor = [220, 38, 38];
              else if (sev === 'high') data.cell.styles.textColor = [249, 115, 22];
            }
          },
          margin: { left: 14, right: 14 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 12;
      } else {
        doc.setFontSize(14);
        doc.text('3.1 Vulnerabilidades Detectadas', 14, yPos);
        yPos += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(34, 197, 94);
        doc.text('✓ Nenhuma vulnerabilidade detectada', 14, yPos);
        doc.setTextColor(15, 23, 42);
        yPos += 12;
      }

      // 3.2 Unprotected PCs
      if (yPos > pageHeight - 80) { doc.addPage(); yPos = 25; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('3.2 Computadores Desprotegidos', 14, yPos);
      yPos += 8;

      if (unprotected.no_antivirus > 0 || unprotected.outdated_av > 0) {
        const unprotectedData = [
          ['Sem Antivírus', formatValue(unprotected.no_antivirus, '0'), 'Instalar solução antivírus'],
          ['Antivírus Desatualizado', formatValue(unprotected.outdated_av, '0'), 'Atualizar definições de vírus'],
          ['Offline', formatValue(unprotected.offline_agents, '0'), 'Verificar conectividade'],
        ];

        autoTable(doc, {
          startY: yPos,
          head: [['Situação', 'Quantidade', 'Ação Recomendada']],
          body: unprotectedData,
          theme: 'striped',
          headStyles: { fillColor: [249, 115, 22] },
          styles: { fontSize: 9 },
          margin: { left: 14, right: 14 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 12;
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(34, 197, 94);
        doc.text('✓ Todos os computadores estão protegidos', 14, yPos);
        doc.setTextColor(15, 23, 42);
        yPos += 12;
      }

      // 3.3 Antivirus Status
      if (yPos > pageHeight - 80) { doc.addPage(); yPos = 25; }
      if (reportData.data?.antivirus_status && reportData.data.antivirus_status.length > 0) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('3.3 Status do Antivírus', 14, yPos);
        yPos += 8;

        const avData = reportData.data.antivirus_status.slice(0, 15).map((av: any) => [
          formatValue(av.engine_name, 'Desconhecido'),
          formatValue(av.status, 'Desconhecido'),
          formatValue(av.threats_found, '0'),
          av.last_update_at ? formatBrazilDateTime(av.last_update_at, 'date') : 'Não disponível'
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Engine', 'Status', 'Ameaças', 'Última Atualização']],
          body: avData,
          theme: 'striped',
          headStyles: { fillColor: [34, 197, 94] },
          styles: { fontSize: 9 },
          margin: { left: 14, right: 14 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 12;
      }

      // 3.4 Failed Login Attempts
      if (reportData.data?.failed_login_attempts && reportData.data.failed_login_attempts.length > 0) {
        if (yPos > pageHeight - 80) { doc.addPage(); yPos = 25; }
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('3.4 Tentativas de Login Suspeitas', 14, yPos);
        yPos += 8;

        const loginData = reportData.data.failed_login_attempts.slice(0, 15).map((f: any) => [
          formatValue(f.email, 'Não informado'),
          formatValue(f.ip_address, 'Não identificado'),
          formatBrazilDateTime(f.created_at, 'full'),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Email', 'IP', 'Data/Hora']],
          body: loginData,
          theme: 'striped',
          headStyles: { fillColor: [239, 68, 68] },
          styles: { fontSize: 9 },
          margin: { left: 14, right: 14 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 12;
      }

      // ==================== PAGE: RECOMMENDATIONS ====================
      doc.addPage();
      yPos = 25;
      
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`LAUDO DE SEGURANÇA - Nº ${laudoId}`, pageWidth / 2, 10, { align: 'center' });
      
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('4. RECOMENDAÇÕES PRIORIZADAS', 14, yPos);
      yPos += 12;

      if (reportData.recommendations && reportData.recommendations.length > 0) {
        reportData.recommendations.forEach((rec) => {
          if (yPos > pageHeight - 40) { doc.addPage(); yPos = 25; }
          
          // Priority badge
          const priorityColors: Record<number, [number, number, number]> = {
            1: [220, 38, 38],
            2: [249, 115, 22],
            3: [234, 179, 8],
            4: [59, 130, 246],
            5: [107, 114, 128],
            6: [107, 114, 128],
            7: [107, 114, 128],
          };
          const color = priorityColors[rec.priority] || [107, 114, 128];
          
          doc.setFillColor(color[0], color[1], color[2]);
          doc.circle(20, yPos + 2, 4, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(8);
          doc.text(String(rec.priority), 20, yPos + 4, { align: 'center' });
          
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(`[${formatValue(rec.category, 'Geral')}] ${formatValue(rec.title, 'Recomendação')}`, 28, yPos + 2);
          
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text(formatValue(rec.description, 'Sem descrição detalhada'), 28, yPos + 10);
          yPos += 20;
        });
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(34, 197, 94);
        doc.text('✓ Nenhuma recomendação prioritária no momento', 14, yPos);
        yPos += 12;
      }

      // ==================== SECTION 5: CONCLUSION ====================
      if (yPos > pageHeight - 100) { doc.addPage(); yPos = 25; }
      
      yPos += 10;
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('5. CONCLUSÃO', 14, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const conclusionLines = [
        `Este laudo analisou ${formatValue(stats.total_agents, '0')} computador(es) protegido(s) pelo CyberShield.`,
        ``,
        `O ambiente apresenta nível de risco ${formatValue(riskClass.level, 'Pendente')} com score ${riskScore}/100.`,
        ``,
        reportData.recommendations && reportData.recommendations.length > 0 
          ? `Foram identificadas ${reportData.recommendations.length} recomendação(ões) prioritária(s) que devem ser`
          : 'Não foram identificadas recomendações críticas neste momento.',
        reportData.recommendations && reportData.recommendations.length > 0 
          ? 'tratadas para melhorar a postura de segurança do ambiente.'
          : '',
        ``,
        `Este laudo é válido por 30 dias a partir da data de emissão.`,
        `Recomenda-se a execução de novo laudo após este período para acompanhamento.`,
      ];
      
      conclusionLines.forEach(line => {
        if (line) {
          doc.text(line, 14, yPos);
          yPos += 5;
        }
      });

      // ==================== CERTIFICATION SEAL & QR CODE ====================
      yPos += 15;
      
      // Certification box
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(14, yPos, pageWidth - 28, 55, 5, 5, 'F');
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.5);
      doc.roundedRect(14, yPos, pageWidth - 28, 55, 5, 5, 'S');
      
      // Seal icon area
      doc.setFillColor(37, 99, 235);
      doc.circle(35, yPos + 27, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('✓', 35, 31 + yPos, { align: 'center' });
      
      // Certification text
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('CERTIFICADO DE SEGURANÇA', 55, yPos + 15);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Laudo Nº: ${laudoId}`, 55, yPos + 25);
      doc.text(`Emitido em: ${dateStrFull}`, 55, yPos + 33);
      doc.text(`Válido até: ${validUntilStr}`, 55, yPos + 41);
      
      // QR Code
      try {
        doc.addImage(qrCodeDataUrl, 'PNG', pageWidth - 55, yPos + 5, 35, 35);
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text('Verifique online', pageWidth - 37.5, yPos + 45, { align: 'center' });
      } catch (qrError) {
        console.warn('Failed to add QR code:', qrError);
      }

      // Add page numbers to all pages
      const totalPages = doc.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Página ${i} de ${totalPages} | CyberShield Security Platform | Documento confidencial`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        );
      }

      // Save
      const agentName = selectedAgent === 'all' ? 'todos' : agents?.find(a => a.id === selectedAgent)?.agent_name || selectedAgent;
      doc.save(`laudo-seguranca-${agentName}-${new Date().toISOString().split('T')[0]}.pdf`);
      
      toast.success("Laudo de Segurança gerado com sucesso!");
    } catch (error) {
      console.error("Error exporting Laudo:", error);
      toast.error("Erro ao gerar laudo: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportCSV = async () => {
    setIsGenerating(true);
    try {
      const params = new URLSearchParams({ format: "json" });
      if (selectedAgent !== "all") {
        params.append("agent_id", selectedAgent);
      }

      const { data, error } = await supabase.functions.invoke(
        `generate-security-report?${params.toString()}`,
        { method: "GET" }
      );

      if (error) throw error;

      const reportData = data as SecurityReport;
      
      let csvContent = "";
      
      csvContent += "RELATÓRIO DE SEGURANÇA CYBERSHIELD\n";
      csvContent += `Data de Geração:,${formatBrazilDateTime(reportData.generated_at, 'full')}\n`;
      csvContent += `Filtro:,${reportData.agent_filter === "all" ? "Todos os Agentes" : reportData.agent_filter}\n\n`;
      
      csvContent += "ESTATÍSTICAS GERAIS\n";
      csvContent += `Agentes Ativos:,${reportData.statistics.total_agents}\n`;
      csvContent += `Software Inventariado:,${reportData.statistics.total_software}\n`;
      csvContent += `Vulnerabilidades Total:,${reportData.statistics.total_vulnerabilities}\n`;
      csvContent += `Vulnerabilidades Críticas:,${reportData.statistics.critical_vulnerabilities}\n`;
      csvContent += `Vulnerabilidades Altas:,${reportData.statistics.high_vulnerabilities}\n`;
      csvContent += `Engines Antivírus:,${reportData.statistics.antivirus_engines}\n`;
      csvContent += `Ameaças Detectadas:,${reportData.statistics.threats_found}\n`;
      csvContent += `Domínios Únicos:,${reportData.statistics.unique_domains}\n`;
      csvContent += `Scans Maliciosos:,${reportData.statistics.malicious_scans}/${reportData.statistics.total_scans}\n`;
      csvContent += `Eventos de Segurança:,${reportData.statistics.security_events}\n\n`;

      if (reportData.data?.software_inventory && reportData.data.software_inventory.length > 0) {
        csvContent += "INVENTÁRIO DE SOFTWARE\n";
        csvContent += "Nome,Versão,Fornecedor,Nível de Risco,Última Atualização\n";
        reportData.data.software_inventory.forEach((sw: any) => {
          csvContent += `"${sw.name || ''}","${sw.version || ''}","${sw.vendor || ''}","${sw.risk_level || ''}","${sw.last_seen_at || ''}"\n`;
        });
        csvContent += "\n";
      }

      if (reportData.data?.vulnerabilities && reportData.data.vulnerabilities.length > 0) {
        csvContent += "VULNERABILIDADES\n";
        csvContent += "Severidade,Título,Descrição,Remediação\n";
        reportData.data.vulnerabilities.forEach((vuln: any) => {
          csvContent += `"${vuln.severity || ''}","${vuln.title || vuln.check_key || ''}","${(vuln.description || '').replace(/"/g, '""')}","${(vuln.remediation || '').replace(/"/g, '""')}"\n`;
        });
        csvContent += "\n";
      }

      if (reportData.data?.antivirus_status && reportData.data.antivirus_status.length > 0) {
        csvContent += "STATUS DO ANTIVÍRUS\n";
        csvContent += "Engine,Versão,Status,Última Atualização,Ameaças Encontradas\n";
        reportData.data.antivirus_status.forEach((av: any) => {
          csvContent += `"${av.engine_name || ''}","${av.engine_version || ''}","${av.status || ''}","${av.last_update_at || ''}","${av.threats_found || 0}"\n`;
        });
        csvContent += "\n";
      }

      if (reportData.data?.web_activity && reportData.data.web_activity.length > 0) {
        csvContent += "ATIVIDADE WEB (Últimos 50)\n";
        csvContent += "Domínio,URL,Visitado Em,Fonte\n";
        reportData.data.web_activity.slice(0, 50).forEach((web: any) => {
          csvContent += `"${web.domain || ''}","${web.url || ''}","${web.visited_at || ''}","${web.source || ''}"\n`;
        });
        csvContent += "\n";
      }

      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-seguranca-${selectedAgent}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success("Relatório CSV baixado com sucesso!");
    } catch (error) {
      console.error("Error exporting CSV:", error);
      toast.error("Erro ao exportar CSV: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Relatórios de Segurança
            </h2>
            <p className="text-sm text-muted-foreground">
              Gere relatórios consolidados de todos os dados de segurança coletados
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="generate" className="space-y-4">
        <TabsList>
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Gerar Relatório
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Laudos Gerados
          </TabsTrigger>
          <TabsTrigger value="security-audit" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compliance" className="space-y-4">
          <ComplianceReportGenerator />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <GeneratedReportsList />
        </TabsContent>

        <TabsContent value="security-audit" className="space-y-4">
          <SecurityAuditReport />
        </TabsContent>

        <TabsContent value="generate" className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Gerar Relatório</CardTitle>
          <CardDescription>
            Selecione um agente específico ou gere relatório de todos os agentes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Agente</label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Agentes</SelectItem>
                  {agents?.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.agent_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => handleGenerateReport(false)}
              disabled={isGenerating || isLoadingReport}
            >
              {(isGenerating || isLoadingReport) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <FileText className="mr-2 h-4 w-4" />
              Gerar Sumário
            </Button>
            <Button
              variant="default"
              onClick={handleExportLaudo}
              disabled={isGenerating}
              className="bg-primary hover:bg-primary/90"
            >
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Award className="mr-2 h-4 w-4" />
              Exportar Laudo
            </Button>
            <Button
              variant="default"
              onClick={handleExportPDF}
              disabled={isGenerating}
              className="bg-red-600 hover:bg-red-700"
            >
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <FileText className="mr-2 h-4 w-4" />
              Exportar PDF
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={isGenerating}
            >
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleGenerateReport(true)}
              disabled={isGenerating}
            >
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Download className="mr-2 h-4 w-4" />
              JSON Completo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Summary */}
      {report && (
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
                Filtro: {report.agent_filter === "all" ? "Todos os Agentes" : `Agente ${report.agent_filter}`}
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
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
