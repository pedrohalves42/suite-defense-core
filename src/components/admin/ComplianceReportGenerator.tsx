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

  // Fetch compliance report from backend
  const fetchComplianceReport = async (template: ComplianceTemplate) => {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) {
      throw new Error("Não autenticado");
    }

    const response = await supabase.functions.invoke("generate-security-report", {
      body: {},
      headers: {
        Authorization: `Bearer ${session.session.access_token}`,
      },
    });

    // Use URL params approach
    const { data, error } = await supabase.functions.invoke("generate-security-report", {
      body: null,
    });

    if (error) throw error;

    // Fetch with compliance format
    const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-security-report`);
    url.searchParams.set("format", "compliance");
    url.searchParams.set("template", template);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${session.session.access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Erro ao gerar relatório");
    }

    const result = await res.json();
    if (!result.success || !result.payload) {
      throw new Error("Payload inválido");
    }

    return result.payload as ComplianceReportPayload;
  };

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      const payload = await fetchComplianceReport(selectedTemplate);
      setReportPayload(payload);
      toast.success(`Relatório ${selectedTemplate} gerado com sucesso!`);
    } catch (error) {
      console.error("Error generating compliance report:", error);
      toast.error("Erro ao gerar relatório de compliance");
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

      // ==================== PAGE 1: COVER ====================
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, pageHeight, "F");

      // Logo
      doc.setFillColor(37, 99, 235);
      doc.circle(pageWidth / 2, 45, 18, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("CS", pageWidth / 2, 49, { align: "center" });

      // Title
      doc.setFontSize(24);
      doc.text("RELATÓRIO DE COMPLIANCE", pageWidth / 2, 80, { align: "center" });

      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.text(reportPayload.template_name, pageWidth / 2, 92, { align: "center" });

      doc.setFontSize(11);
      doc.text(reportPayload.template_description, pageWidth / 2, 103, { align: "center" });

      // Audit Info Box
      doc.setFillColor(30, 41, 59);
      doc.roundedRect(25, 120, pageWidth - 50, 50, 4, 4, "F");

      doc.setFontSize(9);
      doc.text(`ID de Auditoria: ${reportPayload.audit_id}`, 35, 133);
      doc.text(`Emitido em: ${formatBrazilDateTime(reportPayload.generated_at, "full")} (UTC-3)`, 35, 144);
      doc.text(`Válido até: ${formatBrazilDateTime(reportPayload.valid_until, "full")} (UTC-3)`, 35, 155);
      doc.text(`Tenant: ${reportPayload.tenant_name}`, 35, 166);

      // SHA256 Box
      doc.setFillColor(22, 101, 52);
      doc.roundedRect(25, 180, pageWidth - 50, 22, 4, 4, "F");
      doc.setFontSize(8);
      doc.text("SHA256 (Verificação de Integridade):", 35, 189);
      doc.setFontSize(6);
      doc.text(reportPayload.sha256, 35, 197);

      // HMAC Box
      doc.setFillColor(30, 64, 175);
      doc.roundedRect(25, 207, pageWidth - 50, 22, 4, 4, "F");
      doc.setFontSize(8);
      doc.text("HMAC-SHA256 (Assinatura Digital):", 35, 216);
      doc.setFontSize(6);
      doc.text(reportPayload.hmac_signature, 35, 224);

      // Risk Score
      const riskColor = reportPayload.risk_level === "BAIXO" ? [22, 163, 74] :
                        reportPayload.risk_level === "MÉDIO" ? [202, 138, 4] :
                        reportPayload.risk_level === "ALTO" ? [234, 88, 12] : [220, 38, 38];
      doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
      doc.roundedRect(25, 235, pageWidth - 50, 25, 4, 4, "F");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(`Score de Risco: ${reportPayload.risk_score}/100 - ${reportPayload.risk_level}`, 35, 248);
      doc.setFontSize(8);
      doc.text(reportPayload.risk_description, 35, 256);

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("CyberShield Security Platform - Laudo com Validade Jurídica", pageWidth / 2, pageHeight - 15, { align: "center" });

      // ==================== PAGE 2: INVARIANTS ====================
      doc.addPage();
      yPos = 20;

      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 14, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text(`${reportPayload.audit_id} | ${reportPayload.template_name}`, pageWidth / 2, 9, { align: "center" });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("1. INVARIANTES DE SEGURANÇA", 14, yPos + 8);
      yPos += 18;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Resumo: ${reportPayload.invariants_summary.passed} conformes, ${reportPayload.invariants_summary.failed} não conformes, ${reportPayload.invariants_summary.unknown} pendentes`, 14, yPos);
      yPos += 8;

      const invariantData = reportPayload.invariants.map((inv) => [
        inv.id,
        inv.name,
        inv.status === "PASS" ? "✓ CONFORME" : inv.status === "FAIL" ? "✗ NÃO CONFORME" : "? PENDENTE",
        inv.details || inv.description,
        inv.evidence_hash.substring(0, 12) + "...",
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [["ID", "Controle", "Status", "Detalhes", "Hash Evidência"]],
        body: invariantData,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 28 }, 4: { cellWidth: 25 } },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.column.index === 2 && data.section === "body") {
            const text = data.cell.text[0];
            if (text.includes("CONFORME") && !text.includes("NÃO")) {
              data.cell.styles.textColor = [22, 101, 52];
            } else if (text.includes("NÃO CONFORME")) {
              data.cell.styles.textColor = [220, 38, 38];
            } else {
              data.cell.styles.textColor = [113, 63, 18];
            }
          }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 12;

      // ==================== SECTION 2: ACTIVE POLICIES ====================
      if (yPos > pageHeight - 60) { doc.addPage(); yPos = 25; }

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("2. POLÍTICAS ATIVAS", 14, yPos);
      yPos += 10;

      if (reportPayload.active_policies.length > 0) {
        const policyData = reportPayload.active_policies.map((p) => [
          p.domain_pattern,
          p.reason || "Não especificado",
          p.is_active ? "Ativo" : "Inativo",
          formatBrazilDateTime(p.created_at, "short"),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [["Padrão", "Motivo", "Status", "Criado"]],
          body: policyData,
          theme: "striped",
          headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
          styles: { fontSize: 7 },
          margin: { left: 14, right: 14 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 12;
      } else {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text("Nenhuma política de bloqueio configurada.", 14, yPos);
        yPos += 12;
      }

      // ==================== SECTION 3: TEMPLATE SECTIONS ====================
      if (yPos > pageHeight - 50) { doc.addPage(); yPos = 25; }

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`3. SEÇÕES ${reportPayload.template_name.toUpperCase()}`, 14, yPos);
      yPos += 10;

      for (const section of reportPayload.sections) {
        if (yPos > pageHeight - 35) { doc.addPage(); yPos = 25; }

        doc.setFillColor(241, 245, 249);
        doc.roundedRect(14, yPos, pageWidth - 28, 18, 2, 2, "F");

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(section.title, 18, yPos + 7);

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(`${section.description} | ${section.record_count} registros | ${section.evidence_refs.length} evidências`, 18, yPos + 14);

        yPos += 22;
      }

      // ==================== SECTION 4: STATISTICS ====================
      if (yPos > pageHeight - 60) { doc.addPage(); yPos = 25; }

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("4. ESTATÍSTICAS DO PERÍODO", 14, yPos);
      yPos += 10;

      const statsData = [
        ["Total de Agentes", reportPayload.statistics.total_agents.toString()],
        ["Vulnerabilidades Críticas", reportPayload.statistics.critical_vulnerabilities.toString()],
        ["Vulnerabilidades Altas", reportPayload.statistics.high_vulnerabilities.toString()],
        ["Ameaças Detectadas", reportPayload.statistics.threats_found.toString()],
        ["Eventos de Segurança", reportPayload.statistics.security_events.toString()],
        ["Logs de Auditoria", reportPayload.statistics.audit_logs.toString()],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [["Métrica", "Valor"]],
        body: statsData,
        theme: "grid",
        headStyles: { fillColor: [107, 114, 128], fontSize: 8 },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
        columnStyles: { 0: { cellWidth: 80 } },
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
      doc.text(`Este documento certifica que o tenant "${reportPayload.tenant_name}"`, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      doc.text(`foi avaliado conforme os critérios do template ${reportPayload.template_name}.`, pageWidth / 2, yPos, { align: "center" });

      yPos += 25;
      doc.setFontSize(10);
      doc.text(`ID de Auditoria: ${reportPayload.audit_id}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      doc.text(`Período: ${formatBrazilDateTime(reportPayload.period_start, "short")} - ${formatBrazilDateTime(reportPayload.period_end, "short")}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;
      doc.text(`Válido até: ${formatBrazilDateTime(reportPayload.valid_until, "full")} (UTC-3)`, pageWidth / 2, yPos, { align: "center" });

      yPos += 30;
      doc.setFillColor(30, 41, 59);
      doc.roundedRect(30, yPos, pageWidth - 60, 50, 4, 4, "F");

      doc.setFontSize(8);
      doc.text("VERIFICAÇÃO DE INTEGRIDADE", 40, yPos + 12);
      doc.setFontSize(6);
      doc.text(`SHA256: ${reportPayload.sha256}`, 40, yPos + 22);
      doc.text(`HMAC: ${reportPayload.hmac_signature}`, 40, yPos + 32);
      doc.text(`Versão: ${reportPayload.format_version} | Gerador: ${reportPayload.generator}`, 40, yPos + 42);

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
