import { useState } from "react";
import { Shield, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_URL = `${SUPABASE_URL}/functions/v1`;

interface Report {
  id: string;
  kind: string;
  createdUtc: string;
  file: string;
}

const Index = () => {
  const [agentName, setAgentName] = useState("AGENTE-01");
  const [agentToken, setAgentToken] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState<string | null>(null);

  const enrollAgent = async () => {
    if (!agentName.trim()) {
      toast.error("Nome do agente é obrigatório");
      return;
    }

    setIsEnrolling(true);
    try {
      const res = await fetch(`${API_URL}/enroll-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: "dev",
          enrollmentKey: "DEV-KEY-123",
          agentName: agentName.trim(),
        }),
      });

      if (!res.ok) throw new Error("Falha na matrícula");

      const data = await res.json();
      setAgentToken(data.agentToken);
      toast.success("Agente matriculado com sucesso");
    } catch (error) {
      toast.error("Falha ao matricular agente");
    } finally {
      setIsEnrolling(false);
    }
  };

  const createJob = async (type: string, label: string) => {
    setIsCreatingJob(type);
    try {
      const res = await fetch(`${API_URL}/create-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": "DEV-ADMIN",
        },
        body: JSON.stringify({
          agentName: agentName.trim(),
          type,
          approved: true,
        }),
      });

      if (!res.ok) throw new Error("Falha ao criar job");

      toast.success(`Job criado: ${label}`);
    } catch (error) {
      toast.error(`Falha ao criar job: ${label}`);
    } finally {
      setIsCreatingJob(null);
    }
  };

  const loadReports = async () => {
    if (!agentToken) {
      toast.error("Matricule um agente primeiro para ver relatórios");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/list-reports`, {
        headers: { "X-Agent-Token": agentToken },
      });

      if (!res.ok) throw new Error("Falha ao carregar relatórios");

      const data = await res.json();
      setReports(data);
      toast.success(`${data.length} relatórios carregados`);
    } catch (error) {
      toast.error("Falha ao carregar relatórios");
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
              <Shield className="h-8 w-8 text-primary animate-pulse-glow" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                CyberShield Panel
              </h1>
              <p className="text-sm text-muted-foreground">Painel de Operações de Segurança</p>
            </div>
          </div>
        </div>

        {/* Agent Enrollment */}
        <Card className="bg-gradient-card border-primary/20 animate-slide-in">
          <CardHeader>
            <CardTitle className="text-foreground">Matrícula de Agente</CardTitle>
            <CardDescription>Registre um novo agente de segurança na plataforma</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Input
                placeholder="Digite o nome do agente (ex: AGENTE-01)"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="bg-secondary border-border text-foreground"
              />
              <Button onClick={enrollAgent} disabled={isEnrolling}>
                {isEnrolling ? "Matriculando..." : "Matricular Agente"}
              </Button>
            </div>

            {agentToken && (
              <div className="space-y-2 p-4 bg-secondary/50 rounded-lg border border-accent/20">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <p className="text-sm font-semibold text-success">Token do Agente Gerado</p>
                </div>
                <code className="block text-xs font-mono break-all text-muted-foreground bg-background/50 p-2 rounded">
                  {agentToken}
                </code>
                <p className="text-xs text-muted-foreground">
                  Configure este token no arquivo de configuração do seu agente para estabelecer a conexão.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Job Control */}
        <Card className="bg-gradient-card border-primary/20 animate-slide-in">
          <CardHeader>
            <CardTitle className="text-foreground">Operações de Segurança</CardTitle>
            <CardDescription>Execute scans de segurança e tarefas de remediação</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4 bg-secondary/50 hover:bg-secondary border-border hover:border-primary/50 transition-all"
                onClick={() => createJob("local_checks", "Verificações Locais de Segurança")}
                disabled={isCreatingJob !== null}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="font-semibold">Verificações Locais</span>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  Firewall, SMBv1, RDP NLA, status do Windows Update
                </span>
              </Button>

              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4 bg-secondary/50 hover:bg-secondary border-border hover:border-warning/50 transition-all"
                onClick={() => createJob("scan_nmap", "Scan de Rede (Nmap)")}
                disabled={isCreatingJob !== null}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-warning" />
                  <span className="font-semibold">Scan Nmap</span>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  Descoberta de rede e detecção de serviços
                </span>
              </Button>

              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4 bg-secondary/50 hover:bg-secondary border-border hover:border-destructive/50 transition-all"
                onClick={() => createJob("remediate_standard", "Remediação Padrão")}
                disabled={isCreatingJob !== null}
              >
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="font-semibold">Remediação Automática</span>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  Ativar firewall, desativar SMBv1, configurar RDP NLA
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Reports */}
        <Card className="bg-gradient-card border-primary/20 animate-slide-in">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-foreground">Relatórios de Segurança</CardTitle>
              <CardDescription>Visualize relatórios de segurança gerados e resultados de scans</CardDescription>
            </div>
            <Button onClick={loadReports} variant="secondary" size="sm" disabled={!agentToken}>
              Atualizar Relatórios
            </Button>
          </CardHeader>
          <CardContent>
            {!agentToken ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Matricule um agente para visualizar relatórios</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum relatório disponível. Crie e execute jobs para gerar relatórios.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border hover:border-primary/30 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {report.kind}
                        </Badge>
                        <span className="text-sm font-mono text-foreground">{report.file}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(report.createdUtc + "Z").toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
