import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { RiskGauge } from "@/components/ui/risk-gauge";
import { ComplianceBadge } from "@/components/ui/compliance-badge";
import { StatHighlight } from "@/components/ui/stat-highlight";
import type { ComplianceReportPayload } from "./types";

interface ReportSummaryCardsProps {
  reportPayload: ComplianceReportPayload;
}

export function ReportSummaryCards({ reportPayload }: ReportSummaryCardsProps) {
  const riskLaymanDesc = (reportPayload as Record<string, unknown>).risk_layman_description;

  return (
    <>
      {/* Risk Gauge + Compliance Badge + Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
        <div className="flex flex-col items-center justify-center p-6 bg-card border rounded-xl">
          <RiskGauge
            score={reportPayload.risk_score}
            level={reportPayload.risk_level}
            size="lg"
          />
          <p className="text-xs text-muted-foreground text-center mt-3 max-w-[200px]">
            {String(riskLaymanDesc || reportPayload.risk_description)}
          </p>
        </div>

        <div className="flex flex-col justify-center">
          <ComplianceBadge
            status={
              reportPayload.risk_level === "EXCELENTE" || reportPayload.risk_level === "BOM" ? "BOM" :
              reportPayload.risk_level === "ADEQUADO" ? "ADEQUADO" :
              reportPayload.risk_level === "ATENÇÃO" ? "ATENÇÃO" : "CRÍTICO"
            }
            size="lg"
            className="mb-4"
          />
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Controles Conformes</span>
              <span className="font-bold text-success">{reportPayload.invariants_summary.passed}/{reportPayload.invariants.length}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-success transition-all duration-700"
                style={{ width: `${(reportPayload.invariants_summary.passed / reportPayload.invariants.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StatHighlight
            icon="computer"
            label="Protegidos"
            value={reportPayload.statistics?.total_agents || 0}
            status={(reportPayload.statistics?.total_agents || 0) > 0 ? "good" : "warning"}
            size="sm"
          />
          <StatHighlight
            icon="alert"
            label="Críticos"
            value={reportPayload.statistics?.critical_vulnerabilities || 0}
            status={(reportPayload.statistics?.critical_vulnerabilities || 0) > 0 ? "critical" : "good"}
            size="sm"
          />
          <StatHighlight
            icon="virus"
            label="Ameaças"
            value={(reportPayload.statistics?.threats_found || 0) > 0 ? reportPayload.statistics?.threats_found : "Nenhuma"}
            status={(reportPayload.statistics?.threats_found || 0) > 0 ? "critical" : "good"}
            size="sm"
          />
          <StatHighlight
            icon="block"
            label="Sites Bloq."
            value={reportPayload.policies_count || reportPayload.active_policies.length || 0}
            status={(reportPayload.policies_count || reportPayload.active_policies.length || 0) > 0 ? "good" : "warning"}
            size="sm"
          />
        </div>
      </div>

      {/* Executive Summary Message */}
      <ExecutiveSummaryMessage reportPayload={reportPayload} />
    </>
  );
}

function ExecutiveSummaryMessage({ reportPayload }: { reportPayload: ComplianceReportPayload }) {
  const execSummary = (reportPayload as Record<string, unknown>).executive_summary as Record<string, unknown> | undefined;
  const overallMessage = execSummary?.overallMessage as string | undefined;

  const isLow = reportPayload.risk_level === 'BAIXO' || reportPayload.risk_level === 'MÍNIMO';
  const isMedium = reportPayload.risk_level === 'MÉDIO';

  const defaultMessage = isLow
    ? `A empresa "${reportPayload.tenant_name}" está em boa situação de segurança. Todos os sistemas estão protegidos e funcionando corretamente. Continue mantendo as boas práticas de segurança.`
    : isMedium
    ? `A empresa "${reportPayload.tenant_name}" possui alguns pontos de atenção que merecem acompanhamento. Não há riscos críticos imediatos, mas recomendamos revisar as pendências listadas abaixo.`
    : `A empresa "${reportPayload.tenant_name}" precisa de atenção urgente. ${
        (reportPayload.statistics?.critical_vulnerabilities || 0) > 0
          ? `Foram identificadas ${reportPayload.statistics?.critical_vulnerabilities} vulnerabilidades críticas que devem ser corrigidas imediatamente.`
          : 'O score de segurança está abaixo do ideal. Revise os controles e recomendações abaixo para melhorar a postura de segurança.'
      }`;

  return (
    <div className={`p-5 rounded-xl mb-6 ${
      isLow ? 'bg-success/10 border-2 border-success/30' :
      isMedium ? 'bg-warning/10 border-2 border-warning/30' :
      'bg-destructive/10 border-2 border-destructive/30'
    }`}>
      <h4 className="font-semibold mb-2 text-foreground flex items-center gap-2">
        {isLow ? (
          <CheckCircle2 className="h-5 w-5 text-success" />
        ) : isMedium ? (
          <AlertTriangle className="h-5 w-5 text-warning" />
        ) : (
          <XCircle className="h-5 w-5 text-destructive" />
        )}
        O que isso significa para sua empresa?
      </h4>
      <p className="text-foreground leading-relaxed">
        {overallMessage || defaultMessage}
      </p>
    </div>
  );
}
