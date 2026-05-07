import { Shield, AlertTriangle, CheckCircle, Monitor, FileText, Bell } from "lucide-react";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";

const dashboardStats = [
  { label: "Dispositivos Monitorados", value: "32", icon: Monitor, color: "text-info" },
  { label: "Ameaças Bloqueadas (30d)", value: "17", icon: Shield, color: "text-cta-positive" },
  { label: "Score de Segurança", value: "87/100", icon: CheckCircle, color: "text-cta-positive" },
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

    <section className="py-32 relative overflow-hidden bg-[#020203]">
      <div className="absolute inset-0 bg-gradient-to-b from-[#020203] via-cta-positive/[0.02] to-[#020203]" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <SectionHeader
          title="Veja o CyberShield funcionando"
          subtitle="É assim que você enxerga a segurança da sua empresa — simples, visual e em português"
        />

        <div className="grid lg:grid-cols-3 gap-8 max-w-7xl mx-auto stagger-visible">
          {/* Dashboard Preview */}
          <motion.div 
            className="rounded-[2.5rem] glass-card border-white/5 overflow-hidden hover:border-cta-positive/30 transition-all duration-700 shadow-premium group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="bg-white/[0.03] border-b border-white/5 px-6 py-4 flex items-center justify-between">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive/40" />
                <div className="w-3 h-3 rounded-full bg-warning/40" />
                <div className="w-3 h-3 rounded-full bg-cta-positive/40" />
              </div>
              <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Console Operacional</span>
            </div>
            <div className="p-8 space-y-4">
              {dashboardStats.map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5 group-hover:bg-white/[0.04] transition-all">
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 ${stat.color}`} />
                      <span className="text-sm text-white/50 font-medium">{stat.label}</span>
                    </div>
                    <span className="text-xl font-bold text-white tracking-tight">{stat.value}</span>
                  </div>
                );
              })}
              <div className="p-4 bg-warning/10 rounded-2xl border border-warning/20 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-warning animate-pulse" />
                <span className="text-sm font-bold text-warning">2 alertas críticos</span>
              </div>
            </div>
          </motion.div>

          {/* Real-time Alerts */}
          <motion.div 
            className="rounded-[2.5rem] glass-card border-white/5 overflow-hidden hover:border-warning/30 transition-all duration-700 shadow-premium group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <div className="bg-white/[0.03] border-b border-white/5 px-6 py-4 flex items-center justify-between">
              <Bell className="w-4 h-4 text-warning animate-pulse" />
              <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Eventos Críticos</span>
            </div>
            <div className="p-8 space-y-4">
              {alertExamples.map((alert, i) => {
                const Icon = alert.icon;
                const severityStyles = {
                  critical: "border-destructive/20 bg-destructive/10",
                  warning: "border-warning/20 bg-warning/10",
                  info: "border-cta-positive/20 bg-cta-positive/10",
                };
                const iconColor = {
                  critical: "text-destructive",
                  warning: "text-warning",
                  info: "text-cta-positive",
                };
                return (
                  <div key={i} className={`p-4 rounded-2xl border ${severityStyles[alert.severity as keyof typeof severityStyles]} transition-transform hover:scale-[1.02]`}>
                    <div className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${iconColor[alert.severity as keyof typeof iconColor]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white leading-tight">{alert.message}</p>
                        <p className="text-[11px] text-white/40 mt-1 font-medium">{alert.time}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* LGPD Report */}
          <motion.div 
            className="rounded-[2.5rem] glass-card border-white/5 overflow-hidden hover:border-cta-positive/30 transition-all duration-700 shadow-premium group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <div className="bg-white/[0.03] border-b border-white/5 px-6 py-4 flex items-center justify-between">
              <FileText className="w-4 h-4 text-cta-positive" />
              <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Compliance Hub</span>
            </div>
            <div className="p-8">
              <div className="flex items-center justify-between mb-5">
                <span className="text-sm font-bold text-white/60"> LGPD Score</span>
                <span className="text-2xl font-black text-cta-positive tracking-tighter">92%</span>
              </div>
              <div className="w-full h-2.5 bg-white/5 rounded-full mb-8 overflow-hidden border border-white/5">
                <div className="h-full bg-cta-positive shadow-glow rounded-full" style={{ width: "92%" }} />
              </div>
              <ul className="space-y-4">
                {lgpdItems.slice(0, 4).map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-cta-positive/20 flex items-center justify-center">
                      <CheckCircle className="w-3.5 h-3.5 text-cta-positive" />
                    </div>
                    <span className="text-sm text-white/50 font-medium">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-10 p-4 bg-cta-positive/10 rounded-2xl text-center border border-cta-positive/20">
                <p className="text-xs font-bold text-cta-positive uppercase tracking-widest">
                  Gerar PDF Auditável
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}