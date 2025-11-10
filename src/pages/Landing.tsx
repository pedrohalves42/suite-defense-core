import { Shield, Users, Clock, CheckCircle2, Lock, Activity, FileCheck, Zap, Server, Terminal, ArrowRight, Play, Sparkles, Boxes, Database, Bell, Network, AlertTriangle, CheckCircle, ExternalLink, Github, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ContactForm } from "@/components/ContactForm";

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
};

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Navigation */}
      <motion.nav 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className="border-b border-border/40 backdrop-blur-xl sticky top-0 z-50 bg-background/95 shadow-sm"
      >
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <motion.div 
              className="flex items-center gap-2"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <Shield className="w-8 h-8 text-primary drop-shadow-[0_0_10px_rgba(0,229,160,0.5)]" />
              <span className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                CyberShield
              </span>
            </motion.div>
            <nav className="hidden md:flex items-center gap-8">
              <a href="#como-funciona" className="text-sm text-muted-foreground hover:text-primary transition-colors">Como Funciona</a>
              <a href="#segmentos" className="text-sm text-muted-foreground hover:text-primary transition-colors">Segmentos</a>
              <a href="#seguranca" className="text-sm text-muted-foreground hover:text-primary transition-colors">Segurança</a>
              <a href="#precos" className="text-sm text-muted-foreground hover:text-primary transition-colors">Preços</a>
              <a href="#contato" className="text-sm text-muted-foreground hover:text-primary transition-colors">Contato</a>
            </nav>
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate("/login")} className="hover:text-primary transition-colors">
                Login
              </Button>
              <Button 
                onClick={() => navigate("/signup")} 
                className="bg-primary hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 transition-all hover:scale-105"
              >
                Testar 30 dias
              </Button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="pt-20 pb-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(0,229,160,0.2),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_60%,rgba(0,229,160,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDIyOSwxNjAsMC4xKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20" />
        
        <div className="container mx-auto px-6 relative z-10">
          <motion.div 
            className="max-w-5xl mx-auto text-center"
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            <motion.h1 
              className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
              variants={fadeInUp}
            >
              Orquestração e Resposta para Endpoints —{" "}
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse-glow">
                multi‑tenant, em minutos
              </span>
            </motion.h1>
            
            <motion.p 
              className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed"
              variants={fadeInUp}
            >
              Funciona por cima do seu antivírus/Defender: detecta configurações de risco, prioriza e remedia com playbooks aprovados, 
              <span className="text-primary font-semibold"> em tempo real e com auditoria completa.</span>
            </motion.p>

            {/* Proof Stats */}
            <motion.div 
              className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12"
              variants={fadeInUp}
            >
              <Card className="border-primary/20 bg-card/50 backdrop-blur">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-primary mb-2">p95: 12s</div>
                  <div className="text-sm text-muted-foreground">Tempo de execução de job</div>
                </CardContent>
              </Card>
              <Card className="border-primary/20 bg-card/50 backdrop-blur">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-primary mb-2">15.4k</div>
                  <div className="text-sm text-muted-foreground">Jobs no último mês</div>
                </CardContent>
              </Card>
              <Card className="border-primary/20 bg-card/50 backdrop-blur">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-primary mb-2">3 integrações</div>
                  <div className="text-sm text-muted-foreground">Defender/AV, VirusTotal*, Email/Webhooks</div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div 
              className="flex flex-col sm:flex-row gap-4 justify-center items-center"
              variants={fadeInUp}
            >
              <Button 
                size="lg" 
                onClick={() => navigate("/signup")}
                className="bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 transition-all hover:scale-105 text-lg px-8 py-6"
              >
                <Play className="mr-2 h-5 w-5" />
                Testar 30 dias — sem cartão
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="border-primary/50 hover:bg-primary/10 text-lg px-8 py-6"
              >
                <Terminal className="mr-2 h-5 w-5" />
                Ver demo de 5 min
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Como Funciona */}
      <section id="como-funciona" className="py-24 bg-gradient-to-b from-background to-secondary/20">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">SETUP EM MINUTOS</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Como Funciona</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Três passos para proteger todos os seus endpoints
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                step: "1",
                icon: Terminal,
                title: "Instale o agente",
                description: "PowerShell/Bash. Heartbeat em segundos.",
                details: "Um comando para instalar. Registro automático multi-tenant por chave de enrollment."
              },
              {
                step: "2",
                icon: CheckCircle2,
                title: "Execute playbooks",
                description: "SMBv1, RDP, patches, firewall com aprovação dupla.",
                details: "Detecta configurações de risco e executa remediações aprovadas com auditoria completa."
              },
              {
                step: "3",
                icon: FileCheck,
                title: "Comprove conformidade",
                description: "Relatórios PDF/CSV e trilha de auditoria por tenant.",
                details: "Evidências LGPD e apoio a BACEN 4.893. Exportação completa de logs e ações."
              },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeInUp}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="h-full border-border/50 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10">
                  <CardHeader>
                    <div className="mb-4">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20">
                        <item.icon className="w-8 h-8 text-primary" />
                      </div>
                      <div className="inline-flex ml-3 items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-lg">
                        {item.step}
                      </div>
                    </div>
                    <CardTitle className="text-2xl mb-2">{item.title}</CardTitle>
                    <p className="text-primary font-medium">{item.description}</p>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{item.details}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Segmentos */}
      <section id="segmentos" className="py-24">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">FEITO SOB MEDIDA</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Para Quem É</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Seja MSP ou empresa com 20–500 endpoints
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={scaleIn}
            >
              <Card className="h-full border-accent/30 hover:border-accent transition-all hover:shadow-xl hover:shadow-accent/20">
                <CardHeader>
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 mb-4">
                    <Users className="w-8 h-8 text-accent" />
                  </div>
                  <CardTitle className="text-3xl mb-4">MSPs</CardTitle>
                  <CardDescription className="text-base">
                    Gerencie múltiplos clientes com isolamento total
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-accent mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Painel multi‑tenant</p>
                      <p className="text-sm text-muted-foreground">Clientes isolados por RLS. Sem vazamento de dados.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-accent mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Playbooks reutilizáveis</p>
                      <p className="text-sm text-muted-foreground">Crie uma vez, use em todos os clientes com aprovações por função.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-accent mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Relatórios white‑label</p>
                      <p className="text-sm text-muted-foreground">PDF/CSV para enviar ao cliente com sua marca.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={scaleIn}
              transition={{ delay: 0.2 }}
            >
              <Card className="h-full border-primary/30 hover:border-primary transition-all hover:shadow-xl hover:shadow-primary/20">
                <CardHeader>
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
                    <Server className="w-8 h-8 text-primary" />
                  </div>
                  <CardTitle className="text-3xl mb-4">Empresas</CardTitle>
                  <CardDescription className="text-base">
                    20–500 endpoints com conformidade garantida
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Hardening em 7 dias</p>
                      <p className="text-sm text-muted-foreground">SMBv1, RDP, Windows Update, políticas de firewall.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Evidências LGPD/BACEN</p>
                      <p className="text-sm text-muted-foreground">Trilha de auditoria completa e exportações para compliance.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Funciona com seu antivírus</p>
                      <p className="text-sm text-muted-foreground">Sem troca de ferramenta. Orquestramos por cima do Defender/AV.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section id="beneficios" className="py-24 bg-gradient-to-b from-secondary/20 to-background">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <Badge className="mb-4 bg-success/10 text-success border-success/20">DIFERENCIAIS</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Por Que CyberShield?</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Orquestração real, não apenas detecção
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: Zap,
                title: "Resposta Imediata",
                description: "p95 de 12s. Jobs executados em tempo real com aprovação.",
                badge: "VELOCIDADE"
              },
              {
                icon: Lock,
                title: "Multi-tenant Real",
                description: "Isolamento por RLS. Um cliente nunca enxerga o outro.",
                badge: "SEGURANÇA"
              },
              {
                icon: Activity,
                title: "Heartbeat & Jobs",
                description: "Monitoramento contínuo com execução remota de comandos aprovados.",
                badge: "CONFIÁVEL"
              },
              {
                icon: FileCheck,
                title: "Auditoria Completa",
                description: "Logs imutáveis. Evidências para LGPD e BACEN 4.893.",
                badge: "COMPLIANCE"
              },
              {
                icon: Network,
                title: "Integrações Prontas",
                description: "VirusTotal (hash-only), Webhooks, Email. SIEM em roadmap.",
                badge: "EXTENSÍVEL"
              },
              {
                icon: Database,
                title: "Dados Seguros",
                description: "RLS por tenant, RBAC granular, backups automáticos.",
                badge: "PRIVACIDADE"
              },
            ].map((benefit, index) => (
              <motion.div
                key={index}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={scaleIn}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="h-full border-border/50 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10 group">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-4">
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                        <benefit.icon className="w-7 h-7 text-primary" />
                      </div>
                      <Badge variant="outline" className="text-xs">{benefit.badge}</Badge>
                    </div>
                    <CardTitle className="text-xl mb-2">{benefit.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{benefit.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrações */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">INTEGRAÇÕES</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Funciona com o que você já usa</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Defender/AV continua detectando; o CyberShield orquestra e remedia.
            </p>
          </motion.div>

          <motion.div 
            className="max-w-4xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { name: "Windows Defender", type: "Antivírus nativo", status: "Integrado" },
                { name: "VirusTotal", type: "Hash-only / BYO-key", status: "Integrado" },
                { name: "Email / Webhooks", type: "Alertas e notificações", status: "Integrado" },
              ].map((integration, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="border-primary/20 hover:border-primary/50 transition-all">
                    <CardHeader>
                      <div className="flex items-center justify-between mb-2">
                        <CardTitle className="text-lg">{integration.name}</CardTitle>
                        <Badge className="bg-success/20 text-success border-success/30">{integration.status}</Badge>
                      </div>
                      <CardDescription>{integration.type}</CardDescription>
                    </CardHeader>
                  </Card>
                </motion.div>
              ))}
            </div>

            <motion.div variants={fadeInUp} className="mt-8">
              <Card className="border-muted bg-muted/30">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-warning mt-1" />
                    <div>
                      <p className="font-medium">VirusTotal - BYO Empresarial</p>
                      <p className="text-sm text-muted-foreground">
                        Verificação hash-only com sua chave empresarial. Privacidade garantida — nenhum arquivo é enviado.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Segurança & Compliance */}
      <section id="seguranca" className="py-24 bg-gradient-to-b from-background to-secondary/20">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <Badge className="mb-4 bg-destructive/10 text-destructive border-destructive/20">SEGURANÇA MÁXIMA</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Arquitetura Segura</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              mTLS + HMAC, RLS por tenant, RBAC granular, logs imutáveis
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={scaleIn}
            >
              <Card className="h-full border-destructive/30">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-3">
                    <Lock className="w-6 h-6 text-destructive" />
                    Comunicação Protegida
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
                    <p className="text-muted-foreground">
                      <span className="text-foreground font-medium">mTLS</span> entre agente e edge functions
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
                    <p className="text-muted-foreground">
                      <span className="text-foreground font-medium">HMAC</span> por payload com proteção anti-replay
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
                    <p className="text-muted-foreground">
                      Tokens únicos por agente com expiração
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={scaleIn}
              transition={{ delay: 0.1 }}
            >
              <Card className="h-full border-primary/30">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-3">
                    <Shield className="w-6 h-6 text-primary" />
                    Isolamento & Auditoria
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
                    <p className="text-muted-foreground">
                      <span className="text-foreground font-medium">RLS</span> por tenant — dados segregados por design
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
                    <p className="text-muted-foreground">
                      <span className="text-foreground font-medium">RBAC</span> granular (admin, operator, viewer)
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
                    <p className="text-muted-foreground">
                      Logs imutáveis e auditoria completa
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <motion.div 
            className="mt-8 max-w-5xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  <span className="text-foreground font-medium">Cada conexão do agente</span> é verificada com mTLS, e cada mensagem é assinada com HMAC (proteção anti‑replay). 
                  Dados segregados por RLS — por design, <span className="text-primary font-medium">um cliente nunca enxerga o outro.</span>
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="precos" className="py-24">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">PLANOS</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Preços Transparentes</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Pague por endpoint. Sem pegadinhas. Cancele quando quiser.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                name: "Starter",
                price: "R$ 20",
                period: "/endpoint/mês",
                minEndpoints: "Mínimo 25 endpoints",
                description: "Para começar com o essencial",
                features: [
                  "Jobs básicos (scan, update, hardening)",
                  "Alertas por e-mail",
                  "VirusTotal hash-only (BYO-key)",
                  "Dashboard multi-tenant",
                  "Auditoria de 30 dias",
                  "Suporte por e-mail"
                ],
                cta: "Começar agora",
                highlighted: false
              },
              {
                name: "Pro",
                price: "R$ 30",
                period: "/endpoint/mês",
                minEndpoints: "Mínimo 100 endpoints",
                description: "Para MSPs e empresas exigentes",
                features: [
                  "Tudo do Starter, mais:",
                  "Webhooks e integrações",
                  "Playbooks aprovados customizados",
                  "Relatórios white-label PDF/CSV",
                  "Exportação completa de dados",
                  "Auditoria de 90 dias",
                  "Suporte prioritário (8h úteis)"
                ],
                cta: "Começar teste",
                highlighted: true
              },
              {
                name: "Enterprise",
                price: "Sob",
                period: "consulta",
                minEndpoints: "500+ endpoints",
                description: "Para operações críticas",
                features: [
                  "Tudo do Pro, mais:",
                  "SSO/SAML",
                  "Integração SIEM/ITSM",
                  "Retenção estendida (1 ano+)",
                  "SLA garantido",
                  "Suporte 24×7",
                  "Implementação assistida"
                ],
                cta: "Falar com vendas",
                highlighted: false
              }
            ].map((plan, index) => (
              <motion.div
                key={index}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={scaleIn}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`h-full relative ${plan.highlighted ? 'border-primary shadow-xl shadow-primary/20 scale-105' : 'border-border/50'}`}>
                  {plan.highlighted && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground px-4 py-1">MAIS POPULAR</Badge>
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <div className="mt-4">
                      <span className="text-5xl font-bold">{plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                    <p className="text-sm text-primary font-medium">{plan.minEndpoints}</p>
                    <CardDescription className="mt-2">{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-3">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button 
                      className={`w-full ${plan.highlighted ? 'bg-primary hover:bg-primary/90' : ''}`}
                      variant={plan.highlighted ? 'default' : 'outline'}
                      size="lg"
                      onClick={() => navigate(plan.name === 'Enterprise' ? '#contato' : '/signup')}
                    >
                      {plan.cta}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div 
            className="mt-12 text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <p className="text-muted-foreground">
              Todos os planos incluem: 30 dias de teste gratuito • Sem cartão necessário • Cancele quando quiser
            </p>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-gradient-to-b from-secondary/20 to-background">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">FAQ</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Perguntas Frequentes</h2>
          </motion.div>

          <motion.div 
            className="max-w-3xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <Accordion type="single" collapsible className="space-y-4">
              {[
                {
                  q: "CyberShield substitui meu antivírus?",
                  a: "Não. O CyberShield funciona por cima do seu Defender ou antivírus existente. Nós orquestramos ações de resposta e remediação, enquanto o AV continua detectando ameaças."
                },
                {
                  q: "Como funciona o multi-tenant?",
                  a: "Isolamento real por RLS (Row Level Security). Cada tenant tem seus próprios dados, usuários, agentes e configurações. Um cliente nunca enxerga dados de outro — por design de banco de dados."
                },
                {
                  q: "Posso usar minha chave do VirusTotal?",
                  a: "Sim. A integração é hash-only e você usa sua própria chave empresarial (BYO-key). Nenhum arquivo é enviado — apenas hashes para consulta."
                },
                {
                  q: "Como funciona a aprovação de jobs?",
                  a: "Playbooks podem ser configurados para aprovação manual ou automática. Cada execução é auditada com timestamp, usuário responsável e resultado."
                },
                {
                  q: "Quais sistemas operacionais são suportados?",
                  a: "Windows (PowerShell) e Linux (Bash). O agente é leve, open-source e pode ser auditado antes da instalação."
                },
                {
                  q: "Vocês oferecem suporte em português?",
                  a: "Sim! Suporte em português por e-mail (todos os planos) e prioritário para clientes Pro e Enterprise."
                }
              ].map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border border-border/50 rounded-lg px-6 bg-card/30">
                  <AccordionTrigger className="text-left hover:text-primary">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* Contact */}
      <section id="contato" className="py-24">
        <div className="container mx-auto px-6">
          <motion.div 
            className="max-w-4xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">FALE CONOSCO</Badge>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Vamos conversar?</h2>
              <p className="text-xl text-muted-foreground">
                Agende uma demo ou tire suas dúvidas
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle>Formulário de Contato</CardTitle>
                  <CardDescription>
                    Responderemos em até 24 horas úteis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ContactForm />
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-primary" />
                      E-mail
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <a href="mailto:contato@cybershield.com.br" className="text-primary hover:underline">
                      contato@cybershield.com.br
                    </a>
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-primary" />
                      Telefone
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">+55 11 99999-9999</p>
                    <p className="text-sm text-muted-foreground mt-1">Segunda a Sexta, 9h às 18h</p>
                  </CardContent>
                </Card>

                <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardHeader>
                    <CardTitle>Pronto para começar?</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">
                      Teste grátis por 30 dias. Sem cartão necessário.
                    </p>
                    <Button 
                      className="w-full bg-primary hover:bg-primary/90" 
                      size="lg"
                      onClick={() => navigate('/signup')}
                    >
                      Criar conta grátis
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-secondary/20 py-12">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-6 h-6 text-primary" />
                <span className="font-bold text-lg">CyberShield</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Orquestração e resposta para endpoints. Multi-tenant em minutos.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Produto</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#como-funciona" className="hover:text-primary transition-colors">Como Funciona</a></li>
                <li><a href="#segmentos" className="hover:text-primary transition-colors">Para Quem É</a></li>
                <li><a href="#seguranca" className="hover:text-primary transition-colors">Segurança</a></li>
                <li><a href="#precos" className="hover:text-primary transition-colors">Preços</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Empresa</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="/terms" className="hover:text-primary transition-colors">Termos de Uso</a></li>
                <li><a href="/privacy" className="hover:text-primary transition-colors">Privacidade</a></li>
                <li><a href="#contato" className="hover:text-primary transition-colors">Contato</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Suporte</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="mailto:contato@cybershield.com.br" className="hover:text-primary transition-colors">contato@cybershield.com.br</a></li>
                <li><a href="tel:+5511999999999" className="hover:text-primary transition-colors">+55 11 99999-9999</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-border/40 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} CyberShield. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}