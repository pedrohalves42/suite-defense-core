import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Loader2, Shield, AlertTriangle, Bug, Globe, FileWarning, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

interface Agent {
  id: string;
  agent_name: string;
  status: string;
}

interface SecurityReport {
  success?: boolean;
  generated_at: string;
  tenant_id: string;
  agent_filter: string;
  statistics: {
    total_agents: number;
    total_software: number;
    total_vulnerabilities: number;
    critical_vulnerabilities: number;
    high_vulnerabilities: number;
    medium_vulnerabilities?: number;
    low_vulnerabilities?: number;
    antivirus_engines: number;
    threats_found: number;
    unique_domains: number;
    malicious_scans: number;
    total_scans: number;
    security_events: number;
  };
  data?: {
    agents: any[];
    software_inventory: any[];
    vulnerabilities: any[];
    antivirus_status: any[];
    web_activity: any[];
    virus_scans: any[];
    security_events: any[];
  };
}

export default function Reports() {
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, agent_name, status")
        .eq("status", "active")
        .order("agent_name");

      if (error) throw error;
      return data as Agent[];
    },
  });

  const { data: report, refetch: refetchReport, isLoading: isLoadingReport } = useQuery({
    queryKey: ["security-report", selectedAgent],
    queryFn: async () => {
      const params = new URLSearchParams({ format: "summary" });
      if (selectedAgent !== "all") {
        params.append("agent_id", selectedAgent);
      }

      const { data, error } = await supabase.functions.invoke(
        `generate-security-report?${params.toString()}`,
        { method: "GET" }
      );

      if (error) throw error;
      return data as SecurityReport;
    },
    enabled: false,
  });

  const handleGenerateReport = async (downloadFull: boolean = false) => {
    setIsGenerating(true);
    try {
      const params = new URLSearchParams();
      if (selectedAgent !== "all") {
        params.append("agent_id", selectedAgent);
      }

      if (downloadFull) {
        params.append("format", "json");
      } else {
        params.append("format", "summary");
      }

      const { data, error } = await supabase.functions.invoke(
        `generate-security-report?${params.toString()}`,
        { method: "GET" }
      );

      if (error) throw error;

      if (downloadFull) {
        // Download full report as JSON
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `security-report-${selectedAgent}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast.success("Relatório completo baixado com sucesso!");
      } else {
        // Refresh summary
        await refetchReport();
        toast.success("Relatório de segurança gerado com sucesso!");
      }
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Erro ao gerar relatório: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportCSV = async () => {
    setIsGenerating(true);
    try {
      const params = new URLSearchParams({ format: "json" });
      if (selectedAgent !== "all") {
        params.append("agent_id", selectedAgent);
      }

      const { data, error } = await supabase.functions.invoke(
        `generate-security-report?${params.toString()}`,
        { method: "GET" }
      );

      if (error) throw error;

      const reportData = data as SecurityReport;
      
      // Generate CSV content
      let csvContent = "";
      
      // Header section
      csvContent += "RELATÓRIO DE SEGURANÇA CYBERSHIELD\n";
      csvContent += `Data de Geração:,${new Date(reportData.generated_at).toLocaleString("pt-BR")}\n`;
      csvContent += `Filtro:,${reportData.agent_filter === "all" ? "Todos os Agentes" : reportData.agent_filter}\n\n`;
      
      // Statistics section
      csvContent += "ESTATÍSTICAS GERAIS\n";
      csvContent += `Agentes Ativos:,${reportData.statistics.total_agents}\n`;
      csvContent += `Software Inventariado:,${reportData.statistics.total_software}\n`;
      csvContent += `Vulnerabilidades Total:,${reportData.statistics.total_vulnerabilities}\n`;
      csvContent += `Vulnerabilidades Críticas:,${reportData.statistics.critical_vulnerabilities}\n`;
      csvContent += `Vulnerabilidades Altas:,${reportData.statistics.high_vulnerabilities}\n`;
      csvContent += `Engines Antivírus:,${reportData.statistics.antivirus_engines}\n`;
      csvContent += `Ameaças Detectadas:,${reportData.statistics.threats_found}\n`;
      csvContent += `Domínios Únicos:,${reportData.statistics.unique_domains}\n`;
      csvContent += `Scans Maliciosos:,${reportData.statistics.malicious_scans}/${reportData.statistics.total_scans}\n`;
      csvContent += `Eventos de Segurança:,${reportData.statistics.security_events}\n\n`;

      // Software Inventory
      if (reportData.data?.software_inventory && reportData.data.software_inventory.length > 0) {
        csvContent += "INVENTÁRIO DE SOFTWARE\n";
        csvContent += "Nome,Versão,Fornecedor,Nível de Risco,Última Atualização\n";
        reportData.data.software_inventory.forEach((sw: any) => {
          csvContent += `"${sw.name || ''}","${sw.version || ''}","${sw.vendor || ''}","${sw.risk_level || ''}","${sw.last_seen_at || ''}"\n`;
        });
        csvContent += "\n";
      }

      // Vulnerabilities
      if (reportData.data?.vulnerabilities && reportData.data.vulnerabilities.length > 0) {
        csvContent += "VULNERABILIDADES\n";
        csvContent += "CVE,Severidade,Software,Descrição,Status\n";
        reportData.data.vulnerabilities.forEach((vuln: any) => {
          csvContent += `"${vuln.cve_id || ''}","${vuln.severity || ''}","${vuln.affected_software || ''}","${(vuln.description || '').replace(/"/g, '""')}","${vuln.status || ''}"\n`;
        });
        csvContent += "\n";
      }

      // Antivirus Status
      if (reportData.data?.antivirus_status && reportData.data.antivirus_status.length > 0) {
        csvContent += "STATUS DO ANTIVÍRUS\n";
        csvContent += "Engine,Versão,Status,Última Atualização,Ameaças Encontradas\n";
        reportData.data.antivirus_status.forEach((av: any) => {
          csvContent += `"${av.engine_name || ''}","${av.engine_version || ''}","${av.status || ''}","${av.last_update_at || ''}","${av.threats_found || 0}"\n`;
        });
        csvContent += "\n";
      }

      // Web Activity (top 50)
      if (reportData.data?.web_activity && reportData.data.web_activity.length > 0) {
        csvContent += "ATIVIDADE WEB (Últimos 50)\n";
        csvContent += "Domínio,URL,Visitado Em,Fonte\n";
        reportData.data.web_activity.slice(0, 50).forEach((web: any) => {
          csvContent += `"${web.domain || ''}","${web.url || ''}","${web.visited_at || ''}","${web.source || ''}"\n`;
        });
        csvContent += "\n";
      }

      // Download CSV
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-seguranca-${selectedAgent}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success("Relatório CSV baixado com sucesso!");
    } catch (error) {
      console.error("Error exporting CSV:", error);
      toast.error("Erro ao exportar CSV: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            Relatórios de Segurança
          </h1>
          <p className="text-muted-foreground mt-2">
            Gere relatórios consolidados de todos os dados de segurança coletados
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Gerar Relatório</CardTitle>
          <CardDescription>
            Selecione um agente específico ou gere relatório de todos os agentes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Agente</label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Agentes</SelectItem>
                  {agents?.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.agent_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => handleGenerateReport(false)}
              disabled={isGenerating || isLoadingReport}
            >
              {(isGenerating || isLoadingReport) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <FileText className="mr-2 h-4 w-4" />
              Gerar Sumário
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={isGenerating}
            >
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleGenerateReport(true)}
              disabled={isGenerating}
            >
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Download className="mr-2 h-4 w-4" />
              JSON Completo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Summary */}
      {report && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Sumário do Relatório</span>
                <Badge variant="outline">
                  {new Date(report.generated_at).toLocaleString("pt-BR")}
                </Badge>
              </CardTitle>
              <CardDescription>
                Filtro: {report.agent_filter === "all" ? "Todos os Agentes" : `Agente ${report.agent_filter}`}
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Agentes Ativos</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.statistics.total_agents}</div>
                <p className="text-xs text-muted-foreground">Monitorados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Software Inventariado</CardTitle>
                <FileWarning className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.statistics.total_software}</div>
                <p className="text-xs text-muted-foreground">Aplicações instaladas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vulnerabilidades</CardTitle>
                <Bug className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {report.statistics.total_vulnerabilities}
                </div>
                <p className="text-xs text-muted-foreground">
                  {report.statistics.critical_vulnerabilities} críticas, {report.statistics.high_vulnerabilities} altas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Antivírus</CardTitle>
                <Shield className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.statistics.antivirus_engines}</div>
                <p className="text-xs text-muted-foreground">
                  {report.statistics.threats_found} ameaças detectadas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Atividade Web</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.statistics.unique_domains}</div>
                <p className="text-xs text-muted-foreground">Domínios únicos acessados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Scans de Vírus</CardTitle>
                <AlertTriangle className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {report.statistics.malicious_scans}/{report.statistics.total_scans}
                </div>
                <p className="text-xs text-muted-foreground">Arquivos maliciosos detectados</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
