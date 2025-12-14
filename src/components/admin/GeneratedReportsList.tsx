import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileText, Trash2, RefreshCw, Shield, Bug, Globe, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { formatBrazilDateTime, formatRelativeTime } from "@/lib/date-utils";

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

export function GeneratedReportsList() {
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
    
    // Build CSV based on report type
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
      const { error } = await supabase
        .from("generated_reports")
        .delete()
        .eq("id", reportId);

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Laudos Gerados Automaticamente
          </CardTitle>
          <CardDescription>
            Laudos são gerados automaticamente quando jobs de coleta de segurança são concluídos
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
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-lg">
                      {reportTypeIcons[report.report_type] || <FileText className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {report.title}
                        {report.risk_level && (
                          <Badge className={`${riskLevelColors[report.risk_level] || 'bg-gray-500'} text-white text-xs`}>
                            {report.risk_level} ({report.risk_score || 0})
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
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
                  <div className="flex items-center gap-2">
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
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
