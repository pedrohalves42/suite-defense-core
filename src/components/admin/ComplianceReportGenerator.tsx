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
  Lock, Scale, AlertTriangle, Eye, RefreshCw, FileCheck
} from "lucide-react";
import { toast } from "sonner";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { HashBadge } from "@/components/ui/hash-badge";
import type { 
  ComplianceTemplate, 
  ComplianceReportPayload,
  SecurityInvariantStatus 
} from "@/types/compliance-report";
import { TEMPLATE_DEFINITIONS, SECURITY_INVARIANTS_DEFINITIONS } from "@/types/compliance-report";

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
      console.error("Edge function error:", error);
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
    } catch (error: any) {
      console.error("Error generating compliance report:", error);
      const errorMessage = error?.message || "Erro desconhecido";
      
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
      const jsPDFModule = await import("jspdf");
      const jsPDFClass = jsPDFModule.jsPDF;
      const autoTableModule = await import("jspdf-autotable");
      const autoTable = autoTableModule.default;

      const doc = new jsPDFClass();
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
      doc.setFillColor(37, 99, 235);
      doc.circle(pageWidth / 2, 40, 18, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("CS", pageWidth / 2, 44, { align: "center" });

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

      yPos = (doc as any).lastAutoTable.finalY + 15;

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

      yPos = (doc as any).lastAutoTable.finalY + 15;

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

        yPos = (doc as any).lastAutoTable.finalY + 15;
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
      console.error("Error exporting PDF:", error);
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
            Gerador de Relatórios de Compliance
          </CardTitle>
          <CardDescription>
            Gere relatórios com validade jurídica e criptográfica (SHA256 + HMAC)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Template de Compliance</label>
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
              Gerar Relatório
            </Button>
          </div>

          {/* Template Info */}
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <TemplateIcon className={`h-8 w-8 ${TEMPLATE_COLORS[selectedTemplate]}`} />
            <div>
              <h4 className="font-medium">{templateDef.name}</h4>
              <p className="text-sm text-muted-foreground">{templateDef.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {templateDef.sections.map((s) => (
                  <Badge key={s.id} variant="outline" className="text-xs">
                    {s.title}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Preview */}
      {reportPayload && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Preview do Relatório
                </CardTitle>
                <CardDescription>
                  {reportPayload.audit_id} • Gerado em {formatBrazilDateTime(reportPayload.generated_at, "full")} (UTC-3)
                </CardDescription>
              </div>
              <Button onClick={handleExportPDF} disabled={isGenerating}>
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Exportar PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="hashes">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="hashes">Hashes</TabsTrigger>
                <TabsTrigger value="invariants">Invariantes</TabsTrigger>
                <TabsTrigger value="policies">Políticas</TabsTrigger>
                <TabsTrigger value="sections">Seções</TabsTrigger>
              </TabsList>

              <TabsContent value="hashes" className="space-y-4 pt-4">
                <div className="grid gap-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg space-y-2">
                    <p className="text-sm font-medium text-green-800 dark:text-green-400">
                      SHA256 - Verificação de Integridade
                    </p>
                    <HashBadge value={reportPayload.sha256} variant="sha256" truncateLength={32} />
                    <p className="text-xs text-muted-foreground">
                      Use este hash para verificar que o documento não foi alterado após a geração.
                    </p>
                  </div>

                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-2">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-400">
                      HMAC-SHA256 - Assinatura Digital
                    </p>
                    <HashBadge value={reportPayload.hmac_signature} variant="hmac" truncateLength={32} />
                    <p className="text-xs text-muted-foreground">
                      Assinatura criptográfica que comprova a origem do documento.
                    </p>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Válido até:</span>
                      <p className="font-medium">{formatBrazilDateTime(reportPayload.valid_until, "full")} (UTC-3)</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Versão do formato:</span>
                      <p className="font-medium">{reportPayload.format_version}</p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="invariants" className="pt-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <Badge variant="default" className="bg-green-600">
                      {reportPayload.invariants_summary.passed} Conformes
                    </Badge>
                    <Badge variant="destructive">
                      {reportPayload.invariants_summary.failed} Não Conformes
                    </Badge>
                    <Badge variant="secondary">
                      {reportPayload.invariants_summary.unknown} Pendentes
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {reportPayload.invariants.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {inv.status === "PASS" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : inv.status === "FAIL" ? (
                            <XCircle className="h-5 w-5 text-red-600" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-yellow-600" />
                          )}
                          <div>
                            <p className="font-medium text-sm">{inv.id}: {inv.name}</p>
                            <p className="text-xs text-muted-foreground">{inv.details}</p>
                          </div>
                        </div>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {inv.evidence_hash.substring(0, 12)}...
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="policies" className="pt-4">
                {reportPayload.active_policies.length > 0 ? (
                  <div className="space-y-2">
                    {reportPayload.active_policies.map((policy) => (
                      <div
                        key={policy.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div>
                          <p className="font-mono text-sm">{policy.domain_pattern}</p>
                          <p className="text-xs text-muted-foreground">{policy.reason || "Sem motivo especificado"}</p>
                        </div>
                        <Badge variant={policy.is_active ? "default" : "secondary"}>
                          {policy.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhuma política de bloqueio configurada.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="sections" className="pt-4">
                <div className="space-y-3">
                  {reportPayload.sections.map((section) => (
                    <div
                      key={section.id}
                      className="p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{section.title}</h4>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{section.record_count} registros</Badge>
                          <Badge variant="secondary">{section.evidence_refs.length} evidências</Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{section.description}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
