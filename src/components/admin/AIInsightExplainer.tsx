import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  HelpCircle,
  Database,
  Clock,
  AlertTriangle,
  Info,
  CheckCircle,
  Brain,
  FileText,
  Activity,
} from "lucide-react";
import { formatBrazilDateTime } from "@/lib/date-utils";

interface AIEvidence {
  data_point: string;
  source_table: string;
  source_id?: string;
  timestamp: string;
  value: any;
  severity?: "info" | "warning" | "critical";
}

interface AIInsightExplainerProps {
  insightId: string;
  title: string;
  description: string;
  evidence: AIEvidence[] | Record<string, any>;
  confidence: number;
  reasoning?: string;
  dataSources?: string[];
  insightType: string;
  severity: "info" | "warning" | "critical";
}

// Map source tables to friendly names
const SOURCE_TABLE_LABELS: Record<string, string> = {
  agents: "Computadores",
  agent_system_metrics_partitioned: "Métricas do Sistema",
  agent_system_metrics: "Métricas do Sistema",
  jobs: "Verificações",
  v_problematic_jobs: "Verificações com Erro",
  system_alerts: "Alertas do Sistema",
  installation_analytics: "Analytics de Instalação",
  software_inventory: "Inventário de Software",
  vulnerabilities: "Vulnerabilidades",
  blocked_access_attempts: "Tentativas Bloqueadas",
  ai_insights: "Insights de IA",
};

// Get icon for source table
function getSourceIcon(source: string) {
  switch (source) {
    case "agents":
      return <Activity className="h-4 w-4" />;
    case "jobs":
    case "v_problematic_jobs":
      return <FileText className="h-4 w-4" />;
    case "system_alerts":
      return <AlertTriangle className="h-4 w-4" />;
    default:
      return <Database className="h-4 w-4" />;
  }
}

// Get severity icon and color
function getSeverityConfig(severity?: string) {
  switch (severity) {
    case "critical":
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        color: "text-destructive",
        bg: "bg-destructive/10",
        badge: "destructive" as const,
      };
    case "warning":
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        color: "text-warning",
        bg: "bg-warning/10",
        badge: "warning" as const,
      };
    default:
      return {
        icon: <Info className="h-4 w-4" />,
        color: "text-info",
        bg: "bg-info/10",
        badge: "secondary" as const,
      };
  }
}

// Convert legacy evidence format to AIEvidence[]
function normalizeEvidence(evidence: AIEvidence[] | Record<string, any>): AIEvidence[] {
  if (Array.isArray(evidence)) {
    return evidence;
  }

  // Convert legacy object format to array
  const normalized: AIEvidence[] = [];
  
  if (typeof evidence === "object" && evidence !== null) {
    Object.entries(evidence).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        let severity: "info" | "warning" | "critical" = "info";
        
        // Determine severity based on key and value
        if (key.includes("critical") || key.includes("failure")) {
          severity = "critical";
        } else if (key.includes("warning") || key.includes("high")) {
          severity = "warning";
        }
        
        normalized.push({
          data_point: formatEvidenceKey(key),
          source_table: "ai_insights",
          timestamp: new Date().toISOString(),
          value: value,
          severity,
        });
      }
    });
  }
  
  return normalized;
}

