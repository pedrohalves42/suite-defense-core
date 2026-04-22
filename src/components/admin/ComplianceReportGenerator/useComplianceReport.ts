import { useState, useCallback } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { fetchComplianceReport } from "./reportService";
import { resolveErrorMessage } from "./errorMessages";
import type { ComplianceTemplate, ComplianceReportPayload } from "./types";
import { useActiveTenant } from "@/hooks/useActiveTenant";

/**
 * UI orchestrator hook for the Compliance Report screen.
 *
 * Responsibilities (only):
 *   - Hold local UI state (selected template, loading, payload).
 *   - Trigger the report service and surface success/error toasts.
 *
 * Side concerns (transport, error mapping, date math) live in dedicated
 * modules so this hook stays small and easy to test.
 */
export function useComplianceReport() {
  const { activeTenant } = useActiveTenant();
  const [selectedTemplate, setSelectedTemplate] = useState<ComplianceTemplate>("LGPD");
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportPayload, setReportPayload] = useState<ComplianceReportPayload | null>(null);

  const handleGenerateReport = useCallback(async () => {
    if (!activeTenant?.id) {
      toast.error("Selecione um tenant antes de gerar o relatório");
      return;
    }

    setIsGenerating(true);
    try {
      const payload = await fetchComplianceReport(selectedTemplate, activeTenant.id);
      setReportPayload(payload);
      toast.success(`Relatório ${selectedTemplate} gerado com sucesso!`);
    } catch (error) {
      logger.error("Error generating compliance report:", error);
      toast.error(resolveErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  }, [activeTenant?.id, selectedTemplate]);

  return {
    selectedTemplate,
    setSelectedTemplate,
    isGenerating,
    setIsGenerating,
    reportPayload,
    handleGenerateReport,
  };
}
