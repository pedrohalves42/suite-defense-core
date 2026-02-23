import { Shield, AlertTriangle, CheckCircle, Monitor, FileText, Bell } from "lucide-react";
import { SectionHeader } from "./shared/SectionHeader";

const dashboardStats = [
  { label: "Dispositivos Monitorados", value: "32", icon: Monitor },
  { label: "Ameaças Bloqueadas (30d)", value: "17", icon: Shield },
  { label: "Score de Segurança", value: "87/100", icon: CheckCircle },
];

const alertExamples = [
  { severity: "critical", time: "Há 2 min", message: "Antivírus desativado em PC-RECEPCAO", icon: AlertTriangle },
  { severity: "warning", time: "Há 15 min", message: "Atualização pendente em 3 máquinas", icon: Bell },
  { severity: "info", time: "Há 1h", message: "Backup verificado com sucesso", icon: CheckCircle },
];

const lgpdItems = [
  "Inventário de dados pessoais",
  "Controle de acesso documentado",
  "Evidências de criptografia ativa",
  "Registro de incidentes",
  "Política de retenção aplicada",
];

export function ProductPreviewSection() {
  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Veja o CyberShield funcionando"
          subtitle="É assim que você enxerga a segurança da sua empresa — simples, visual e em português"
        />

        <div className="grid lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Dashboard Preview */}
          <div className="card-enterprise rounded-xl overflow-hidden">
            <div className="bg-primary/5 border-b border-border px-5 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-warning/60" />
                <div className="w-3 h-3 rounded-full bg-success/60" />
              </div>
              <span className="text-xs text-muted-foreground font-medium ml-2">Painel CyberShield</span>
            </div>
            <div className="p-5 space-y-3">
              {dashboardStats.map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <div key={i} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-accent" />
                      <span className="text-sm text-muted-foreground">{stat.label}</span>
                    </div>
                    <span className="text-lg font-bold text-foreground">{stat.value}</span>
                  </div>
                );
              })}
              <div className="p-3 bg-warning/10 rounded-lg border border-warning/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <span className="text-sm font-medium text-warning">2 máquinas precisam de atenção</span>
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Alerts */}
          <div className="card-enterprise rounded-xl overflow-hidden">
            <div className="bg-primary/5 border-b border-border px-5 py-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-accent" />
              <span className="text-xs text-muted-foreground font-medium">Alertas em Tempo Real</span>
            </div>
            <div className="p-5 space-y-3">
              {alertExamples.map((alert, i) => {
                const Icon = alert.icon;
                const severityStyles = {
                  critical: "border-destructive/30 bg-destructive/5",
                  warning: "border-warning/30 bg-warning/5",
                  info: "border-success/30 bg-success/5",
                };
                const iconColor = {
                  critical: "text-destructive",
                  warning: "text-warning",
                  info: "text-success",
                };
                return (
                  <div key={i} className={`p-3 rounded-lg border ${severityStyles[alert.severity as keyof typeof severityStyles]}`}>
                    <div className="flex items-start gap-2">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor[alert.severity as keyof typeof iconColor]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{alert.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{alert.time}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-center text-muted-foreground pt-1">
                Alertas reais enviados por email e WhatsApp
              </p>
            </div>
          </div>

          {/* LGPD Report Preview */}
          <div className="card-enterprise rounded-xl overflow-hidden">
            <div className="bg-primary/5 border-b border-border px-5 py-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" />
              <span className="text-xs text-muted-foreground font-medium">Relatório LGPD</span>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-foreground">Conformidade LGPD</span>
                <span className="text-lg font-bold text-success">92%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full mb-4 overflow-hidden">
                <div className="h-full bg-success rounded-full" style={{ width: "92%" }} />
              </div>
              <ul className="space-y-2.5">
                {lgpdItems.map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-success shrink-0" />
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 p-3 bg-muted/40 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">
                  📄 Relatório exportável em PDF — pronto para auditoria
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
