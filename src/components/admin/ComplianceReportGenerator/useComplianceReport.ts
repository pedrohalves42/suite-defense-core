import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { ComplianceTemplate, ComplianceReportPayload } from "./types";

export function useComplianceReport() {
  const [selectedTemplate, setSelectedTemplate] = useState<ComplianceTemplate>("LGPD");
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportPayload, setReportPayload] = useState<ComplianceReportPayload | null>(null);

  const fetchComplianceReport = useCallback(async (template: ComplianceTemplate): Promise<ComplianceReportPayload> => {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) {
      throw new Error("Não autenticado");
    }

    const periodEnd = new Date().toISOString();
    const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase.functions.invoke("ops-gateway", {
      body: {
        action: 'report:compliance',
        payload: {
          template,
          period_start: periodStart,
          period_end: periodEnd,
        },
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
  }, []);

  const handleGenerateReport = useCallback(async () => {
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
  }, [selectedTemplate, fetchComplianceReport]);

  return {
    selectedTemplate,
    setSelectedTemplate,
    isGenerating,
    setIsGenerating,
    reportPayload,
    handleGenerateReport,
  };
}
