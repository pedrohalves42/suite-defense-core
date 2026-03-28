/**
 * ComplianceReportGenerator — Orchestrator
 *
 * Generates compliance reports (LGPD, ISO 27001, SOC2-lite) with
 * SHA256 integrity + HMAC authorship calculated on the backend.
 * Supports PDF export with legally-valid cryptographic certification.
 */

import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useActiveTenant } from "@/hooks/useActiveTenant";

import { useComplianceReport } from "./useComplianceReport";
import { exportCompliancePdf } from "./exportCompliancePdf";
import { ReportTemplateSelector } from "./ReportTemplateSelector";
import { ReportPreviewHeader } from "./ReportPreviewHeader";
import { ReportSummaryCards } from "./ReportSummaryCards";
import { ReportTabs } from "./ReportTabs";

export function ComplianceReportGenerator() {
  const { activeTenant } = useActiveTenant();
  const {
    selectedTemplate,
    setSelectedTemplate,
    isGenerating,
    setIsGenerating,
    reportPayload,
    handleGenerateReport,
  } = useComplianceReport();

  const handleExportPDF = async () => {
    if (!reportPayload) {
      toast.error("Gere o relatório primeiro");
      return;
    }

    setIsGenerating(true);
    try {
      const filename = await exportCompliancePdf(reportPayload);
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

  return (
    <div className="space-y-6">
      <ReportTemplateSelector
        selectedTemplate={selectedTemplate}
        onTemplateChange={setSelectedTemplate}
        onGenerate={handleGenerateReport}
        isGenerating={isGenerating}
      />

      {reportPayload && (
        <Card className="border-2 border-primary/20">
          <ReportPreviewHeader
            reportPayload={reportPayload}
            tenantName={activeTenant?.name}
            isGenerating={isGenerating}
            onExportPdf={handleExportPDF}
          />

          <CardContent className="pt-6">
            <ReportSummaryCards reportPayload={reportPayload} />
            <ReportTabs reportPayload={reportPayload} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
