import { Shield, Users, Clock, CheckCircle2, Lock, Activity, FileCheck, Zap, Server, Terminal, ArrowRight, Play, Sparkles, Boxes, Database, Bell, Network, AlertTriangle, CheckCircle } from "lucide-react";
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
              <a href="#beneficios" className="text-sm text-muted-foreground hover:text-primary transition-colors">Benefícios</a>
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
                Começar agora
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
            className="max-w-4xl mx-auto text-center"
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            <motion.div 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 text-sm backdrop-blur-sm"
              variants={fadeInUp}
              whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(0,229,160,0.3)" }}
            >
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-primary font-medium">+ de 500 empresas já confiam</span>
            </motion.div>
            
            <motion.h1 
              className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
              variants={fadeInUp}
            >
              E se você pudesse{" "}
              <span className="text-primary drop-shadow-[0_0_30px_rgba(0,229,160,0.4)] inline-block animate-pulse">
                reagir em segundos
              </span>
              {" "}a qualquer ameaça?
            </motion.h1>
            
            <motion.p 
              className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed"
              variants={fadeInUp}
            >
              Detecte, responda e neutralize ameaças automaticamente em todos os seus endpoints. Enquanto outros levam horas, você leva segundos.
            </motion.p>
            
            <motion.div 
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
              variants={fadeInUp}
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  onClick={() => navigate("/signup")} 
                  className="bg-primary hover:bg-primary/90 text-lg h-14 px-8 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all"
                >
                  Começar teste grátis agora
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="text-lg h-14 px-8 border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all backdrop-blur-sm"
                >
                  <Play className="mr-2 w-5 h-5" />
                  Ver demo de 5 min
                </Button>
              </motion.div>
            </motion.div>
            
            <motion.div 
              className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto"
              variants={stagger}
            >
              {[
                { value: "15k+", label: "Jobs executados/mês" },
                { value: "<45s", label: "p95 execução de job" },
                { value: "99.8%", label: "Taxa de sucesso" },
              ].map((stat, index) => (
                <motion.div
                  key={index}
                  className="flex flex-col items-center p-6 rounded-xl bg-gradient-to-br from-background/90 to-background/60 border border-border/50 backdrop-blur-sm hover:border-primary/30 transition-all group"
                  variants={scaleIn}
                  whileHover={{ y: -5, boxShadow: "0 10px 40px -10px rgba(0,229,160,0.3)" }}
                >
                  <div className="text-4xl font-bold text-primary mb-2 drop-shadow-[0_0_20px_rgba(0,229,160,0.4)] group-hover:scale-110 transition-transform">
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section id="como-funciona" className="py-20 bg-gradient-to-b from-muted/30 via-muted/20 to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,229,160,0.05),transparent_70%)]" />
        <div className="container mx-auto px-6 relative">
          <motion.div 
            className="max-w-5xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.div className="text-center mb-16" variants={fadeInUp}>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Simples de começar, poderoso de usar</h2>
              <p className="text-xl text-muted-foreground">
                Em menos de 10 minutos você tem proteção ativa
              </p>
            </motion.div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: Terminal,
                  step: "1",
                  title: "Instale em 2 minutos",
                  description: "Um comando. Pronto. Seus endpoints já estão monitorados e protegidos.",
                  color: "primary",
                },
                {
                  icon: Activity,
                  step: "2",
                  title: "Responda automaticamente",
                  description: "Ameaça detectada? Sistema age sozinho. Você só aprova as ações críticas.",
                  color: "primary",
                },
                {
                  icon: FileCheck,
                  step: "3",
                  title: "Comprove conformidade",
                  description: "Relatórios prontos para LGPD e auditorias. Cada ação registrada e rastreável.",
                  color: "primary",
                },
              ].map((item, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="border-border/50 bg-gradient-to-br from-background/90 to-background/60 backdrop-blur-sm hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10 h-full group">
                    <CardContent className="p-8">
                      <motion.div 
                        className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors"
                        whileHover={{ rotate: 360 }}
                        transition={{ duration: 0.6 }}
                      >
                        <item.icon className="w-7 h-7 text-primary" />
                      </motion.div>
                      <div className="text-4xl font-bold text-primary mb-3 drop-shadow-[0_0_15px_rgba(0,229,160,0.3)]">
                        {item.step}
                      </div>
                      <h3 className="text-xl font-semibold mb-3 group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-muted-foreground leading-relaxed">{item.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Target Audience */}
      <section className="py-20 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,229,160,0.05),transparent_70%)]" />
        <div className="container mx-auto px-6 relative">
          <motion.div 
            className="max-w-5xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.div className="text-center mb-16" variants={fadeInUp}>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Feito sob medida para você</h2>
              <p className="text-xl text-muted-foreground">
                Seja você MSP gerenciando dezenas de clientes ou empresa protegendo sua infraestrutura
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {[
                {
                  icon: Users,
                  title: "MSPs: Gerencie 100+ clientes sem caos",
                  items: [
                    "Cada cliente isolado e seguro. Dados nunca se misturam.",
                    "Crie playbooks uma vez, use em todos os seus clientes",
                    "Mostre valor com relatórios detalhados de cada ação tomada",
                  ],
                  gradient: "from-primary/20 to-primary/5",
                },
                {
                  icon: Server,
                  title: "Empresas: Segurança sem complicação",
                  items: [
                    "Proteja de 20 a 500 máquinas sem precisar de time especializado",
                    "Auditorias LGPD? Relatórios prontos em segundos",
                    "Funciona junto com seu antivírus. Não precisa trocar nada.",
                  ],
                  gradient: "from-primary/15 to-background",
                },
              ].map((audience, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className={`border-border/50 bg-gradient-to-br ${audience.gradient} backdrop-blur-sm hover:border-primary/40 transition-all hover:shadow-xl hover:shadow-primary/10 h-full group`}>
                    <CardContent className="p-8">
                      <motion.div 
                        className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors"
                        whileHover={{ scale: 1.15, rotate: 5 }}
                      >
                        <audience.icon className="w-7 h-7 text-primary" />
                      </motion.div>
                      <h3 className="text-2xl font-semibold mb-6 group-hover:text-primary transition-colors">
                        {audience.title}
                      </h3>
                      <ul className="space-y-4">
                        {audience.items.map((item, i) => (
                          <motion.li 
                            key={i} 
                            className="flex items-start gap-3"
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                          >
                            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">{item}</span>
                          </motion.li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Benefits */}
      <section id="beneficios" className="py-20 bg-gradient-to-b from-muted/30 to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(0,229,160,0.08),transparent_60%)]" />
        <div className="container mx-auto px-6 relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.div className="text-center mb-16 max-w-3xl mx-auto" variants={fadeInUp}>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">O que torna o CyberShield único</h2>
              <p className="text-xl text-muted-foreground">
                Enquanto outros prometem, nós entregamos resultados em minutos
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                {
                  icon: Clock,
                  title: "Velocidade que impressiona",
                  description: "Ameaça detectada? Neutralizada em menos de 15 segundos. Não são horas. São segundos.",
                  badges: ["< 15s resposta", "Tempo real"],
                },
                {
                  icon: Users,
                  title: "Isole cada cliente perfeitamente",
                  description: "MSP com 100 clientes? Cada um vê apenas seus dados. Segurança garantida por design.",
                  badges: ["Zero vazamentos", "Multi-tenant"],
                },
                {
                  icon: FileCheck,
                  title: "Auditorias sem estresse",
                  description: "Cada clique gravado. Cada ação documentada. LGPD e BACEN? Você passa fácil.",
                  badges: ["LGPD pronto", "BACEN 4.893"],
                },
                {
                  icon: CheckCircle2,
                  title: "Controle total, zero erros",
                  description: "Ações críticas precisam de dupla aprovação. Você sempre sabe quem fez o quê.",
                  badges: ["Aprovação dupla"],
                },
                {
                  icon: Lock,
                  title: "Seguro até para bancos",
                  description: "Criptografia militar. Autenticação reforçada. Zero confiança? Temos mTLS.",
                  badges: ["Criptografia", "mTLS"],
                },
                {
                  icon: Activity,
                  title: "Veja tudo acontecendo",
                  description: "Dashboard ao vivo. Status de cada máquina. Alertas instantâneos. Você no controle.",
                  badges: ["Dashboard live"],
                },
              ].map((benefit, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="border-border/50 bg-gradient-to-br from-background/90 to-background/60 backdrop-blur-sm hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10 h-full group">
                    <CardHeader>
                      <motion.div 
                        className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        <benefit.icon className="w-6 h-6 text-primary" />
                      </motion.div>
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">
                        {benefit.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4 leading-relaxed">
                        {benefit.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {benefit.badges.map((badge, i) => (
                          <Badge 
                            key={i} 
                            variant="outline" 
                            className="text-xs border-primary/30 hover:bg-primary/10 transition-colors"
                          >
                            {badge}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-20 relative">
        <div className="container mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.div className="text-center mb-16 max-w-3xl mx-auto" variants={fadeInUp}>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Integra com tudo que você já usa</h2>
              <p className="text-xl text-muted-foreground">
                Não jogue fora suas ferramentas. Potencialize elas.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {[
                {
                  icon: Shield,
                  title: "Seu antivírus turbinado",
                  description: "Defender, Sophos, ESET, Kaspersky... Trabalhamos juntos. Seu AV detecta, nós agimos.",
                },
                {
                  icon: AlertTriangle,
                  title: "VirusTotal integrado",
                  description: "Arquivos suspeitos? Checamos no VirusTotal automaticamente. Sem expor seus dados.",
                },
                {
                  icon: Zap,
                  title: "Alertas onde você está",
                  description: "Slack, Teams, Discord. Receba notificações onde sua equipe já trabalha.",
                },
                {
                  icon: Network,
                  title: "API para tudo",
                  description: "Automatize do seu jeito. Ansible, Terraform, scripts customizados. Total flexibilidade.",
                },
              ].map((integration, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="border-border/50 bg-gradient-to-br from-background/90 to-background/60 backdrop-blur-sm hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10 group">
                    <CardHeader>
                      <div className="flex items-center gap-3 mb-2">
                        <motion.div
                          className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors"
                          whileHover={{ rotate: 360 }}
                          transition={{ duration: 0.5 }}
                        >
                          <integration.icon className="w-5 h-5 text-primary" />
                        </motion.div>
                        <CardTitle className="text-lg group-hover:text-primary transition-colors">
                          {integration.title}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground leading-relaxed">
                        {integration.description}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Security & Compliance */}
      <section className="py-20 bg-gradient-to-b from-muted/30 to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(0,229,160,0.08),transparent_60%)]" />
        <div className="container mx-auto px-6 relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="max-w-4xl mx-auto"
          >
            <motion.div className="text-center mb-12" variants={fadeInUp}>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Segurança que não se negocia</h2>
              <p className="text-xl text-muted-foreground">
                Arquitetura pensada para proteger seus dados desde o primeiro dia
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  icon: Lock,
                  title: "Dados totalmente isolados",
                  description: "Cada cliente vê apenas o seu. Arquitetura que torna vazamentos tecnicamente impossíveis.",
                },
                {
                  icon: Shield,
                  title: "Autenticação militar",
                  description: "Mesma tecnologia usada por bancos. Cada conexão verificada e criptografada.",
                },
                {
                  icon: FileCheck,
                  title: "Registros à prova de adulteração",
                  description: "Cada ação gravada para sempre. Logs imutáveis. Auditores vão amar você.",
                },
                {
                  icon: CheckCircle2,
                  title: "Controle de acesso cirúrgico",
                  description: "Defina quem vê o quê, quem faz o quê. Cada usuário com exatamente o acesso que precisa.",
                },
              ].map((item, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <div className="flex items-start gap-4 p-6 rounded-xl bg-gradient-to-br from-background/90 to-background/60 border border-border/50 hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10 group">
                    <motion.div
                      className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors"
                      whileHover={{ scale: 1.1 }}
                    >
                      <item.icon className="w-6 h-6 text-primary" />
                    </motion.div>
                    <div>
                      <h3 className="font-semibold mb-2 text-lg group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="precos" className="py-20 relative">
        <div className="container mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.div className="text-center mb-16 max-w-3xl mx-auto" variants={fadeInUp}>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Investimento que se paga sozinho</h2>
              <p className="text-xl text-muted-foreground">
                Simples, claro e justo. Sem letrinhas miúdas.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {[
                {
                  name: "Starter",
                  price: "29",
                  description: "Ideal para começar",
                  features: [
                    "1 dispositivo grátis por 30 dias",
                    "Até 10 endpoints",
                    "Jobs ilimitados",
                    "Auditoria básica",
                    "Suporte por email",
                  ],
                  cta: "Começar grátis",
                  popular: false,
                },
                {
                  name: "Pro",
                  price: "79",
                  description: "Para empresas em crescimento",
                  features: [
                    "1 dispositivo grátis por 30 dias",
                    "Até 100 endpoints",
                    "Multi-tenant (até 5 clientes)",
                    "Auditoria completa",
                    "Integrações VirusTotal",
                    "Suporte prioritário",
                  ],
                  cta: "Começar teste",
                  popular: true,
                },
                {
                  name: "Enterprise",
                  price: "Custom",
                  description: "Para MSPs e grandes empresas",
                  features: [
                    "Endpoints ilimitados",
                    "Multi-tenant ilimitado",
                    "SLA garantido",
                    "Suporte dedicado 24/7",
                    "Onboarding personalizado",
                    "Instância dedicada (opcional)",
                  ],
                  cta: "Falar com vendas",
                  popular: false,
                },
              ].map((plan, index) => (
                <motion.div
                  key={index}
                  variants={scaleIn}
                  whileHover={{ y: -8 }}
                >
                  <Card 
                    className={`relative border-border/50 bg-gradient-to-br from-background/90 to-background/60 backdrop-blur-sm hover:shadow-xl transition-all h-full ${
                      plan.popular ? 'border-primary/50 shadow-lg shadow-primary/20' : ''
                    }`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground px-4 py-1 shadow-lg">
                          Mais Popular
                        </Badge>
                      </div>
                    )}
                    <CardHeader className="text-center pb-8 pt-8">
                      <CardTitle className="text-2xl mb-2">{plan.name}</CardTitle>
                      <div className="mb-2">
                        {plan.price === "Custom" ? (
                          <div className="text-4xl font-bold text-primary">Sob consulta</div>
                        ) : (
                          <div className="flex items-baseline justify-center gap-1">
                            <span className="text-muted-foreground">R$</span>
                            <span className="text-5xl font-bold text-primary">{plan.price}</span>
                            <span className="text-muted-foreground">/mês</span>
                          </div>
                        )}
                      </div>
                      <CardDescription>{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-3 mb-8">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-muted-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className={`w-full ${
                          plan.popular
                            ? 'bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25'
                            : 'bg-background border border-primary/30 hover:bg-primary/10'
                        }`}
                        onClick={() => {
                          if (plan.name === "Enterprise") {
                            document.getElementById("contato")?.scrollIntoView({ behavior: "smooth" });
                          } else {
                            navigate("/signup");
                          }
                        }}
                      >
                        {plan.cta}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            <motion.div className="text-center mt-12" variants={fadeInUp}>
              <p className="text-muted-foreground">
                <strong>Teste 30 dias grátis.</strong> Sem cartão. Sem compromisso. Cancele quando quiser.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-gradient-to-b from-muted/30 to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,229,160,0.05),transparent_70%)]" />
        <div className="container mx-auto px-6 relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.div className="text-center mb-16 max-w-3xl mx-auto" variants={fadeInUp}>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Resultados reais de quem usa</h2>
              <p className="text-xl text-muted-foreground">
                Veja o impacto nas palavras de quem já transformou sua segurança
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {[
                {
                  quote: "Resolvemos em 7 dias um problema que nos atormentava há meses. 120 máquinas protegidas. A auditoria foi tão tranquila que parecia mentira.",
                  author: "Carlos Silva",
                  role: "CTO, TechSecure MSP (120+ clientes)",
                },
                {
                  quote: "Meu time ganhava 40 horas por mês. Quarenta! E o melhor: o ROI apareceu no primeiro mês. Melhor investimento que fizemos.",
                  author: "Ana Martins",
                  role: "Gerente de TI, Financeira SP (230 endpoints)",
                },
              ].map((testimonial, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="border-border/50 bg-gradient-to-br from-background/90 to-background/60 backdrop-blur-sm hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10">
                    <CardContent className="p-8">
                      <div className="mb-6">
                        <svg className="w-10 h-10 text-primary/40" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M11.192 15.757c0-.88-.23-1.618-.69-2.217-.326-.412-.768-.683-1.327-.812-.55-.128-1.07-.137-1.54-.028-.16-.95.1-1.956.76-3.022.66-1.065 1.515-1.867 2.558-2.403L9.373 5c-.8.396-1.56.898-2.26 1.505-.71.607-1.34 1.305-1.9 2.094s-.98 1.68-1.25 2.69-.346 2.04-.217 3.1c.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.368l.002.003zm9.124 0c0-.88-.23-1.618-.69-2.217-.326-.42-.77-.692-1.327-.817-.56-.124-1.074-.13-1.54-.022-.16-.94.09-1.95.75-3.02.66-1.06 1.514-1.86 2.557-2.4L18.49 5c-.8.396-1.555.898-2.26 1.505-.708.607-1.34 1.305-1.894 2.094-.556.79-.97 1.68-1.24 2.69-.273 1-.345 2.04-.217 3.1.165 1.4.615 2.52 1.35 3.35.732.833 1.646 1.25 2.742 1.25.967 0 1.768-.29 2.402-.876.627-.576.942-1.365.942-2.368v.01z" />
                        </svg>
                      </div>
                      <p className="text-lg mb-6 leading-relaxed">{testimonial.quote}</p>
                      <div>
                        <div className="font-semibold">{testimonial.author}</div>
                        <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 relative">
        <div className="container mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="max-w-3xl mx-auto"
          >
            <motion.div className="text-center mb-16" variants={fadeInUp}>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Dúvidas? A gente responde</h2>
              <p className="text-xl text-muted-foreground">
                As perguntas que todo mundo faz antes de começar
              </p>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <Accordion type="single" collapsible className="space-y-4">
                {[
                  {
                    question: "Quanto tempo leva para começar?",
                    answer: "Honestamente? Menos tempo que você gastaria tomando um café. 2 minutos por máquina. No final do dia, tudo funcionando. Sem dor de cabeça, sem consultoria cara.",
                  },
                  {
                    question: "Preciso trocar meu antivírus?",
                    answer: "Não! Nós trabalhamos em harmonia com o que você já tem. Defender, Sophos, Kaspersky... Qualquer um. A gente só potencializa o que você já investiu.",
                  },
                  {
                    question: "Meus dados ficam realmente seguros?",
                    answer: "Mais seguros que em um cofre. Cada cliente isolado por design. Criptografia de nível bancário. Logs imutáveis. Se um auditor pedir, você tem tudo na ponta da língua.",
                  },
                  {
                    question: "Como funciona a cobrança?",
                    answer: "Simples: você paga por máquina conectada, por mês. Só isso. Sem surpresas, sem taxas escondidas. Cancelou? Para de cobrar. Simples assim.",
                  },
                  {
                    question: "E se eu precisar de ajuda?",
                    answer: "Depende do seu plano. Starter: email em 48h. Pro: 24h com prioridade. Enterprise: linha direta 24/7. Mas a verdade? O sistema é tão intuitivo que você raramente vai precisar.",
                  },
                ].map((item, index) => (
                  <AccordionItem 
                    key={index} 
                    value={`item-${index}`}
                    className="border border-border/50 rounded-lg px-6 bg-gradient-to-br from-background/90 to-background/60 backdrop-blur-sm hover:border-primary/40 transition-all"
                  >
                    <AccordionTrigger className="text-left hover:text-primary transition-colors">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Contact Form */}
      <section id="contato" className="py-20 bg-gradient-to-b from-muted/30 to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,229,160,0.08),transparent_70%)]" />
        <div className="container mx-auto px-6 relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="max-w-2xl mx-auto"
          >
            <motion.div className="text-center mb-12" variants={fadeInUp}>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Vamos conversar?</h2>
              <p className="text-xl text-muted-foreground">
                Conte seu desafio. A gente mostra como resolver.
              </p>
            </motion.div>

            <motion.div variants={scaleIn}>
              <ContactForm />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-6 h-6 text-primary" />
                <span className="font-bold text-lg">CyberShield</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Orquestração e resposta para endpoints multi-tenant.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Produto</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#como-funciona" className="hover:text-primary transition-colors">Como Funciona</a></li>
                <li><a href="#beneficios" className="hover:text-primary transition-colors">Benefícios</a></li>
                <li><a href="#precos" className="hover:text-primary transition-colors">Preços</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="/privacy" className="hover:text-primary transition-colors">Privacidade</a></li>
                <li><a href="/terms" className="hover:text-primary transition-colors">Termos</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Suporte</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#contato" className="hover:text-primary transition-colors">Contato</a></li>
                <li><a href="/docs" className="hover:text-primary transition-colors">Documentação</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border/40 text-center text-sm text-muted-foreground">
            <p>© 2025 CyberShield. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
