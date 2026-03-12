import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, Trash2, RefreshCw, Shield, Bug, Globe, HardDrive, MessageCircle, TrendingUp, TrendingDown, Minus, Phone, Mail, ExternalLink, Building2 } from "lucide-react";
import { toast } from "sonner";
import { formatBrazilDateTime, formatRelativeTime } from "@/lib/date-utils";
import { ScheduleConversationModal } from "./ScheduleConversationModal";
import { useActiveTenant } from "@/hooks/useActiveTenant";

interface GeneratedReport {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  agent_name: string | null;
  report_type: string;
  title: string;
  risk_score: number | null;
  risk_level: string | null;
  statistics: Record<string, any>;
  report_data: Record<string, any>;
  status: string;
  triggered_by: string;
  created_at: string;
  expires_at: string;
  sales_status: string | null;
  commercial_priority: string | null;
  next_action: string | null;
  commercial_summary: string | null;
  contacted_at: string | null;
  follow_up_at: string | null;
}

const reportTypeIcons: Record<string, React.ReactNode> = {
  'full_security': <Shield className="h-4 w-4" />,
  'software_inventory': <HardDrive className="h-4 w-4" />,
  'vulnerabilities': <Bug className="h-4 w-4" />,
  'antivirus': <Shield className="h-4 w-4 text-green-500" />,
  'web_activity': <Globe className="h-4 w-4" />
};

const reportTypeLabels: Record<string, string> = {
  'full_security': 'Segurança Completo',
  'software_inventory': 'Inventário de Software',
  'vulnerabilities': 'Vulnerabilidades',
  'antivirus': 'Antivírus',
  'web_activity': 'Atividade Web'
};

const triggeredByLabels: Record<string, string> = {
  'job_completion': 'Automático',
  'scheduled': 'Agendado',
  'manual': 'Manual'
};

const riskLevelColors: Record<string, string> = {
  'CRÍTICO': 'bg-red-500',
  'ALTO': 'bg-orange-500',
  'MÉDIO': 'bg-yellow-500',
  'BAIXO': 'bg-green-500'
};

const salesStatusColors: Record<string, string> = {
  'open': 'bg-blue-500',
  'contacted': 'bg-yellow-500',
  'negotiated': 'bg-orange-500',
  'closed_won': 'bg-green-500',
  'closed_lost': 'bg-red-500'
};

const salesStatusLabels: Record<string, string> = {
  'open': 'Aberto',
  'contacted': 'Contatado',
  'negotiated': 'Negociando',
  'closed_won': 'Fechado ✓',
  'closed_lost': 'Perdido ✗'
};

const nextActionIcons: Record<string, React.ReactNode> = {
  'schedule_call': <Phone className="h-3 w-3" />,
  'send_whatsapp': <MessageCircle className="h-3 w-3" />,
  'await_client': <Mail className="h-3 w-3" />
};

const nextActionLabels: Record<string, string> = {
  'schedule_call': 'Ligar',
  'send_whatsapp': 'WhatsApp',
  'await_client': 'Aguardar'
};

