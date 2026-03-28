import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2, XCircle, AlertTriangle, Lock, Shield,
  Calendar, Monitor, Bug
} from "lucide-react";
import { HashBadge } from "@/components/ui/hash-badge";
import { formatBrazilDateTime } from "@/lib/date-utils";
import type { ComplianceReportPayload } from "./types";
import { FRIENDLY_INVARIANT_NAMES } from "./types";

interface ReportTabsProps {
  reportPayload: ComplianceReportPayload;
}

export function ReportTabs({ reportPayload }: ReportTabsProps) {
  return (
    <Tabs defaultValue="resumo">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="resumo">Proteções</TabsTrigger>
        <TabsTrigger value="recomendacoes">Recomendações</TabsTrigger>
        <TabsTrigger value="politicas">Sites Bloqueados</TabsTrigger>
        <TabsTrigger value="tecnico">Dados Técnicos</TabsTrigger>
      </TabsList>

      <TabsContent value="resumo" className="pt-4">
        <InvariantsTab reportPayload={reportPayload} />
      </TabsContent>

      <TabsContent value="recomendacoes" className="pt-4">
        <RecommendationsTab reportPayload={reportPayload} />
      </TabsContent>

      <TabsContent value="politicas" className="pt-4">
        <PoliciesTab reportPayload={reportPayload} />
      </TabsContent>

      <TabsContent value="tecnico" className="space-y-4 pt-4">
        <TechnicalTab reportPayload={reportPayload} />
      </TabsContent>
    </Tabs>
  );
}

