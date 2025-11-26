import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Loader2, Shield, AlertTriangle, Bug, Globe, FileWarning } from "lucide-react";
import { toast } from "sonner";

interface Agent {
  id: string;
  agent_name: string;
  status: string;
}

interface SecurityReport {
  generated_at: string;
  tenant_id: string;
  agent_filter: string;
  statistics: {
    total_agents: number;
    total_software: number;
    total_vulnerabilities: number;
    critical_vulnerabilities: number;
    high_vulnerabilities: number;
    antivirus_engines: number;
    threats_found: number;
    unique_domains: number;
    malicious_scans: number;
    total_scans: number;
    security_events: number;
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
          <div className="flex gap-4 items-end">
            <div className="flex-1">
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
              onClick={() => handleGenerateReport(true)}
              disabled={isGenerating}
            >
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Download className="mr-2 h-4 w-4" />
              Baixar Completo (JSON)
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