export function GeneratedReportsList() {
  const queryClient = useQueryClient();
  const [selectedReport, setSelectedReport] = useState<GeneratedReport | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: reports, isLoading, refetch } = useQuery({
    queryKey: ["generated-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as GeneratedReport[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ reportId, updates }: { reportId: string; updates: Partial<GeneratedReport> }) => {
      // V-1061 FIX: Add tenant_id filter
      const { error } = await supabase
        .from("generated_reports")
        .update(updates)
        .eq("id", reportId)
        .eq("tenant_id", activeTenant?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-reports"] });
      toast.success("Status atualizado!");
    },
    onError: () => {
      toast.error("Erro ao atualizar status");
    }
  });

  const handleStatusChange = (reportId: string, newStatus: string) => {
    const updates: Partial<GeneratedReport> = {
      sales_status: newStatus,
    };
    if (newStatus === "contacted") {
      updates.contacted_at = new Date().toISOString();
    }
    updateStatusMutation.mutate({ reportId, updates });
  };

  const handleScheduleConversation = (report: GeneratedReport) => {
    setSelectedReport(report);
    setModalOpen(true);
  };

  const handleStatusUpdateFromModal = (reportId: string, status: string) => {
    handleStatusChange(reportId, status);
  };

  // Calculate evolution indicator by comparing with previous report
  const getEvolutionIndicator = (report: GeneratedReport, allReports: GeneratedReport[]) => {
    // Find previous report for same agent/tenant
    const previousReports = allReports.filter(r => 
      r.id !== report.id &&
      r.agent_name === report.agent_name &&
      r.tenant_id === report.tenant_id &&
      new Date(r.created_at) < new Date(report.created_at)
    ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (previousReports.length === 0) return null;

    const previousScore = previousReports[0].risk_score || 0;
    const currentScore = report.risk_score || 0;
    const diff = currentScore - previousScore;

    if (diff > 5) {
      return { icon: <TrendingUp className="h-4 w-4 text-red-500" />, label: "Piorou", color: "text-red-500" };
    } else if (diff < -5) {
      return { icon: <TrendingDown className="h-4 w-4 text-green-500" />, label: "Melhorou", color: "text-green-500" };
    }
    return { icon: <Minus className="h-4 w-4 text-muted-foreground" />, label: "Estável", color: "text-muted-foreground" };
  };

  const handleDownloadJSON = (report: GeneratedReport) => {
    const blob = new Blob([JSON.stringify(report.report_data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laudo-${report.report_type}-${report.agent_name || 'todos'}-${new Date(report.created_at).toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Laudo baixado com sucesso!");
  };

  const handleDownloadCSV = (report: GeneratedReport) => {
    let csvContent = "";
    const data = report.report_data;
    
    if (data.software_inventory && data.software_inventory.length > 0) {
      csvContent += "INVENTÁRIO DE SOFTWARE\n";
      csvContent += "Nome,Versão,Fornecedor,Risco\n";
      data.software_inventory.forEach((sw: any) => {
        csvContent += `"${sw.name || ''}","${sw.version || ''}","${sw.vendor || ''}","${sw.risk_level || ''}"\n`;
      });
      csvContent += "\n";
    }
    
    if (data.vulnerabilities && data.vulnerabilities.length > 0) {
      csvContent += "VULNERABILIDADES\n";
      csvContent += "Severidade,Título,Descrição\n";
      data.vulnerabilities.forEach((vuln: any) => {
        csvContent += `"${vuln.severity || ''}","${vuln.title || vuln.check_key || ''}","${(vuln.description || '').replace(/"/g, '""')}"\n`;
      });
      csvContent += "\n";
    }
    
    if (data.antivirus_status && data.antivirus_status.length > 0) {
      csvContent += "STATUS ANTIVÍRUS\n";
      csvContent += "Engine,Versão,Status,Ameaças\n";
      data.antivirus_status.forEach((av: any) => {
        csvContent += `"${av.engine_name || ''}","${av.engine_version || ''}","${av.status || ''}","${av.threats_found || 0}"\n`;
      });
      csvContent += "\n";
    }
    
    if (data.web_activity && data.web_activity.length > 0) {
      csvContent += "ATIVIDADE WEB\n";
      csvContent += "Domínio,Fonte,Data\n";
      data.web_activity.forEach((web: any) => {
        csvContent += `"${web.domain || ''}","${web.source || ''}","${web.visited_at || ''}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laudo-${report.report_type}-${report.agent_name || 'todos'}-${new Date(report.created_at).toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Laudo CSV baixado com sucesso!");
  };

  const handleDelete = async (reportId: string) => {
    try {
      // V-1061 FIX: Add tenant_id filter
      const { error } = await supabase
        .from("generated_reports")
        .delete()
        .eq("id", reportId)
        .eq("tenant_id", activeTenant?.id);

      if (error) throw error;
      toast.success("Laudo excluído com sucesso!");
      refetch();
    } catch (error) {
      console.error("Error deleting report:", error);
      toast.error("Erro ao excluir laudo");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Laudos Gerados</CardTitle>
          <CardDescription>Carregando...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Laudos Gerados Automaticamente
            </CardTitle>
            <CardDescription>
              Laudos são gerados automaticamente quando jobs de coleta são concluídos. Gerencie o pipeline comercial.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {!reports || reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum laudo gerado ainda.</p>
              <p className="text-sm">Os laudos são gerados automaticamente quando tarefas de segurança são concluídas.</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {reports.map((report) => {
                  const evolution = getEvolutionIndicator(report, reports);
                  
                  return (
                    <div
                      key={report.id}
                      className="flex flex-col lg:flex-row lg:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4"
                    >
                      {/* Left: Report Info */}
                      <div className="flex items-start gap-4 flex-1">
                        <div className="p-2 bg-muted rounded-lg">
                          {reportTypeIcons[report.report_type] || <FileText className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium flex flex-wrap items-center gap-2">
                            <span className="truncate">{report.title}</span>
                            {report.risk_level && (
                              <Badge className={`${riskLevelColors[report.risk_level] || 'bg-gray-500'} text-white text-xs`}>
                                {report.risk_level} ({report.risk_score || 0})
                              </Badge>
                            )}
                            {evolution && (
                              <span className={`flex items-center gap-1 text-xs ${evolution.color}`} title={evolution.label}>
                                {evolution.icon}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                            <span>{reportTypeLabels[report.report_type] || report.report_type}</span>
                            <span>•</span>
                            <Badge variant="outline" className="text-xs">
                              {triggeredByLabels[report.triggered_by] || report.triggered_by}
                            </Badge>
                            <span>•</span>
                            <span title={formatBrazilDateTime(report.created_at)}>
                              {formatRelativeTime(report.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: Commercial Status */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Select
                          value={report.sales_status || "open"}
                          onValueChange={(value) => handleStatusChange(report.id, value)}
                        >
                          <SelectTrigger className="w-[130px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(salesStatusLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${salesStatusColors[value]}`} />
                                  {label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {report.next_action && (
                          <Badge variant="secondary" className="text-xs flex items-center gap-1">
                            {nextActionIcons[report.next_action]}
                            {nextActionLabels[report.next_action] || report.next_action}
                          </Badge>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleScheduleConversation(report)}
                          className="bg-green-600 hover:bg-green-700"
                          title="Agendar Conversa"
                        >
                          <MessageCircle className="h-4 w-4 mr-1" />
                          Contatar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadJSON(report)}
                          title="Baixar JSON"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          JSON
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadCSV(report)}
                          title="Baixar CSV"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          CSV
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/verificar/${(report as any).audit_id || report.id}`, '_blank')}
                          title="Verificar autenticidade (abre em nova aba)"
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Verificar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(report.id)}
                          className="text-destructive hover:text-destructive"
                          title="Excluir laudo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <ScheduleConversationModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        report={selectedReport}
        onStatusUpdate={handleStatusUpdateFromModal}
      />
    </>
  );
}