function InvariantsTab({ reportPayload }: { reportPayload: ComplianceReportPayload }) {
  return (
    <div className="space-y-3">
      {reportPayload.invariants.map((inv) => {
        const friendly = FRIENDLY_INVARIANT_NAMES[inv.id] || { name: inv.name, description: inv.description };

        return (
          <div key={inv.id} className="flex items-center justify-between p-4 bg-card border rounded-lg">
            <div className="flex items-center gap-3">
              {inv.status === "PASS" ? (
                <div className="p-2 bg-success/20 rounded-full">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
              ) : inv.status === "FAIL" ? (
                <div className="p-2 bg-destructive/20 rounded-full">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
              ) : (
                <div className="p-2 bg-warning/20 rounded-full">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
              )}
              <div>
                <p className="font-medium text-foreground">{friendly.name}</p>
                <p className="text-sm text-muted-foreground">{friendly.description}</p>
              </div>
            </div>
            <Badge variant={inv.status === "PASS" ? "default" : inv.status === "FAIL" ? "destructive" : "secondary"} className="text-sm">
              {inv.status === "PASS" ? "Ativo" : inv.status === "FAIL" ? "Atenção" : "Pendente"}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

function RecommendationsTab({ reportPayload }: { reportPayload: ComplianceReportPayload }) {
  const execSummary = (reportPayload as unknown as Record<string, unknown>).executive_summary as Record<string, unknown> | undefined;
  const recs = (execSummary?.recommendations || []) as string[];

  return (
    <div className="space-y-4">
      {recs.length > 0 ? (
        <BackendRecommendations recs={recs} reportPayload={reportPayload} />
      ) : (
        <FallbackRecommendations reportPayload={reportPayload} />
      )}

      <Separator className="my-4" />
      <div className="p-4 bg-muted/30 rounded-lg">
        <h4 className="font-semibold mb-2 text-sm">Próximos Passos</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            Baixe o PDF para registro e documentação
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            Revise as recomendações com sua equipe de TI
          </li>
          <li className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            Próxima análise recomendada: {formatBrazilDateTime(reportPayload.valid_until, "short")}
          </li>
        </ul>
      </div>
    </div>
  );
}

function BackendRecommendations({ recs, reportPayload }: { recs: string[]; reportPayload: ComplianceReportPayload }) {
  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
        Ações Recomendadas
      </h4>
      {recs.map((rec: string, idx: number) => (
        <div key={idx} className="flex items-start gap-3 p-4 bg-card border rounded-lg">
          <div className={`p-1.5 rounded-full shrink-0 ${
            idx === 0 && (reportPayload.statistics?.critical_vulnerabilities || 0) > 0
              ? 'bg-destructive/20'
              : idx < 2 ? 'bg-warning/20' : 'bg-muted'
          }`}>
            <span className="font-bold text-xs w-5 h-5 flex items-center justify-center">
              {idx + 1}
            </span>
          </div>
          <div className="flex-1">
            <p className="font-medium text-foreground">{rec}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {idx === 0 ? "Prioridade alta - resolver esta semana" :
               idx === 1 ? "Prioridade média - resolver em 2 semanas" :
               "Melhoria contínua"}
            </p>
          </div>
          <Badge variant={
            idx === 0 && (reportPayload.statistics?.critical_vulnerabilities || 0) > 0
              ? "destructive"
              : reportPayload.risk_score >= 70 && idx === 0 ? "outline"
              : idx < 2 ? "secondary" : "outline"
          } className="shrink-0">
            {reportPayload.risk_score >= 70 && idx === 0 ? "Sucesso" : idx === 0 ? "Urgente" : idx === 1 ? "Importante" : "Sugestão"}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function FallbackRecommendations({ reportPayload }: { reportPayload: ComplianceReportPayload }) {
  const criticalVulns = reportPayload.statistics?.critical_vulnerabilities || 0;
  const highVulns = reportPayload.statistics?.high_vulnerabilities || 0;
  const threats = reportPayload.statistics?.threats_found || 0;
  const stats = reportPayload.statistics as Record<string, unknown> | undefined;
  const offlineAgents = Number(stats?.offline_agents || 0);
  const avOutdated = Number(stats?.av_outdated || 0);
  const failedInvariants = reportPayload.invariants.filter(i => i.status === "FAIL");

  const recommendations: { icon: React.ReactNode; text: string; priority: string; detail: string }[] = [];

  if (criticalVulns > 0) {
    recommendations.push({
      icon: <XCircle className="h-5 w-5 text-destructive" />,
      text: `Corrigir ${criticalVulns} vulnerabilidade(s) crítica(s)`,
      detail: "Atualizar softwares afetados ou aplicar patches de segurança",
      priority: "Urgente"
    });
  }
  if (highVulns > 0) {
    recommendations.push({
      icon: <AlertTriangle className="h-5 w-5 text-orange-500" />,
      text: `Revisar ${highVulns} vulnerabilidade(s) de alta severidade`,
      detail: "Avaliar impacto e planejar correções para esta semana",
      priority: "Alto"
    });
  }
  if (threats > 0) {
    recommendations.push({
      icon: <Bug className="h-5 w-5 text-warning" />,
      text: `Investigar ${threats} ameaça(s) detectada(s)`,
      detail: "Verificar relatórios do antivírus e isolar máquinas se necessário",
      priority: "Alto"
    });
  }
  if (offlineAgents > 0) {
    recommendations.push({
      icon: <Monitor className="h-5 w-5 text-muted-foreground" />,
      text: `Verificar ${offlineAgents} computador(es) offline`,
      detail: "Checar se estão desligados ou com problemas de conexão",
      priority: "Médio"
    });
  }
  if (avOutdated > 0) {
    recommendations.push({
      icon: <Shield className="h-5 w-5 text-warning" />,
      text: `Atualizar antivírus em ${avOutdated} computador(es)`,
      detail: "Definições de vírus desatualizadas reduzem a proteção",
      priority: "Médio"
    });
  }
  if (failedInvariants.length > 0) {
    recommendations.push({
      icon: <Lock className="h-5 w-5 text-warning" />,
      text: `Verificar ${failedInvariants.length} controle(s) de segurança`,
      detail: "Revisar configurações de proteção não conformes",
      priority: "Médio"
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      icon: <CheckCircle2 className="h-5 w-5 text-success" />,
      text: "Parabéns! Sua segurança está em dia",
      detail: "Continue monitorando e mantendo as boas práticas",
      priority: "Sucesso"
    });
  }

  return (
    <div className="space-y-3">
      {recommendations.map((rec, idx) => (
        <div key={idx} className="flex items-start gap-3 p-4 bg-card border rounded-lg">
          <div className="p-2 bg-muted rounded-full shrink-0">
            {rec.icon}
          </div>
          <div className="flex-1">
            <p className="font-medium text-foreground">{rec.text}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{rec.detail}</p>
          </div>
          <Badge variant={
            rec.priority === "Urgente" ? "destructive" :
            rec.priority === "Alto" ? "default" :
            rec.priority === "Médio" ? "secondary" :
            rec.priority === "Sucesso" ? "outline" : "outline"
          } className="shrink-0">
            {rec.priority}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function PoliciesTab({ reportPayload }: { reportPayload: ComplianceReportPayload }) {
  if (reportPayload.active_policies.length > 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground mb-4">
          Sites e categorias bloqueadas para proteção dos usuários:
        </p>
        {reportPayload.active_policies.map((policy) => (
          <div key={policy.id} className="flex items-center justify-between p-3 bg-card border rounded-lg">
            <div>
              <p className="font-mono text-sm text-foreground">{policy.domain_pattern}</p>
              <p className="text-xs text-muted-foreground">{policy.reason || "Política de segurança"}</p>
            </div>
            <Badge variant={policy.is_active ? "default" : "secondary"}>
              {policy.is_active ? "Ativo" : "Inativo"}
            </Badge>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
      <p className="text-muted-foreground">
        Nenhuma política de bloqueio configurada.
      </p>
      <p className="text-sm text-muted-foreground">
        Configure políticas de DNS para bloquear sites perigosos.
      </p>
    </div>
  );
}

function TechnicalTab({ reportPayload }: { reportPayload: ComplianceReportPayload }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Dados técnicos para verificação de autenticidade do relatório.
      </p>
      <div className="grid gap-4">
        <div className="p-4 bg-success/10 border border-success/30 rounded-lg space-y-2">
          <p className="text-sm font-medium text-success">
            Código de Integridade (SHA256)
          </p>
          <HashBadge value={reportPayload.sha256} variant="sha256" truncateLength={32} />
          <p className="text-xs text-muted-foreground">
            Este código muda se o documento for alterado.
          </p>
        </div>

        <div className="p-4 bg-info/10 border border-info/30 rounded-lg space-y-2">
          <p className="text-sm font-medium text-info">
            Assinatura Digital (HMAC)
          </p>
          <HashBadge value={reportPayload.hmac_signature} variant="hmac" truncateLength={32} />
          <p className="text-xs text-muted-foreground">
            Comprova que o relatório foi gerado pelo sistema CyberShield.
          </p>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">ID do Relatório:</span>
            <p className="font-mono text-foreground">{reportPayload.audit_id}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Válido até:</span>
            <p className="font-medium text-foreground">{formatBrazilDateTime(reportPayload.valid_until, "full")}</p>
          </div>
        </div>
      </div>
    </>
  );
}
