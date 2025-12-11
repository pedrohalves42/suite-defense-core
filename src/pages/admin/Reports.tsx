import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Loader2, Shield, AlertTriangle, Bug, Globe, FileWarning, FileSpreadsheet, Award } from "lucide-react";
import { toast } from "sonner";

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

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, agent_name, status")
        .eq("status", "active")
        .order("agent_name");

      if (error) throw error;
      return data as Agent[];
    },
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
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Erro ao gerar relatório: " + (error instanceof Error ? error.message : "Unknown error"));
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
      
      // Dynamic import of jsPDF with error handling
      let jsPDFClass: any;
      let autoTable: any;
      try {
        const jsPDFModule = await import('jspdf');
        jsPDFClass = jsPDFModule.jsPDF;
        const autoTableModule = await import('jspdf-autotable');
        autoTable = autoTableModule.default;
      } catch (importError) {
        console.error("Failed to import jsPDF:", importError);
        throw new Error("Erro ao carregar biblioteca de PDF. Tente recarregar a página.");
      }
      
      const doc = new jsPDFClass();
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
      const dateStr = new Date(reportData.generated_at).toLocaleString('pt-BR');
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
          new Date(web.visited_at).toLocaleDateString('pt-BR')
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

  // NEW: Export professional "Laudo de Segurança" PDF
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
      
      // Dynamic imports
      const jsPDFModule = await import('jspdf');
      const jsPDFClass = jsPDFModule.jsPDF;
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default;
      
      const doc = new jsPDFClass();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 0;

      // ==================== PAGE 1: COVER ====================
      // Full dark background
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      // Logo area
      doc.setFillColor(37, 99, 235);
      doc.circle(pageWidth / 2, 60, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('🛡️', pageWidth / 2, 67, { align: 'center' });
      
      // Title
      doc.setFontSize(36);
      doc.text('LAUDO DE SEGURANÇA', pageWidth / 2, 110, { align: 'center' });
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'normal');
      doc.text('Análise Completa de Vulnerabilidades e Riscos', pageWidth / 2, 125, { align: 'center' });
      
      // Risk Score Circle
      const riskScore = reportData.risk_score || 0;
      const riskClass = reportData.risk_classification || { level: 'N/A', color: 'gray', description: '' };
      
      // Risk circle color
      if (riskClass.color === 'green') doc.setFillColor(34, 197, 94);
      else if (riskClass.color === 'yellow') doc.setFillColor(234, 179, 8);
      else if (riskClass.color === 'orange') doc.setFillColor(249, 115, 22);
      else doc.setFillColor(239, 68, 68);
      
      doc.circle(pageWidth / 2, 170, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(32);
      doc.setFont('helvetica', 'bold');
      doc.text(String(riskScore), pageWidth / 2, 175, { align: 'center' });
      doc.setFontSize(10);
      doc.text('SCORE', pageWidth / 2, 185, { align: 'center' });
      
      // Risk level badge
      doc.setFontSize(14);
      doc.text(`NÍVEL DE RISCO: ${riskClass.level}`, pageWidth / 2, 220, { align: 'center' });
      
      // Metadata
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      const dateStr = new Date(reportData.generated_at).toLocaleDateString('pt-BR', { 
        day: '2-digit', month: 'long', year: 'numeric' 
      });
      doc.text(`Data: ${dateStr}`, pageWidth / 2, 250, { align: 'center' });
      
      const filterText = reportData.agent_filter === 'all' 
        ? 'Todos os Computadores' 
        : `Computador: ${agents?.find(a => a.id === reportData.agent_filter)?.agent_name || reportData.agent_filter}`;
      doc.text(`Escopo: ${filterText}`, pageWidth / 2, 260, { align: 'center' });
      
      // Footer on cover
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text('CyberShield Security Platform', pageWidth / 2, pageHeight - 20, { align: 'center' });
      doc.text('www.cybershield.com.br', pageWidth / 2, pageHeight - 12, { align: 'center' });

      // ==================== PAGE 2: EXECUTIVE SUMMARY ====================
      doc.addPage();
      yPos = 20;
      
      // Header bar
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text('LAUDO DE SEGURANÇA - CYBERSHIELD', pageWidth / 2, 10, { align: 'center' });
      
      // Section title
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('1. SUMÁRIO EXECUTIVO', 14, yPos + 10);
      yPos += 20;
      
      // Risk classification box
      doc.setFillColor(riskClass.color === 'green' ? 220 : riskClass.color === 'yellow' ? 254 : riskClass.color === 'orange' ? 255 : 254, 
                       riskClass.color === 'green' ? 252 : riskClass.color === 'yellow' ? 249 : riskClass.color === 'orange' ? 237 : 226, 
                       riskClass.color === 'green' ? 231 : riskClass.color === 'yellow' ? 195 : riskClass.color === 'orange' ? 213 : 226);
      doc.rect(14, yPos, pageWidth - 28, 25, 'F');
      
      doc.setTextColor(riskClass.color === 'green' ? 22 : riskClass.color === 'yellow' ? 113 : riskClass.color === 'orange' ? 154 : 153, 
                       riskClass.color === 'green' ? 101 : riskClass.color === 'yellow' ? 63 : riskClass.color === 'orange' ? 52 : 27, 
                       riskClass.color === 'green' ? 52 : riskClass.color === 'yellow' ? 18 : riskClass.color === 'orange' ? 18 : 27);
      doc.setFontSize(14);
      doc.text(`Classificação: ${riskClass.level} (Score: ${riskScore}/100)`, 20, yPos + 10);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(riskClass.description, 20, yPos + 18);
      yPos += 35;
      
      // Key metrics
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Principais Indicadores:', 14, yPos);
      yPos += 8;
      
      const stats = reportData.statistics;
      const unprotected = reportData.unprotected_pcs || { no_antivirus: 0, outdated_av: 0, offline_agents: 0 };
      
      const keyMetrics = [
        ['Computadores Monitorados', String(stats.total_agents)],
        ['Computadores Desprotegidos', String(unprotected.no_antivirus)],
        ['Antivírus Desatualizado', String(unprotected.outdated_av)],
        ['Computadores Offline', String(unprotected.offline_agents)],
        ['Vulnerabilidades Críticas', String(stats.critical_vulnerabilities)],
        ['Vulnerabilidades Altas', String(stats.high_vulnerabilities)],
        ['Ameaças Detectadas', String(stats.threats_found)],
        ['Tentativas Login Suspeitas (24h)', String(stats.failed_login_attempts_24h || 0)],
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

      // ==================== METHODOLOGY ====================
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('2. METODOLOGIA', 14, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const methodText = [
        'Este laudo foi gerado automaticamente pelo CyberShield Security Platform através de:',
        '',
        '• Coleta contínua de dados de agentes instalados nos endpoints',
        '• Inventário automatizado de software instalado',
        '• Varredura de vulnerabilidades conhecidas (CVE)',
        '• Monitoramento de status de antivírus e definições',
        '• Análise de atividade web e tentativas de acesso',
        '• Correlação de eventos de segurança',
      ];
      
      methodText.forEach(line => {
        doc.text(line, 14, yPos);
        yPos += 5;
      });
      yPos += 10;

      // ==================== PAGE 3+: FINDINGS ====================
      doc.addPage();
      yPos = 25;
      
      // Vulnerabilities section
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text('LAUDO DE SEGURANÇA - CYBERSHIELD', pageWidth / 2, 10, { align: 'center' });
      
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
          (v.severity || '-').toUpperCase(),
          (v.title || v.check_key || '-').substring(0, 35),
          (v.description || '-').substring(0, 50),
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
          ['Sem Antivírus', String(unprotected.no_antivirus), 'Instalar solução antivírus'],
          ['Antivírus Desatualizado', String(unprotected.outdated_av), 'Atualizar definições de vírus'],
          ['Offline', String(unprotected.offline_agents), 'Verificar conectividade'],
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
          av.engine_name || '-',
          av.status || '-',
          av.threats_found || '0',
          av.last_update_at ? new Date(av.last_update_at).toLocaleDateString('pt-BR') : '-'
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
          f.email || '-',
          f.ip_address || '-',
          new Date(f.created_at).toLocaleString('pt-BR'),
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
      doc.text('LAUDO DE SEGURANÇA - CYBERSHIELD', pageWidth / 2, 10, { align: 'center' });
      
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('4. RECOMENDAÇÕES PRIORIZADAS', 14, yPos);
      yPos += 12;

      if (reportData.recommendations && reportData.recommendations.length > 0) {
        reportData.recommendations.forEach((rec, idx) => {
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
          doc.text(`[${rec.category}] ${rec.title}`, 28, yPos + 2);
          
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text(rec.description, 28, yPos + 10);
          yPos += 20;
        });
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(34, 197, 94);
        doc.text('✓ Nenhuma recomendação prioritária no momento', 14, yPos);
        yPos += 12;
      }

      // ==================== CONCLUSION ====================
      yPos += 10;
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('5. CONCLUSÃO', 14, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const conclusionLines = [
        `Este laudo analisou ${stats.total_agents} computador(es) protegido(s) pelo CyberShield.`,
        ``,
        `O ambiente apresenta nível de risco ${riskClass.level} com score ${riskScore}/100.`,
        ``,
        reportData.recommendations && reportData.recommendations.length > 0 
          ? `Foram identificadas ${reportData.recommendations.length} recomendação(ões) prioritária(s) que devem ser`
          : 'Não foram identificadas recomendações críticas neste momento.',
        reportData.recommendations && reportData.recommendations.length > 0 
          ? 'tratadas para melhorar a postura de segurança do ambiente.'
          : '',
        ``,
        `Recomenda-se a execução de novo laudo em 30 dias para acompanhamento.`,
      ];
      
      conclusionLines.forEach(line => {
        if (line) {
          doc.text(line, 14, yPos);
          yPos += 5;
        }
      });

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
      csvContent += `Data de Geração:,${new Date(reportData.generated_at).toLocaleString("pt-BR")}\n`;
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            Relatórios de Segurança
          </h1>
          <p className="text-muted-foreground mt-2">
            Gere relatórios consolidados de todos os dados de segurança coletados
          </p>
        </div>
      </div>

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
                  {new Date(report.generated_at).toLocaleString("pt-BR")}
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
                <CardTitle className="text-sm font-medium">Agentes Ativos</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.statistics.total_agents}</div>
                <p className="text-xs text-muted-foreground">Monitorados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Software Inventariado</CardTitle>
                <FileWarning className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.statistics.total_software}</div>
                <p className="text-xs text-muted-foreground">Aplicações instaladas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vulnerabilidades</CardTitle>
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
    </div>
  );
}
