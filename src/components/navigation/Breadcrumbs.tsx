import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Painel Principal",
  admin: "Administração",
  installer: "Instalador",
  agents: "Computadores",
  jobs: "Verificações",
  monitoring: "Monitoramento",
  export: "Exportar",
  "virus-scans": "Scans de Vírus",
  quarantine: "Alertas",
  "agent-health": "Saúde dos Computadores",
  "ai-insights": "Sugestões Inteligentes",
  "system-logs": "Logs do Sistema",
  "security-policies": "Regras de Segurança",
  "security-monitoring": "Monitoramento de Segurança",
  reports: "Relatórios",
  members: "Membros",
  settings: "Configurações",
  "action-center": "Pendências",
  executive: "Resumo Executivo",
  diagnostics: "Diagnósticos",
  "software-inventory": "Programas Instalados",
  vulnerabilities: "Pontos Fracos",
  "web-activity": "Atividade Web",
  "soc2-compliance": "SOC 2",
  governance: "Revisão de Decisões",
  tasks: "Tarefas",
  "my-account": "Minha Conta",
  "jobs-health": "Saúde de Verificações",
  "risk-score": "Score de Risco",
  playbooks: "Planos de Ação",
  automations: "Automação",
  "threat-center": "Alertas de Segurança",
  "vulnerability-center": "Pontos Fracos",
  "network-security": "Internet e Navegação",
  "asset-security": "Programas e Dispositivos",
  "realtime-security": "Monitoramento Contínuo",
  "intelligence-hub": "Assistente IA",
  "compliance-hub": "Conformidade",
  "ai-governance": "Revisão IA",
  "itsm": "Service Desk",
  "siem-export": "Exportar Logs",
  "rollout-policies": "Distribuição Gradual",
  "sales-pipeline": "Funil de Vendas",
};

export function Breadcrumbs({ className }: { className?: string }) {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length <= 1) return null;

  const crumbs = segments.map((seg, i) => {
    const path = "/" + segments.slice(0, i + 1).join("/");
    const label = ROUTE_LABELS[seg] || seg.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const isLast = i === segments.length - 1;
    return { path, label, isLast };
  });

  return (
    <nav
      aria-label="Navegação de breadcrumbs"
      className={cn("flex items-center gap-1 text-xs text-muted-foreground mb-4", className)}
    >
      <Link
        to="/dashboard"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        aria-label="Ir para o início"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground" aria-current="page">{crumb.label}</span>
          ) : (
            <Link to={crumb.path} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
