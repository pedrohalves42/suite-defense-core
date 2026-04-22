import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { buildPeriodRange } from "./periodRange";
import type { ComplianceTemplate, ComplianceReportPayload } from "./types";

/**
 * Service layer: encapsulates the contract with the `ops-gateway` edge function.
 *
 * Single Responsibility: only knows how to request a compliance report and
 * translate transport-level errors into domain-level errors. The hook stays
 * focused on UI state.
 */

async function ensureAuthenticated(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data?.session?.access_token) {
    throw new Error("Não autenticado");
  }
}

export async function fetchComplianceReport(
  template: ComplianceTemplate,
): Promise<ComplianceReportPayload> {
  await ensureAuthenticated();

  const { data, error } = await supabase.functions.invoke("ops-gateway", {
    body: {
      action: "report:compliance",
      payload: { template, ...buildPeriodRange(30) },
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
}
