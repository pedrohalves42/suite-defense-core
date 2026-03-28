/**
 * BLOCO 2: Compliance Evidence Bundle - Enterprise-Grade UI
 * 
 * Gerador de relatórios de compliance com:
 * - SHA256 (integridade) e HMAC (autoria) calculados no backend
 * - Templates LGPD, ISO 27001, SOC2-lite
 * - HashBadge para verificação externa
 * - PDF jurídico com validade criptográfica
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, Download, Loader2, Shield, CheckCircle2, XCircle, 
  Lock, Scale, AlertTriangle, Eye, RefreshCw, FileCheck, Building2,
  Calendar, User, Clock, Monitor, Bug, Ban, Wifi
} from "lucide-react";
import { toast } from "sonner";
import { formatBrazilDateTime } from "@/lib/date-utils";
// jsPDF and autoTable imported dynamically to avoid test/build issues
import { HashBadge } from "@/components/ui/hash-badge";
import { RiskGauge } from "@/components/ui/risk-gauge";
import { ComplianceBadge } from "@/components/ui/compliance-badge";
import { StatHighlight } from "@/components/ui/stat-highlight";
import type { 
  ComplianceTemplate, 
  ComplianceReportPayload,
  SecurityInvariantStatus 
} from "@/types/compliance-report";
import { TEMPLATE_DEFINITIONS, SECURITY_INVARIANTS_DEFINITIONS } from "@/types/compliance-report";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { logger } from '@/lib/logger';

const TEMPLATE_ICONS: Record<ComplianceTemplate, typeof Shield> = {
  LGPD: Scale,
  ISO_27001: Shield,
  SOC2_LITE: Lock,
};

const TEMPLATE_COLORS: Record<ComplianceTemplate, string> = {
  LGPD: "text-blue-600",
  ISO_27001: "text-green-600",
  SOC2_LITE: "text-purple-600",
};

export function ComplianceReportGenerator() {
  const [selectedTemplate, setSelectedTemplate] = useState<ComplianceTemplate>("LGPD");
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportPayload, setReportPayload] = useState<ComplianceReportPayload | null>(null);
  const { activeTenant } = useActiveTenant();

  // Fetch compliance report from backend - using generate-compliance-report directly
  const fetchComplianceReport = async (template: ComplianceTemplate) => {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) {
      throw new Error("Não autenticado");
    }

    // Calculate period (last 30 days)
    const periodEnd = new Date().toISOString();
    const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase.functions.invoke("generate-compliance-report", {
      body: {
        template,
        period_start: periodStart,
        period_end: periodEnd,
      },
    });

    if (error) {
      logger.error("Edge function error:", error);
      throw new Error(error.message || "Erro ao gerar relatório");
    }

    if (!data?.success || !data?.payload) {
      throw new Error(data?.error || "Payload inválido");
    }

    return data.payload as ComplianceReportPayload;
  };

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      const payload = await fetchComplianceReport(selectedTemplate);
      setReportPayload(payload);
      toast.success(`Relatório ${selectedTemplate} gerado com sucesso!`);
    } catch (error) {
      logger.error("Error generating compliance report:", error);
      const errorMessage = (error as Error)?.message || "Erro desconhecido";
      
      if (errorMessage.includes('NO_TENANT') || errorMessage.includes('não está associado') || errorMessage.includes('User not associated')) {
        toast.error("Você não está associado a nenhum tenant. Contate o administrador.");
      } else if (errorMessage.includes('Edge Function') || errorMessage.includes('Failed to fetch')) {
        toast.error("Erro ao conectar com o servidor. Tente novamente.");
      } else if (errorMessage.includes('Não autenticado')) {
        toast.error("Sessão expirada. Faça login novamente.");
      } else {
        toast.error(`Erro ao gerar relatório: ${errorMessage}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    if (!reportPayload) {
      toast.error("Gere o relatório primeiro");
      return;
    }

    setIsGenerating(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 0;

      // Helper function for risk color
      const getRiskColors = (level: string): [number, number, number] => {
        switch (level) {
          case "BAIXO": return [22, 163, 74];
          case "MÉDIO": return [202, 138, 4];
          case "ALTO": return [234, 88, 12];
          case "CRÍTICO": return [220, 38, 38];
          default: return [107, 114, 128];
        }
      };

      // ==================== PAGE 1: COVER ====================
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, pageHeight, "F");

      // Logo
      const { loadLogoForPDF, addLogoToPDF } = await import('@/lib/pdfLogoHelper');
      const logoDataUrl = await loadLogoForPDF();
      addLogoToPDF(doc, logoDataUrl, pageWidth / 2, 20, 36);

      // Title
      doc.setFontSize(24);
      doc.text("RELATÓRIO DE COMPLIANCE", pageWidth / 2, 72, { align: "center" });

      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.text(reportPayload.template_name, pageWidth / 2, 84, { align: "center" });

      doc.setFontSize(10);
      doc.text(reportPayload.template_description, pageWidth / 2, 94, { align: "center" });

      // Audit Info Box
      doc.setFillColor(30, 41, 59);
      doc.roundedRect(20, 108, pageWidth - 40, 40, 4, 4, "F");

      doc.setFontSize(9);
      doc.text(`ID de Auditoria: ${reportPayload.audit_id}`, 30, 120);
      doc.text(`Emitido em: ${formatBrazilDateTime(reportPayload.generated_at, "full")} (UTC-3)`, 30, 130);
      doc.text(`Válido até: ${formatBrazilDateTime(reportPayload.valid_until, "full")} (UTC-3)`, 30, 140);

      // Risk Score with visual indicator
      const riskColor = getRiskColors(reportPayload.risk_level);
      doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
      doc.roundedRect(20, 155, pageWidth - 40, 30, 4, 4, "F");
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`NÍVEL DE RISCO: ${reportPayload.risk_level}`, pageWidth / 2, 167, { align: "center" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Score: ${reportPayload.risk_score}/100 - ${reportPayload.risk_description}`, pageWidth / 2, 178, { align: "center" });

      // SHA256 and HMAC
      doc.setFillColor(22, 101, 52);
      doc.roundedRect(20, 192, pageWidth - 40, 18, 4, 4, "F");
      doc.setFontSize(7);
      doc.text("SHA256 (Integridade): " + reportPayload.sha256, 25, 203);

      doc.setFillColor(30, 64, 175);
      doc.roundedRect(20, 214, pageWidth - 40, 18, 4, 4, "F");
      doc.text("HMAC-SHA256 (Assinatura): " + reportPayload.hmac_signature, 25, 225);

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("CyberShield Security Platform - Laudo com Validade Jurídica", pageWidth / 2, pageHeight - 15, { align: "center" });

      // ==================== PAGE 2: EXECUTIVE SUMMARY (NEW) ====================
      doc.addPage();
      yPos = 20;

      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 14, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text(`${reportPayload.audit_id} | ${reportPayload.template_name}`, pageWidth / 2, 9, { align: "center" });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("RESUMO EXECUTIVO", 14, yPos + 8);
      yPos += 18;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Este documento apresenta uma análise de segurança da sua infraestrutura de TI.", 14, yPos);
      yPos += 8;
      doc.text("Abaixo, explicamos em linguagem simples o que foi verificado e o resultado.", 14, yPos);
      yPos += 15;

      // What this report means box
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(14, yPos, pageWidth - 28, 55, 4, 4, "F");
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("O QUE ESTE RELATÓRIO SIGNIFICA?", 20, yPos + 10);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      const passedInvariants = reportPayload.invariants.filter(i => i.status === "PASS").length;
      const totalInvariants = reportPayload.invariants.length;
      const criticalVulns = reportPayload.statistics?.critical_vulnerabilities || 0;
      const highVulns = reportPayload.statistics?.high_vulnerabilities || 0;
      
      let summaryText = "";
      if (reportPayload.risk_level === "BAIXO") {
        summaryText = "Sua empresa está em boa situação de segurança. Os sistemas estão protegidos e funcionando corretamente.";
      } else if (reportPayload.risk_level === "MÉDIO") {
        summaryText = "Sua empresa possui alguns pontos de atenção que merecem acompanhamento, mas não há riscos críticos imediatos.";
      } else {
        summaryText = "Foram identificados pontos que precisam de atenção imediata. Recomendamos revisar as recomendações abaixo.";
      }
      
      doc.text(summaryText, 20, yPos + 22, { maxWidth: pageWidth - 48 });
      doc.text(`Verificamos ${totalInvariants} controles de segurança, e ${passedInvariants} estão em conformidade.`, 20, yPos + 38);
      doc.text(`Foram encontradas ${criticalVulns} vulnerabilidades críticas e ${highVulns} altas.`, 20, yPos + 48);
      
      yPos += 65;

      // Key highlights
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("PRINCIPAIS DESTAQUES", 14, yPos);
      yPos += 10;

      const highlights = [
        { icon: "✓", text: `${reportPayload.statistics?.total_agents || 0} computadores monitorados`, color: [22, 163, 74] },
        { icon: criticalVulns > 0 ? "⚠" : "✓", text: criticalVulns > 0 ? `${criticalVulns} vulnerabilidades críticas encontradas` : "Nenhuma vulnerabilidade crítica", color: criticalVulns > 0 ? [220, 38, 38] : [22, 163, 74] },
        { icon: "✓", text: `${reportPayload.active_policies.length} políticas de segurança ativas`, color: [37, 99, 235] },
        { icon: "✓", text: `${passedInvariants}/${totalInvariants} controles de segurança conformes`, color: passedInvariants === totalInvariants ? [22, 163, 74] : [202, 138, 4] },
      ];

      highlights.forEach((h) => {
        doc.setFillColor(h.color[0], h.color[1], h.color[2]);
        doc.circle(20, yPos + 2, 3, "F");
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(h.text, 28, yPos + 4);
        yPos += 10;
      });

      yPos += 10;

      // Recommendations
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("RECOMENDAÇÕES", 14, yPos);
      yPos += 10;

      const recommendations: string[] = [];
      if (criticalVulns > 0) recommendations.push("Corrigir vulnerabilidades críticas com urgência");
      if (highVulns > 0) recommendations.push("Revisar e corrigir vulnerabilidades de alta severidade");
      if (reportPayload.invariants.some(i => i.status === "FAIL")) recommendations.push("Verificar controles de segurança não conformes");
      if ((reportPayload.statistics?.threats_found || 0) > 0) recommendations.push("Investigar ameaças detectadas pelo antivírus");
      if (recommendations.length === 0) recommendations.push("Manter as boas práticas de segurança atuais");

      recommendations.forEach((r, idx) => {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(`${idx + 1}. ${r}`, 20, yPos);
        yPos += 8;
      });

      // ==================== PAGE 3: INVARIANTS ====================
      doc.addPage();
      yPos = 25;

      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 14, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text(`${reportPayload.audit_id} | ${reportPayload.template_name}`, pageWidth / 2, 9, { align: "center" });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("1. CONTROLES DE SEGURANÇA VERIFICADOS", 14, yPos);
      yPos += 12;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Os controles abaixo garantem que sua empresa segue as melhores práticas de segurança.", 14, yPos);
      yPos += 10;

      // Layman-friendly invariant descriptions
      const laymanDescriptions: Record<string, string> = {
        "INV-001": "Seus dados estão protegidos e só podem ser acessados por pessoas autorizadas.",
        "INV-002": "Os computadores usam assinatura digital para garantir comunicação segura.",
        "INV-003": "Os dados da sua empresa estão separados dos dados de outras empresas.",
        "INV-004": "Senhas e credenciais não aparecem em relatórios ou logs do sistema.",
        "INV-005": "O sistema bloqueia automaticamente em caso de problemas de segurança.",
        "INV-006": "Sites perigosos ou inadequados estão sendo bloqueados.",
      };

      const invariantData = reportPayload.invariants.map((inv) => [
        inv.status === "PASS" ? "✓" : inv.status === "FAIL" ? "✗" : "?",
        inv.name,
        laymanDescriptions[inv.id] || inv.description,
        inv.status === "PASS" ? "Conforme" : inv.status === "FAIL" ? "Não Conforme" : "Pendente",
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [["", "Controle", "O que significa", "Status"]],
        body: invariantData,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 
          0: { cellWidth: 10, halign: "center" }, 
          1: { cellWidth: 35 }, 
          2: { cellWidth: 95 },
          3: { cellWidth: 25, halign: "center" } 
        },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.column.index === 0 && data.section === "body") {
            const text = data.cell.text[0];
            if (text === "✓") data.cell.styles.textColor = [22, 101, 52];
            else if (text === "✗") data.cell.styles.textColor = [220, 38, 38];
            else data.cell.styles.textColor = [202, 138, 4];
          }
          if (data.column.index === 3 && data.section === "body") {
            const text = data.cell.text[0];
            if (text === "Conforme") data.cell.styles.textColor = [22, 101, 52];
            else if (text === "Não Conforme") data.cell.styles.textColor = [220, 38, 38];
            else data.cell.styles.textColor = [202, 138, 4];
          }
        },
      });

      yPos = doc.lastAutoTable.finalY + 15;

      // ==================== SECTION 2: STATISTICS ====================
      if (yPos > pageHeight - 70) { doc.addPage(); yPos = 25; }

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("2. NÚMEROS DO PERÍODO", 14, yPos);
      yPos += 12;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Resumo das métricas de segurança coletadas durante o período de análise.", 14, yPos);
      yPos += 10;

      const statsData = [
        ["Computadores Monitorados", `${reportPayload.statistics?.total_agents || 0}`, "Quantidade de máquinas com agente instalado"],
        ["Vulnerabilidades Críticas", `${reportPayload.statistics?.critical_vulnerabilities || 0}`, "Problemas graves que precisam de atenção imediata"],
        ["Vulnerabilidades Altas", `${reportPayload.statistics?.high_vulnerabilities || 0}`, "Problemas importantes que devem ser corrigidos"],
        ["Ameaças Detectadas", `${reportPayload.statistics?.threats_found || 0}`, "Vírus ou malware encontrados pelo antivírus"],
        ["Eventos de Segurança", `${reportPayload.statistics?.security_events || 0}`, "Ocorrências registradas pelo sistema"],
        ["Registros de Auditoria", `${reportPayload.statistics?.audit_logs || 0}`, "Ações registradas para fins de compliance"],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [["Métrica", "Valor", "O que significa"]],
        body: statsData,
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
        columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 25, halign: "center" }, 2: { cellWidth: 90 } },
      });

      yPos = doc.lastAutoTable.finalY + 15;

      // ==================== SECTION 3: POLICIES ====================
      if (yPos > pageHeight - 60) { doc.addPage(); yPos = 25; }

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("3. POLÍTICAS DE PROTEÇÃO ATIVAS", 14, yPos);
      yPos += 12;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Regras configuradas para proteger os usuários contra sites perigosos ou inadequados.", 14, yPos);
      yPos += 10;

      if (reportPayload.active_policies.length > 0) {
        const policyData = reportPayload.active_policies.map((p) => [
          p.domain_pattern,
          p.reason || "Política de segurança",
          p.is_active ? "Ativo" : "Inativo",
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [["Site/Padrão Bloqueado", "Motivo", "Status"]],
          body: policyData,
          theme: "striped",
          headStyles: { fillColor: [234, 88, 12], fontSize: 8 },
          styles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        });

        yPos = doc.lastAutoTable.finalY + 15;
      } else {
        doc.text("Nenhuma política de bloqueio configurada.", 14, yPos);
        yPos += 15;
      }

      // ==================== SECTION 4: TEMPLATE SECTIONS ====================
      if (yPos > pageHeight - 50) { doc.addPage(); yPos = 25; }

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`4. SEÇÕES ${reportPayload.template_name.toUpperCase()}`, 14, yPos);
      yPos += 12;

      for (const section of reportPayload.sections) {
        if (yPos > pageHeight - 30) { doc.addPage(); yPos = 25; }

        doc.setFillColor(241, 245, 249);
        doc.roundedRect(14, yPos, pageWidth - 28, 20, 2, 2, "F");

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(section.title, 18, yPos + 8);

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(`${section.description} | ${section.record_count} registros analisados`, 18, yPos + 16);

        yPos += 25;
      }

      // ==================== PAGE: GLOSSARY (NEW) ====================
      doc.addPage();
      yPos = 25;

      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 14, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text(`${reportPayload.audit_id} | Glossário`, pageWidth / 2, 9, { align: "center" });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("GLOSSÁRIO DE TERMOS", 14, yPos);
      yPos += 12;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Explicação dos termos técnicos utilizados neste relatório.", 14, yPos);
      yPos += 15;

      const glossaryTerms = [
        ["SHA256", "Código único gerado a partir do documento. Se o documento for alterado, este código muda. Serve para verificar que o relatório não foi modificado."],
        ["HMAC", "Assinatura digital que comprova a origem do documento. Garante que o relatório foi gerado pelo sistema CyberShield."],
        ["RLS (Row Level Security)", "Tecnologia que garante que cada empresa só veja seus próprios dados, mesmo que compartilhem o mesmo banco de dados."],
        ["Vulnerabilidade", "Falha de segurança que pode ser explorada por atacantes. Vulnerabilidades críticas são as mais graves."],
        ["Malware/Vírus", "Programa malicioso que pode danificar seu computador ou roubar informações."],
        ["Agente", "Programa instalado nos computadores que coleta informações de segurança e aplica políticas de proteção."],
        ["Compliance", "Conformidade com normas e regulamentos de segurança da informação."],
        ["LGPD", "Lei Geral de Proteção de Dados - Lei brasileira que regulamenta o tratamento de dados pessoais."],
        ["ISO 27001", "Norma internacional para gestão de segurança da informação."],
        ["SOC2", "Padrão de segurança para empresas de tecnologia que processam dados de clientes."],
        ["Tenant", "Organização ou empresa dentro do sistema. Cada tenant tem seus dados isolados."],
        ["Auditoria", "Processo de verificação e registro de atividades para fins de compliance e segurança."],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [["Termo", "Explicação"]],
        body: glossaryTerms,
        theme: "striped",
        headStyles: { fillColor: [107, 114, 128], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 4 },
        margin: { left: 14, right: 14 },
        columnStyles: { 0: { cellWidth: 40, fontStyle: "bold" }, 1: { cellWidth: 130 } },
      });

      // ==================== FINAL PAGE: CERTIFICATION ====================
      doc.addPage();
      yPos = 40;

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, pageHeight, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("CERTIFICADO DE CONFORMIDADE", pageWidth / 2, yPos, { align: "center" });

      yPos += 25;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`Este documento certifica que a organização "${reportPayload.tenant_name}"`, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      doc.text(`foi avaliada conforme os critérios do template ${reportPayload.template_name}.`, pageWidth / 2, yPos, { align: "center" });

      yPos += 20;

      // Result summary
      doc.setFillColor(getRiskColors(reportPayload.risk_level)[0], getRiskColors(reportPayload.risk_level)[1], getRiskColors(reportPayload.risk_level)[2]);
      doc.roundedRect(40, yPos, pageWidth - 80, 30, 4, 4, "F");
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`RESULTADO: ${reportPayload.risk_level}`, pageWidth / 2, yPos + 12, { align: "center" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Score de Risco: ${reportPayload.risk_score}/100`, pageWidth / 2, yPos + 24, { align: "center" });

      yPos += 45;

      doc.setFontSize(10);
      doc.text(`ID de Auditoria: ${reportPayload.audit_id}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      doc.text(`Período: ${formatBrazilDateTime(reportPayload.period_start, "short")} - ${formatBrazilDateTime(reportPayload.period_end, "short")}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      doc.text(`Válido até: ${formatBrazilDateTime(reportPayload.valid_until, "full")} (UTC-3)`, pageWidth / 2, yPos, { align: "center" });

      yPos += 25;
      doc.setFillColor(30, 41, 59);
      doc.roundedRect(25, yPos, pageWidth - 50, 55, 4, 4, "F");

      doc.setFontSize(9);
      doc.text("VERIFICAÇÃO DE INTEGRIDADE", 35, yPos + 12);
      doc.setFontSize(6);
      doc.text(`SHA256: ${reportPayload.sha256}`, 35, yPos + 22);
      doc.text(`HMAC: ${reportPayload.hmac_signature}`, 35, yPos + 32);
      doc.text(`Versão: ${reportPayload.format_version} | Gerador: ${reportPayload.generator}`, 35, yPos + 42);
      doc.setFontSize(7);
      doc.text("Para verificar a autenticidade, acesse: verificar.cyberservices.com.br", 35, yPos + 50);

      // Save PDF
      const filename = `compliance-${reportPayload.template.toLowerCase()}-${reportPayload.audit_id}.pdf`;
      doc.save(filename);

      toast.success("PDF exportado com sucesso!", {
        description: `Arquivo: ${filename}`,
      });
    } catch (error) {
      logger.error("Error exporting PDF:", error);
      toast.error("Erro ao exportar PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  const templateDef = TEMPLATE_DEFINITIONS[selectedTemplate];
  const TemplateIcon = TEMPLATE_ICONS[selectedTemplate];

  return (
    <div className="space-y-6">
      {/* Template Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Gerador de Relatórios de Segurança
          </CardTitle>
          <CardDescription>
            Gere relatórios de compliance com análise de segurança da sua infraestrutura
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Tipo de Análise</label>
              <Select
                value={selectedTemplate}
                onValueChange={(v) => setSelectedTemplate(v as ComplianceTemplate)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEMPLATE_DEFINITIONS).map(([key, def]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        {def.name} - {def.description}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGenerateReport} disabled={isGenerating}>
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Analisar Segurança
            </Button>
          </div>

          {/* Template Info - Simplified */}
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <TemplateIcon className={`h-8 w-8 ${TEMPLATE_COLORS[selectedTemplate]}`} />
            <div>
              <h4 className="font-medium">{templateDef.name}</h4>
              <p className="text-sm text-muted-foreground">{templateDef.description}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary Preview - User-friendly with Business Context */}
      {reportPayload && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-2">
                {/* Business Context - Company Name prominent */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-sm font-semibold flex items-center gap-1.5 px-3 py-1">
                    <Building2 className="h-4 w-4" />
                    {reportPayload.tenant_name || activeTenant?.name || "Sua Empresa"}
                  </Badge>
                  <Badge variant="secondary" className="text-xs flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatBrazilDateTime(reportPayload.period_start, "short")} - {formatBrazilDateTime(reportPayload.period_end, "short")}
                  </Badge>
                </div>
                
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Shield className="h-6 w-6 text-primary" />
                  Relatório de Segurança - {reportPayload.template_name}
                </CardTitle>
                
                <CardDescription className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Gerado em {formatBrazilDateTime(reportPayload.generated_at, "full")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Válido até {formatBrazilDateTime(reportPayload.valid_until, "short")}
                  </span>
                </CardDescription>
              </div>
              
              <Button onClick={handleExportPDF} disabled={isGenerating} size="lg" className="shrink-0">
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Baixar Relatório PDF
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="pt-6">
            {/* Compliance Status Badge + Risk Gauge side by side */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
              {/* Risk Gauge - Visual and prominent */}
              <div className="flex flex-col items-center justify-center p-6 bg-card border rounded-xl">
                <RiskGauge 
                  score={reportPayload.risk_score} 
                  level={reportPayload.risk_level} 
                  size="lg" 
                />
                <p className="text-xs text-muted-foreground text-center mt-3 max-w-[200px]">
                  {String((reportPayload as unknown as Record<string, unknown>).risk_layman_description || reportPayload.risk_description)}
                </p>
              </div>

              {/* Compliance Badge */}
              <div className="flex flex-col justify-center">
                <ComplianceBadge 
                  status={
                    reportPayload.risk_level === "EXCELENTE" || reportPayload.risk_level === "BOM" ? "BOM" :
                    reportPayload.risk_level === "ADEQUADO" ? "ADEQUADO" :
                    reportPayload.risk_level === "ATENÇÃO" ? "ATENÇÃO" : "CRÍTICO"
                  }
                  size="lg"
                  className="mb-4"
                />
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Controles Conformes</span>
                    <span className="font-bold text-success">{reportPayload.invariants_summary.passed}/{reportPayload.invariants.length}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-success transition-all duration-700" 
                      style={{ width: `${(reportPayload.invariants_summary.passed / reportPayload.invariants.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Key Stats Grid */}
              <div className="grid grid-cols-2 gap-2">
                <StatHighlight 
                  icon="computer" 
                  label="Protegidos" 
                  value={reportPayload.statistics?.total_agents || 0}
                  status={(reportPayload.statistics?.total_agents || 0) > 0 ? "good" : "warning"}
                  size="sm"
                />
                <StatHighlight 
                  icon="alert" 
                  label="Críticos" 
                  value={reportPayload.statistics?.critical_vulnerabilities || 0}
                  status={(reportPayload.statistics?.critical_vulnerabilities || 0) > 0 ? "critical" : "good"}
                  size="sm"
                />
                <StatHighlight 
                  icon="virus" 
                  label="Ameaças" 
                  value={(reportPayload.statistics?.threats_found || 0) > 0 ? reportPayload.statistics?.threats_found : "Nenhuma"}
                  status={(reportPayload.statistics?.threats_found || 0) > 0 ? "critical" : "good"}
                  size="sm"
                />
                <StatHighlight 
                  icon="block" 
                  label="Sites Bloq." 
                  value={reportPayload.policies_count || reportPayload.active_policies.length || 0}
                  status={(reportPayload.policies_count || reportPayload.active_policies.length || 0) > 0 ? "good" : "warning"}
                  size="sm"
                />
              </div>
            </div>

            {/* Executive Summary Message - Clear interpretation */}
            <div className={`p-5 rounded-xl mb-6 ${
              reportPayload.risk_level === 'BAIXO' || reportPayload.risk_level === 'MÍNIMO' ? 'bg-success/10 border-2 border-success/30' :
              reportPayload.risk_level === 'MÉDIO' ? 'bg-warning/10 border-2 border-warning/30' :
              'bg-destructive/10 border-2 border-destructive/30'
            }`}>
              <h4 className="font-semibold mb-2 text-foreground flex items-center gap-2">
                {reportPayload.risk_level === 'BAIXO' || reportPayload.risk_level === 'MÍNIMO' ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : reportPayload.risk_level === 'MÉDIO' ? (
                  <AlertTriangle className="h-5 w-5 text-warning" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                O que isso significa para sua empresa?
              </h4>
              <p className="text-foreground leading-relaxed">
                {((reportPayload as unknown as Record<string, unknown>).executive_summary as Record<string, unknown> | undefined)?.overallMessage as string || (
                  reportPayload.risk_level === 'BAIXO' || reportPayload.risk_level === 'MÍNIMO' ? (
                    `A empresa "${reportPayload.tenant_name}" está em boa situação de segurança. Todos os sistemas estão protegidos e funcionando corretamente. Continue mantendo as boas práticas de segurança.`
                  ) : reportPayload.risk_level === 'MÉDIO' ? (
                    `A empresa "${reportPayload.tenant_name}" possui alguns pontos de atenção que merecem acompanhamento. Não há riscos críticos imediatos, mas recomendamos revisar as pendências listadas abaixo.`
                  ) : (
                    `A empresa "${reportPayload.tenant_name}" precisa de atenção urgente. ${
                      (reportPayload.statistics?.critical_vulnerabilities || 0) > 0 
                        ? `Foram identificadas ${reportPayload.statistics?.critical_vulnerabilities} vulnerabilidades críticas que devem ser corrigidas imediatamente.`
                        : 'O score de segurança está abaixo do ideal. Revise os controles e recomendações abaixo para melhorar a postura de segurança.'
                    }`
                  )
                )}
              </p>
            </div>

            {/* Detailed tabs - but with friendlier labels */}
            <Tabs defaultValue="resumo">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="resumo">Proteções</TabsTrigger>
                <TabsTrigger value="recomendacoes">Recomendações</TabsTrigger>
                <TabsTrigger value="politicas">Sites Bloqueados</TabsTrigger>
                <TabsTrigger value="tecnico">Dados Técnicos</TabsTrigger>
              </TabsList>

              <TabsContent value="resumo" className="pt-4">
                <div className="space-y-3">
                  {reportPayload.invariants.map((inv) => {
                    // User-friendly descriptions
                    const friendlyNames: Record<string, { name: string; description: string }> = {
                      "INV-001": { name: "Proteção de Dados", description: "Seus dados só podem ser acessados por pessoas autorizadas" },
                      "INV-002": { name: "Comunicação Segura", description: "Os computadores usam assinatura digital para comunicação" },
                      "INV-003": { name: "Isolamento de Dados", description: "Os dados da sua empresa estão separados de outras empresas" },
                      "INV-004": { name: "Proteção de Senhas", description: "Senhas e credenciais não aparecem em logs do sistema" },
                      "INV-005": { name: "Proteção Automática", description: "O sistema bloqueia automaticamente em caso de problemas" },
                      "INV-006": { name: "Filtro de Sites", description: "Sites perigosos ou inadequados estão sendo bloqueados" },
                    };
                    const friendly = friendlyNames[inv.id] || { name: inv.name, description: inv.description };
                    
                    return (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-4 bg-card border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {inv.status === "PASS" ? (
                            <div className="p-2 bg-success/20 rounded-full">
                              <CheckCircle2 className="h-5 w-5 text-success" />
                            </div>
                          ) : inv.status === "FAIL" ? (
                            <div className="p-2 bg-destructive/20 rounded-full">
                              <XCircle className="h-5 w-5 text-destructive" />
                            </div>
                          ) : (
                            <div className="p-2 bg-warning/20 rounded-full">
                              <AlertTriangle className="h-5 w-5 text-warning" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-foreground">{friendly.name}</p>
                            <p className="text-sm text-muted-foreground">{friendly.description}</p>
                          </div>
                        </div>
                        <Badge variant={inv.status === "PASS" ? "default" : inv.status === "FAIL" ? "destructive" : "secondary"} className="text-sm">
                          {inv.status === "PASS" ? "Ativo" : inv.status === "FAIL" ? "Atenção" : "Pendente"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="recomendacoes" className="pt-4">
                <div className="space-y-4">
                  {/* Actionable Recommendations from backend */}
                  {(() => {
                    const execSummary = (reportPayload as unknown as Record<string, unknown>).executive_summary as Record<string, unknown> | undefined;
                    const recs = (execSummary?.recommendations || []) as string[];
                    return recs.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Ações Recomendadas
                      </h4>
                      {recs.map((rec: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 p-4 bg-card border rounded-lg">
                          <div className={`p-1.5 rounded-full shrink-0 ${
                            idx === 0 && (reportPayload.statistics?.critical_vulnerabilities || 0) > 0 
                              ? 'bg-destructive/20' 
                              : idx < 2 ? 'bg-warning/20' : 'bg-muted'
                          }`}>
                            <span className="font-bold text-xs w-5 h-5 flex items-center justify-center">
                              {idx + 1}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-foreground">{rec}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {idx === 0 ? "Prioridade alta - resolver esta semana" : 
                               idx === 1 ? "Prioridade média - resolver em 2 semanas" :
                               "Melhoria contínua"}
                            </p>
                          </div>
                          <Badge variant={
                            idx === 0 && (reportPayload.statistics?.critical_vulnerabilities || 0) > 0 
                              ? "destructive" 
                              : reportPayload.risk_score >= 70 && idx === 0 ? "outline"
                              : idx < 2 ? "secondary" : "outline"
                          } className="shrink-0">
                            {reportPayload.risk_score >= 70 && idx === 0 ? "Sucesso" : idx === 0 ? "Urgente" : idx === 1 ? "Importante" : "Sugestão"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    // Fallback to generated recommendations
                    <div className="space-y-3">
                      {(() => {
                        const recommendations: { icon: React.ReactNode; text: string; priority: string; detail: string }[] = [];
                        const criticalVulns = reportPayload.statistics?.critical_vulnerabilities || 0;
                        const highVulns = reportPayload.statistics?.high_vulnerabilities || 0;
                        const threats = reportPayload.statistics?.threats_found || 0;
                        const offlineAgents = (reportPayload.statistics as Record<string, unknown>)?.offline_agents || 0;
                        const avOutdated = (reportPayload.statistics as Record<string, unknown>)?.av_outdated || 0;
                        const failedInvariants = reportPayload.invariants.filter(i => i.status === "FAIL");

                        if (criticalVulns > 0) {
                          recommendations.push({
                            icon: <XCircle className="h-5 w-5 text-destructive" />,
                            text: `Corrigir ${criticalVulns} vulnerabilidade(s) crítica(s)`,
                            detail: "Atualizar softwares afetados ou aplicar patches de segurança",
                            priority: "Urgente"
                          });
                        }
                        if (highVulns > 0) {
                          recommendations.push({
                            icon: <AlertTriangle className="h-5 w-5 text-orange-500" />,
                            text: `Revisar ${highVulns} vulnerabilidade(s) de alta severidade`,
                            detail: "Avaliar impacto e planejar correções para esta semana",
                            priority: "Alto"
                          });
                        }
                        if (threats > 0) {
                          recommendations.push({
                            icon: <Bug className="h-5 w-5 text-warning" />,
                            text: `Investigar ${threats} ameaça(s) detectada(s)`,
                            detail: "Verificar relatórios do antivírus e isolar máquinas se necessário",
                            priority: "Alto"
                          });
                        }
                        if (offlineAgents > 0) {
                          recommendations.push({
                            icon: <Monitor className="h-5 w-5 text-muted-foreground" />,
                            text: `Verificar ${offlineAgents} computador(es) offline`,
                            detail: "Checar se estão desligados ou com problemas de conexão",
                            priority: "Médio"
                          });
                        }
                        if (avOutdated > 0) {
                          recommendations.push({
                            icon: <Shield className="h-5 w-5 text-warning" />,
                            text: `Atualizar antivírus em ${avOutdated} computador(es)`,
                            detail: "Definições de vírus desatualizadas reduzem a proteção",
                            priority: "Médio"
                          });
                        }
                        if (failedInvariants.length > 0) {
                          recommendations.push({
                            icon: <Lock className="h-5 w-5 text-warning" />,
                            text: `Verificar ${failedInvariants.length} controle(s) de segurança`,
                            detail: "Revisar configurações de proteção não conformes",
                            priority: "Médio"
                          });
                        }
                        if (recommendations.length === 0) {
                          recommendations.push({
                            icon: <CheckCircle2 className="h-5 w-5 text-success" />,
                            text: "Parabéns! Sua segurança está em dia",
                            detail: "Continue monitorando e mantendo as boas práticas",
                            priority: "Sucesso"
                          });
                        }

                        return recommendations.map((rec, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-4 bg-card border rounded-lg">
                            <div className="p-2 bg-muted rounded-full shrink-0">
                              {rec.icon}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{rec.text}</p>
                              <p className="text-sm text-muted-foreground mt-0.5">{rec.detail}</p>
                            </div>
                            <Badge variant={
                              rec.priority === "Urgente" ? "destructive" :
                              rec.priority === "Alto" ? "default" :
                              rec.priority === "Médio" ? "secondary" :
                              rec.priority === "Sucesso" ? "outline" : "outline"
                            } className="shrink-0">
                              {rec.priority}
                            </Badge>
                          </div>
                        ));
                      })()}
                    </div>
                  )}

                  {/* Next Steps */}
                  <Separator className="my-4" />
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <h4 className="font-semibold mb-2 text-sm">Próximos Passos</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        Baixe o PDF para registro e documentação
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        Revise as recomendações com sua equipe de TI
                      </li>
                      <li className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary shrink-0" />
                        Próxima análise recomendada: {formatBrazilDateTime(reportPayload.valid_until, "short")}
                      </li>
                    </ul>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="politicas" className="pt-4">
                {reportPayload.active_policies.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground mb-4">
                      Sites e categorias bloqueadas para proteção dos usuários:
                    </p>
                    {reportPayload.active_policies.map((policy) => (
                      <div
                        key={policy.id}
                        className="flex items-center justify-between p-3 bg-card border rounded-lg"
                      >
                        <div>
                          <p className="font-mono text-sm text-foreground">{policy.domain_pattern}</p>
                          <p className="text-xs text-muted-foreground">{policy.reason || "Política de segurança"}</p>
                        </div>
                        <Badge variant={policy.is_active ? "default" : "secondary"}>
                          {policy.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      Nenhuma política de bloqueio configurada.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Configure políticas de DNS para bloquear sites perigosos.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="tecnico" className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Dados técnicos para verificação de autenticidade do relatório.
                </p>
                <div className="grid gap-4">
                  <div className="p-4 bg-success/10 border border-success/30 rounded-lg space-y-2">
                    <p className="text-sm font-medium text-success">
                      Código de Integridade (SHA256)
                    </p>
                    <HashBadge value={reportPayload.sha256} variant="sha256" truncateLength={32} />
                    <p className="text-xs text-muted-foreground">
                      Este código muda se o documento for alterado.
                    </p>
                  </div>

                  <div className="p-4 bg-info/10 border border-info/30 rounded-lg space-y-2">
                    <p className="text-sm font-medium text-info">
                      Assinatura Digital (HMAC)
                    </p>
                    <HashBadge value={reportPayload.hmac_signature} variant="hmac" truncateLength={32} />
                    <p className="text-xs text-muted-foreground">
                      Comprova que o relatório foi gerado pelo sistema CyberShield.
                    </p>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">ID do Relatório:</span>
                      <p className="font-mono text-foreground">{reportPayload.audit_id}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Válido até:</span>
                      <p className="font-medium text-foreground">{formatBrazilDateTime(reportPayload.valid_until, "full")}</p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