// Format evidence key to human-readable
function formatEvidenceKey(key: string): string {
  const labels: Record<string, string> = {
    failureRate: "Taxa de Falha",
    avgCpuUsage: "Uso Médio de CPU",
    avgMemoryUsage: "Uso Médio de Memória",
    problematicJobsCount: "Verificações com Erro",
    criticalAlerts: "Alertas Críticos",
    warningAlerts: "Alertas de Aviso",
    totalAgents: "Total de Computadores",
    onlineAgents: "Computadores Online",
    offlineAgents: "Computadores Offline",
  };
  
  return labels[key] || key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

// Format value for display
function formatValue(value: Record<string, unknown>): string {
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return value.toString();
    }
    return value.toFixed(1);
  }
  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }
  if (Array.isArray(value)) {
    return value.length.toString() + " itens";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function AIInsightExplainer({
  insightId,
  title,
  description,
  evidence,
  confidence,
  reasoning,
  dataSources,
  insightType,
  severity,
}: AIInsightExplainerProps) {
  const [open, setOpen] = useState(false);
  
  const normalizedEvidence = normalizeEvidence(evidence);
  const uniqueSources = dataSources || [...new Set(normalizedEvidence.map(e => e.source_table))];
  const confidencePercent = Math.round(confidence * 100);
  
  // Generate default reasoning if not provided
  const displayReasoning = reasoning || generateDefaultReasoning(normalizedEvidence, insightType);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <HelpCircle className="h-4 w-4" />
          Por que estou vendo isso?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Explicação do Insight
          </DialogTitle>
          <DialogDescription>
            Entenda por que a IA gerou este insight e quais evidências suportam a análise.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Insight Summary */}
            <div className="rounded-lg border p-4 bg-muted/30">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <h4 className="font-semibold">{title}</h4>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <Badge variant={getSeverityConfig(severity).badge}>
                  {severity}
                </Badge>
              </div>
            </div>

            {/* Confidence Score */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  Nível de Confiança
                </span>
                <span className="font-bold">{confidencePercent}%</span>
              </div>
              <Progress value={confidencePercent} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {confidencePercent >= 80 && "Alta confiança - Múltiplas evidências corroboram esta análise."}
                {confidencePercent >= 60 && confidencePercent < 80 && "Confiança moderada - Evidências consistentes com a análise."}
                {confidencePercent < 60 && "Confiança baixa - Dados limitados disponíveis para esta análise."}
              </p>
            </div>

            <Separator />

            {/* Reasoning Summary */}
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                Raciocínio da IA
              </h4>
              <div className="rounded-lg border p-4 bg-primary/5">
                <p className="text-sm leading-relaxed">{displayReasoning}</p>
              </div>
            </div>

            <Separator />

            {/* Data Sources */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Fontes de Dados ({uniqueSources.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {uniqueSources.map((source, idx) => (
                  <Badge key={idx} variant="outline" className="flex items-center gap-1">
                    {getSourceIcon(source)}
                    {SOURCE_TABLE_LABELS[source] || source}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            {/* Evidence List */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Evidências ({normalizedEvidence.length})
              </h4>
              
              {normalizedEvidence.length === 0 ? (
                <div className="rounded-lg border p-4 text-center text-muted-foreground">
                  <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma evidência detalhada disponível.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {normalizedEvidence.map((item, idx) => {
                    const severityConfig = getSeverityConfig(item.severity);
                    return (
                      <div
                        key={idx}
                        className={`rounded-lg border p-3 ${severityConfig.bg}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 flex-1">
                            <span className={severityConfig.color}>
                              {severityConfig.icon}
                            </span>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{item.data_point}</p>
                              <p className="text-lg font-bold">
                                {formatValue(item.value)}
                                {typeof item.value === "number" && item.data_point.toLowerCase().includes("%") && "%"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground space-y-1">
                            <div className="flex items-center gap-1 justify-end">
                              {getSourceIcon(item.source_table)}
                              <span>{SOURCE_TABLE_LABELS[item.source_table] || item.source_table}</span>
                            </div>
                            {item.timestamp && (
                              <div className="flex items-center gap-1 justify-end">
                                <Clock className="h-3 w-3" />
                                <span>{formatBrazilDateTime(item.timestamp)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Audit Trail */}
            <div className="rounded-lg border p-4 bg-muted/30 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4" />
                <span className="font-medium">Trilha de Auditoria</span>
              </div>
              <div className="space-y-1">
                <p>ID do Insight: <code className="bg-muted px-1 rounded">{insightId}</code></p>
                <p>Tipo: <code className="bg-muted px-1 rounded">{insightType}</code></p>
                <p>Evidências analisadas: {normalizedEvidence.length}</p>
                <p>Fontes consultadas: {uniqueSources.length}</p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Generate default reasoning based on evidence and type
function generateDefaultReasoning(evidence: AIEvidence[], insightType: string): string {
  const criticalCount = evidence.filter(e => e.severity === "critical").length;
  const warningCount = evidence.filter(e => e.severity === "warning").length;
  const sources = [...new Set(evidence.map(e => e.source_table))];
  
  let reasoning = `Esta análise foi gerada automaticamente pela IA do CyberShield com base em ${evidence.length} ponto(s) de dados coletados de ${sources.length} fonte(s) de dados.`;
  
  if (criticalCount > 0) {
    reasoning += ` Foram identificadas ${criticalCount} evidência(s) de severidade crítica que requerem atenção imediata.`;
  }
  
  if (warningCount > 0) {
    reasoning += ` ${warningCount} ponto(s) de atenção foram detectados e merecem investigação.`;
  }
  
  switch (insightType) {
    case "anomaly_detection":
      reasoning += " A IA detectou padrões anormais comparando métricas atuais com comportamento histórico.";
      break;
    case "optimization":
      reasoning += " A análise identificou oportunidades de otimização baseadas em métricas de desempenho.";
      break;
    case "prediction":
      reasoning += " Tendências históricas foram analisadas para prever possíveis problemas futuros.";
      break;
    case "root_cause":
      reasoning += " Correlação entre múltiplos eventos foi realizada para identificar a causa raiz.";
      break;
  }
  
  return reasoning;
}
