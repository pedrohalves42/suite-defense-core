import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { logger } from '@/lib/logger';
import type { GeneratedReport } from './types';

export function useGeneratedReports() {
  const queryClient = useQueryClient();
  const { activeTenant } = useActiveTenant();
  const [selectedReport, setSelectedReport] = useState<GeneratedReport | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: reports, isLoading, refetch } = useQuery({
    queryKey: ["generated-reports", activeTenant?.id],
    queryFn: async () => {
      // Wave 4 - B34: enforce tenant filter; RLS alone was leaking when user
      // had multiple tenants visible and queryKey was tenant-agnostic.
      if (!activeTenant?.id) return [] as GeneratedReport[];
      const { data, error } = await supabase
        .from("generated_reports")
        .select("id, tenant_id, agent_id, agent_name, report_type, title, risk_score, risk_level, statistics, report_data, status, triggered_by, created_at, expires_at, sales_status, commercial_priority, next_action, commercial_summary, contacted_at, follow_up_at")
        .eq("tenant_id", activeTenant.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as GeneratedReport[];
    },
    enabled: !!activeTenant?.id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ reportId, updates }: { reportId: string; updates: Partial<GeneratedReport> }) => {
      // Wave 4 - B34: guard against undefined tenant on mutations.
      if (!activeTenant?.id) throw new Error("Tenant não selecionado");
      const { error } = await supabase
        .from("generated_reports")
        .update(updates)
        .eq("id", reportId)
        .eq("tenant_id", activeTenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-reports"] });
      toast.success("Status atualizado!");
    },
    onError: (err: Error) => {
      toast.error(err?.message ? `Erro ao atualizar: ${err.message}` : "Erro ao atualizar status");
    },
  });

  const handleStatusChange = (reportId: string, newStatus: string) => {
    const updates: Partial<GeneratedReport> = { sales_status: newStatus };
    if (newStatus === "contacted") {
      updates.contacted_at = new Date().toISOString();
    }
    updateStatusMutation.mutate({ reportId, updates });
  };

  const handleScheduleConversation = (report: GeneratedReport) => {
    setSelectedReport(report);
    setModalOpen(true);
  };

  const getEvolutionIndicator = (report: GeneratedReport, allReports: GeneratedReport[]) => {
    const previousReports = allReports
      .filter(r => r.id !== report.id && r.agent_name === report.agent_name && r.tenant_id === report.tenant_id && new Date(r.created_at) < new Date(report.created_at))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (previousReports.length === 0) return null;
    const diff = (report.risk_score || 0) - (previousReports[0].risk_score || 0);
    if (diff > 5) return { direction: 'up' as const, label: "Piorou", color: "text-red-500" };
    if (diff < -5) return { direction: 'down' as const, label: "Melhorou", color: "text-green-500" };
    return { direction: 'stable' as const, label: "Estável", color: "text-muted-foreground" };
  };

  const handleDownloadJSON = (report: GeneratedReport) => {
    try {
      const payload = report.report_data ?? {};
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laudo-${report.report_type}-${report.agent_name || 'todos'}-${new Date(report.created_at).toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Laudo baixado com sucesso!");
    } catch (err) {
      logger.error("Error exporting report JSON:", err);
      toast.error("Erro ao gerar arquivo JSON");
    }
  };

  const handleDownloadCSV = (report: GeneratedReport) => {
    try {
      let csvContent = "";
      const data = (report.report_data ?? {}) as Record<string, unknown>;

      const inventory = Array.isArray(data.software_inventory) ? data.software_inventory as Record<string, unknown>[] : [];
      if (inventory.length > 0) {
        csvContent += "INVENTÁRIO DE SOFTWARE\n";
        csvContent += "Nome,Versão,Fornecedor,Risco\n";
        // Wave 4 - B35: previously the loop was missing; only the header was emitted.
        inventory.forEach((sw) => {
          csvContent += `"${sw.name || ''}","${sw.version || ''}","${sw.vendor || sw.publisher || ''}","${sw.risk_level || ''}"\n`;
        });
        csvContent += "\n";
      }

      const vulnerabilities = Array.isArray(data.vulnerabilities) ? data.vulnerabilities as Record<string, unknown>[] : [];
      if (vulnerabilities.length > 0) {
        csvContent += "VULNERABILIDADES\n";
        csvContent += "Severidade,Título,Descrição\n";
        vulnerabilities.forEach((vuln) => {
          csvContent += `"${vuln.severity || ''}","${vuln.title || vuln.check_key || ''}","${String(vuln.description || '').replace(/"/g, '""')}"\n`;
        });
        csvContent += "\n";
      }

      const avEntries = Array.isArray(data.antivirus_status) ? data.antivirus_status as Record<string, unknown>[] : [];
      if (avEntries.length > 0) {
        csvContent += "STATUS ANTIVÍRUS\n";
        csvContent += "Engine,Versão,Status,Ameaças\n";
        avEntries.forEach((av) => {
          csvContent += `"${av.engine_name || ''}","${av.engine_version || ''}","${av.status || ''}","${av.threats_found || 0}"\n`;
        });
        csvContent += "\n";
      }

      const webEntries = Array.isArray(data.web_activity) ? data.web_activity as Record<string, unknown>[] : [];
      if (webEntries.length > 0) {
        csvContent += "ATIVIDADE WEB\n";
        csvContent += "Domínio,Fonte,Data\n";
        webEntries.forEach((web) => {
          csvContent += `"${web.domain || ''}","${web.source || ''}","${web.visited_at || ''}"\n`;
        });
      }

      if (!csvContent) {
        toast.info("Este laudo não possui dados tabulares para exportar em CSV");
        return;
      }

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laudo-${report.report_type}-${report.agent_name || 'todos'}-${new Date(report.created_at).toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Laudo CSV baixado com sucesso!");
    } catch (err) {
      logger.error("Error exporting report CSV:", err);
      toast.error("Erro ao gerar arquivo CSV");
    }
  };

  const handleDelete = async (reportId: string) => {
    try {
      // Wave 4 - B34: prevent silent eq(undefined) when tenant not loaded.
      if (!activeTenant?.id) {
        toast.error("Tenant não selecionado");
        return;
      }
      const { error } = await supabase
        .from("generated_reports")
        .delete()
        .eq("id", reportId)
        .eq("tenant_id", activeTenant.id);
      if (error) throw error;
      toast.success("Laudo excluído com sucesso!");
      refetch();
    } catch (error) {
      logger.error("Error deleting report:", error);
      toast.error(error instanceof Error ? `Erro ao excluir laudo: ${error.message}` : "Erro ao excluir laudo");
    }
  };

  return {
    reports,
    isLoading,
    refetch,
    selectedReport,
    modalOpen,
    setModalOpen,
    handleStatusChange,
    handleScheduleConversation,
    getEvolutionIndicator,
    handleDownloadJSON,
    handleDownloadCSV,
    handleDelete,
  };
}
