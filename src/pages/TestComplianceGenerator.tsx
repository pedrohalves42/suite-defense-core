import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, FileText, ExternalLink, Shield, Monitor, AlertTriangle, Server } from "lucide-react";
import { callEdgeFunction } from "@/lib/edge-function-client";
import { Link } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { logger } from '@/lib/logger';

interface GeneratedReport {
  name: string;
  template: string;
  category: "compliance" | "security" | "operational";
  audit_id: string;
  sha256: string;
  hmac_signature: string;
  status: "pending" | "success" | "error";
  error?: string;
}

interface AgentInfo {
  id: string;
  agent_name: string;
  hostname: string | null;
  status: string;
  os_type: string | null;
  agent_version: string | null;
  last_heartbeat: string | null;
}

const REPORT_TEMPLATES = [
  { name: "LGPD", template: "LGPD", category: "compliance" as const, description: "Lei Geral de Proteção de Dados" },
  { name: "ISO 27001", template: "ISO_27001", category: "compliance" as const, description: "Gestão de Segurança da Informação" },
  { name: "SOC2-lite", template: "SOC2_LITE", category: "compliance" as const, description: "Trust Services Criteria" },
];

export default function TestComplianceGenerator() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [stats, setStats] = useState({ totalAgents: 0, onlineAgents: 0, totalVulns: 0 });

  // Load agents when tenant is available
  useEffect(() => {
    async function loadAgents() {
      if (!tenant?.id) return;
      
      setLoadingAgents(true);
      try {
        // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
        const { data: rawData, error } = await supabase.rpc('get_agents_list', {
          p_tenant_id: tenant.id,
          p_include_archived: false,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = ((rawData as any[]) || [])
          .sort((a: any, b: any) => (a.agent_name || '').localeCompare(b.agent_name || ''));
        
        if (error) throw error;
        setAgents((data || []) as AgentInfo[]);

        const onlineCount = (data || []).filter((a: any) => a.status === "active").length;
        
        // Get vulnerability count
        const { count: vulnCount } = await supabase
          .from("vuln_findings")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenant.id);

        setStats({
          totalAgents: data?.length || 0,
          onlineAgents: onlineCount,
          totalVulns: vulnCount || 0,
        });
      } catch (err) {
        logger.error("Error loading agents:", err);
      } finally {
        setLoadingAgents(false);
      }
    }
    loadAgents();
  }, [tenant?.id]);

  const generateAllReports = async () => {
    if (!tenant?.id) {
      logger.error("No tenant found for current user");
      return;
    }
    
    // Generating reports for tenant
    setIsGenerating(true);
    
    // Initialize all reports as pending
    setReports(REPORT_TEMPLATES.map(t => ({ 
      name: t.name,
      template: t.template, 
      category: t.category,
      audit_id: "", 
      sha256: "", 
      hmac_signature: "", 
      status: "pending" 
    })));

    // Generate each report sequentially
    for (let i = 0; i < REPORT_TEMPLATES.length; i++) {
      const reportConfig = REPORT_TEMPLATES[i];
      try {
        const result = await callEdgeFunction("report-router", {
          action: 'compliance',
          payload: {
            tenant_id: tenant.id,
            template_type: reportConfig.template,
            generated_by: "test-automation",
          },
        });

        setReports(prev => prev.map((r, idx) => 
          idx === i ? { 
            ...r, 
            status: "success", 
            audit_id: result.audit_id || result.payload?.audit_id || "",
            sha256: result.payload?.sha256 || result.sha256 || "",
            hmac_signature: result.payload?.hmac_signature || result.hmac_signature || "",
          } : r
        ));
      } catch (error) {
        logger.error(`Error generating ${reportConfig.name}:`, error);
        setReports(prev => prev.map((r, idx) => 
          idx === i ? { ...r, status: "error", error: error.message } : r
        ));
      }
    }

    setIsGenerating(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "text-green-500";
      case "inactive": return "text-yellow-500";
      default: return "text-muted-foreground";
    }
  };

  const formatLastSeen = (heartbeat: string | null) => {
    if (!heartbeat) return "Nunca";
    const date = new Date(heartbeat);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 5) return "Agora";
    if (diffMins < 60) return `${diffMins}min atrás`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h atrás`;
    return `${Math.floor(diffMins / 1440)}d atrás`;
  };

  if (tenantLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <FileText className="h-7 w-7" />
                  Gerador de Relatórios
                </CardTitle>
                <CardDescription className="mt-2">
                  Gere relatórios de compliance com hashes criptográficos para todas as máquinas do seu tenant
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold">{tenant?.name || "N/A"}</p>
                <p className="text-sm text-muted-foreground">ID: {tenant?.id?.slice(0, 8)}...</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Monitor className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalAgents}</p>
                  <p className="text-sm text-muted-foreground">Máquinas Monitoradas</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Server className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.onlineAgents}</p>
                  <p className="text-sm text-muted-foreground">Online Agora</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalVulns}</p>
                  <p className="text-sm text-muted-foreground">Vulnerabilidades</p>
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <Button 
              onClick={generateAllReports} 
              disabled={isGenerating || !tenant?.id}
              size="lg"
              className="w-full md:w-auto"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando Relatórios...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Gerar Todos os Relatórios de Compliance
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {reports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Relatórios de Compliance
              </CardTitle>
              <CardDescription>
                Relatórios com hashes SHA256 e assinatura HMAC para verificação de integridade
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {reports.map((report, idx) => (
                <Card key={idx} className="border-l-4" style={{ 
                  borderLeftColor: report.status === "success" ? "hsl(var(--primary))" : 
                                   report.status === "error" ? "hsl(var(--destructive))" : 
                                   "hsl(var(--muted))" 
                }}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {report.status === "pending" && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                        {report.status === "success" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                        {report.status === "error" && <XCircle className="h-5 w-5 text-destructive" />}
                        <div>
                          <span className="font-semibold">{report.name}</span>
                          <p className="text-sm text-muted-foreground">
                            {REPORT_TEMPLATES.find(t => t.template === report.template)?.description}
                          </p>
                        </div>
                        <Badge variant={report.status === "success" ? "default" : report.status === "error" ? "destructive" : "secondary"}>
                          {report.status === "success" ? "Gerado" : report.status === "error" ? "Erro" : "Gerando..."}
                        </Badge>
                      </div>
                      {report.status === "success" && report.audit_id && (
                        <Link 
                          to={`/verificar/${report.audit_id}`}
                          className="text-sm text-primary hover:underline flex items-center gap-1"
                        >
                          Verificar <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                    
                    {report.status === "success" && (
                      <div className="mt-4 p-3 bg-muted/50 rounded-lg space-y-2 text-sm font-mono">
                        <p><strong className="text-muted-foreground">Audit ID:</strong> {report.audit_id}</p>
                        <p><strong className="text-muted-foreground">SHA256:</strong> {report.sha256?.slice(0, 32)}...</p>
                        <p><strong className="text-muted-foreground">HMAC:</strong> {report.hmac_signature?.slice(0, 32)}...</p>
                      </div>
                    )}
                    
                    {report.status === "error" && (
                      <p className="mt-3 text-sm text-destructive bg-destructive/10 p-2 rounded">{report.error}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Agents List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Máquinas do Tenant ({agents.length})
            </CardTitle>
            <CardDescription>
              Todas as máquinas monitoradas incluídas nos relatórios
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAgents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : agents.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma máquina encontrada para este tenant.
              </p>
            ) : (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <div 
                    key={agent.id} 
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${agent.status === "active" ? "bg-green-500" : "bg-muted-foreground"}`} />
                      <div>
                        <p className="font-medium">{agent.agent_name || agent.hostname || "Sem nome"}</p>
                        <p className="text-xs text-muted-foreground">
                          {agent.os_type || "OS desconhecido"} • v{agent.agent_version || "?"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={agent.status === "active" ? "default" : "secondary"} className="text-xs">
                        {agent.status === "active" ? "Online" : "Offline"}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatLastSeen(agent.last_heartbeat)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
