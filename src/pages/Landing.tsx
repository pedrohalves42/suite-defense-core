import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, CheckCircle, Zap, Lock, BarChart, Users, ArrowRight, Mail, MessageCircle, MapPin, Crown, Activity, TrendingUp, Calculator, Briefcase, Laptop, Building2, ShieldCheck, HeadphonesIcon, AlertTriangle, RefreshCw, FileCheck, Undo2, Server, Scale, Stethoscope, FileText, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import { ContactForm } from "@/components/ContactForm";
import { Navbar } from "@/components/Navbar";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CONTACT } from "@/constants/config";

const Landing = () => {
  const whatsappLink = `${CONTACT.WHATSAPP_LINK}?text=${CONTACT.WHATSAPP_TEXT_DEFAULT}`;
  const [deviceCount, setDeviceCount] = useState<number>(10);

  const content = {
    hero: {
      badge: "Empresa Brasileira • Suporte 100% em Português",
      title1: "Tenha controle total dos riscos digitais",
      title2: "da sua empresa",
      description: "Descubra vulnerabilidades, falhas invisíveis e riscos jurídicos",
      descriptionBold: " antes que virem prejuízo, multa ou paralisação.",
      ctaButton: "Fazer diagnóstico gratuito",
      reassurance: "Sem cartão de crédito • Resultado em até 48h"
    },
    benefits: {
      card1: {
        title: "Visibilidade Total",
        description: "Veja todos os computadores da empresa em um único painel — sem precisar de TI."
      },
      card2: {
        title: "Evidência Auditável",
        description: "Histórico técnico de tudo que acontece, pronto para auditoria ou incidente."
      },
      card3: {
        title: "Alertas de Risco Real",
        description: "Só o que importa: riscos reais com ações claras, sem ruído técnico."
      },
      card4: {
        title: "Controle Centralizado",
        description: "Gerencie tudo sem depender de equipe de TI interna."
      }
    },
    calculator: {
      label: "Quantos dispositivos sua empresa possui?"
    },
    painQuestions: [
      "Quem responde se houver vazamento de dados?",
      "Você conseguiria provar que tomou medidas de segurança?",
      "Você sabe hoje quais máquinas estão vulneráveis?",
      "Quanto tempo sua empresa sobreviveria parada?"
    ],
    painNote: "Essa é a realidade de quem não tem visibilidade.",
    howItWorks: {
      step1: {
        title: "Instalamos o agente",
        description: "Instalação rápida em até 3 computadores para iniciar o diagnóstico."
      },
      step2: {
        title: "Encontramos riscos invisíveis",
        description: "Softwares desatualizados, vulnerabilidades e comportamentos suspeitos."
      },
      step3: {
        title: "Você recebe um laudo claro",
        description: "O que corrigir, o que priorizar — ou deixar a CyberShield monitorando."
      }
    }
  };

  // Cálculo baseado no novo pricing B2B V4
  const calculateTier = (devices: number): {
    price: number;
    plan: string;
    baseDevices: number;
    maxDevices: number;
    basePrice: number;
    extraDevices: number;
    extraPrice: number;
    pricePerExtra: number;
    isEnterprise: boolean;
  } => {
    if (devices <= 0 || Number.isNaN(devices)) return {
      price: 0,
      plan: 'Free',
      baseDevices: 3,
      maxDevices: 3,
      basePrice: 0,
      extraDevices: 0,
      extraPrice: 0,
      pricePerExtra: 0,
      isEnterprise: false
    };

    // Free: até 3 dispositivos
    if (devices <= 3) return {
      price: 0,
      plan: 'Free',
      baseDevices: 3,
      maxDevices: 3,
      basePrice: 0,
      extraDevices: 0,
      extraPrice: 0,
      pricePerExtra: 0,
      isEnterprise: false
    };

    // Starter Compliance: R$ 249 base (10 disp) + R$ 29/adicional (máx 50)
    if (devices <= 50) {
      const basePrice = 249;
      const baseDevices = 10;
      const pricePerExtra = 29;
      const extraDevices = Math.max(0, devices - baseDevices);
      const extraPrice = extraDevices * pricePerExtra;
      return {
        price: basePrice + extraPrice,
        plan: 'Starter Compliance',
        baseDevices,
        maxDevices: 50,
        basePrice,
        extraDevices,
        extraPrice,
        pricePerExtra,
        isEnterprise: false
      };
    }

    // Business: R$ 599 base (30 disp) + R$ 24/adicional (máx 200)
    if (devices <= 200) {
      const basePrice = 599;
      const baseDevices = 30;
      const pricePerExtra = 24;
      const extraDevices = Math.max(0, devices - baseDevices);
      const extraPrice = extraDevices * pricePerExtra;
      return {
        price: basePrice + extraPrice,
        plan: 'Business',
        baseDevices,
        maxDevices: 200,
        basePrice,
        extraDevices,
        extraPrice,
        pricePerExtra,
        isEnterprise: false
      };
    }

    // Enterprise: +200 dispositivos
    return {
      price: 0,
      plan: 'Enterprise',
      baseDevices: 200,
      maxDevices: Infinity,
      basePrice: 0,
      extraDevices: 0,
      extraPrice: 0,
      pricePerExtra: 0,
      isEnterprise: true
    };
  };
  const tierResult = calculateTier(deviceCount);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <WhatsAppButton />

      {/* Hero Section */}
      <section id="inicio" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-background animate-gradient-slow" />
        <div className="absolute inset-0 bg-grid-white/[0.02]" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24">
          <div className="text-center space-y-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm animate-pulse-glow">
              <Shield className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm font-medium text-foreground">{content.hero.badge}</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-gradient-x">{content.hero.title1}</span>
              <br />
              <span className="text-foreground">{content.hero.title2}</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              {content.hero.description}<span className="text-foreground font-semibold">{content.hero.descriptionBold}</span>
            </p>

            <div className="flex flex-wrap justify-center gap-8 pt-4">
              <div className="text-center p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                <div className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">até 48h</div>
                <div className="text-sm text-muted-foreground">Diagnóstico gratuito</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                <div className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">24/7</div>
                <div className="text-sm text-muted-foreground">Monitoramento contínuo</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                <div className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Sem TI</div>
                <div className="text-sm text-muted-foreground">Funciona sem equipe técnica</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Button asChild size="lg" className="text-lg h-14 px-8 bg-gradient-to-r from-primary to-accent hover:shadow-glow-primary transition-all hover:scale-105">
                <Link to="/signup">
                  {content.hero.ctaButton}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">{content.hero.reassurance}</p>
          </div>
        </div>
      </section>

      {/* Para Quem É - Nova Seção */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Feito para empresas que não podem parar
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Se você precisa de visibilidade, controle e prova de segurança, o CyberShield é para você
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-primary/20 hover:border-primary/50 transition-all hover:scale-105 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-sm mb-1">PMEs</h3>
              <p className="text-xs text-muted-foreground">10 a 200 computadores</p>
            </div>

            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-primary/20 hover:border-primary/50 transition-all hover:scale-105 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <Scale className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-sm mb-1">Escritórios</h3>
              <p className="text-xs text-muted-foreground">Contábeis e advocacias</p>
            </div>

            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-primary/20 hover:border-primary/50 transition-all hover:scale-105 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <Stethoscope className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-sm mb-1">Clínicas</h3>
              <p className="text-xs text-muted-foreground">Dados sensíveis (LGPD)</p>
            </div>

            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-primary/20 hover:border-primary/50 transition-all hover:scale-105 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <Laptop className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-sm mb-1">Sem TI Interno</h3>
              <p className="text-xs text-muted-foreground">Empresas sem equipe técnica</p>
            </div>

            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-primary/20 hover:border-primary/50 transition-all hover:scale-105 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <Globe className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-sm mb-1">MSPs</h3>
              <p className="text-xs text-muted-foreground">TI terceirizada</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points Section - Emotional Impact */}
      <section className="py-16 relative overflow-hidden bg-gradient-to-b from-destructive/5 to-background">
        <div className="absolute inset-0 bg-grid-white/[0.02]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Impactful Questions */}
          <div className="text-center mb-12 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-destructive/10 border border-destructive/30 backdrop-blur-sm mb-6">
              <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" />
              <span className="text-sm font-medium text-destructive">Pergunte a si mesmo agora</span>
            </div>
            
            {/* Pain Questions - Direct Impact */}
            <div className="space-y-4 mb-8">
              {content.painQuestions?.map((question, index) => (
                <p key={index} className="text-lg md:text-xl font-bold text-foreground">
                  {question}
                </p>
              ))}
            </div>

            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-destructive">
              {content.painNote}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-destructive/20 hover:border-destructive/50 transition-all hover:scale-105">
              <div className="text-3xl mb-3">💸</div>
              <h3 className="font-bold text-lg mb-2 text-destructive">R$ 50 a 200 mil</h3>
              <p className="text-sm text-muted-foreground">Custo médio de ataque para PMEs. Quanto seu caixa aguenta?</p>
            </div>
            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-destructive/20 hover:border-destructive/50 transition-all hover:scale-105">
              <div className="text-3xl mb-3">⏱️</div>
              <h3 className="font-bold text-lg mb-2 text-destructive">7 a 27 dias parado</h3>
              <p className="text-sm text-muted-foreground">Tempo de recuperação sem backup. Seus clientes esperariam?</p>
            </div>
            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-destructive/20 hover:border-destructive/50 transition-all hover:scale-105">
              <div className="text-3xl mb-3">📋</div>
              <h3 className="font-bold text-lg mb-2 text-destructive">Multa de até 2%</h3>
              <p className="text-sm text-muted-foreground">Do faturamento anual por vazamento de dados (LGPD)</p>
            </div>
            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-destructive/20 hover:border-destructive/50 transition-all hover:scale-105">
              <div className="text-3xl mb-3">☠️</div>
              <h3 className="font-bold text-lg mb-2 text-destructive">60% fecham</h3>
              <p className="text-sm text-muted-foreground">Das PMEs brasileiras atacadas não sobrevivem 12 meses</p>
            </div>
          </div>

          <div className="text-center mt-10 space-y-4">
            <Button asChild size="lg" className="bg-gradient-to-r from-destructive to-destructive/80 hover:shadow-lg transition-all hover:scale-105 text-destructive-foreground">
              <Link to="/signup">
                Ver riscos reais da minha empresa (grátis)
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Social Proof - Trust Indicators (Stats do Produto) */}
      <section className="py-12 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary">+5.000</div>
              <p className="text-sm text-muted-foreground mt-1">Computadores empresariais monitorados</p>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary">+100.000</div>
              <p className="text-sm text-muted-foreground mt-1">Riscos detectados antes de virar incidente</p>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary">99,9%</div>
              <p className="text-sm text-muted-foreground mt-1">De disponibilidade</p>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary">🇧🇷</div>
              <p className="text-sm text-muted-foreground mt-1">Empresa 100% Brasileira</p>
            </div>
          </div>
        </div>
      </section>

      {/* O Que o Diagnóstico Mostra - Nova Seção */}
      <section className="py-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background to-muted/30" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              O que você vai ver no diagnóstico
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Sem compromisso, sem cartão de crédito
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6 max-w-5xl mx-auto">
            <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all text-center">
              <CheckCircle className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Máquinas Vulneráveis</h3>
              <p className="text-sm text-muted-foreground">Quais computadores estão expostos</p>
            </div>
            <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all text-center">
              <CheckCircle className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Softwares Desatualizados</h3>
              <p className="text-sm text-muted-foreground">Programas que precisam de update</p>
            </div>
            <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all text-center">
              <CheckCircle className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Riscos Críticos</h3>
              <p className="text-sm text-muted-foreground">O que precisa de ação urgente</p>
            </div>
            <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all text-center">
              <CheckCircle className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Nível de Exposição</h3>
              <p className="text-sm text-muted-foreground">Sua pontuação de risco atual</p>
            </div>
            <div className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all text-center">
              <CheckCircle className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Relatório Inicial</h3>
              <p className="text-sm text-muted-foreground">PDF completo para você</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="recursos" className="py-20 bg-muted/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              O que o CyberShield entrega
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Você passa a ter controle, visibilidade e prova — não só software
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-5xl mx-auto">
            <div className="group relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 text-center transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <BarChart className="w-8 h-8 text-primary group-hover:animate-pulse" />
              </div>
              <h3 className="relative text-xl font-bold mb-3">{content.benefits.card1.title}</h3>
              <p className="relative text-muted-foreground">
                {content.benefits.card1.description}
              </p>
            </div>

            <div className="group relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 text-center transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <FileText className="w-8 h-8 text-primary group-hover:animate-pulse" />
              </div>
              <h3 className="relative text-xl font-bold mb-3">{content.benefits.card2.title}</h3>
              <p className="relative text-muted-foreground">
                {content.benefits.card2.description}
              </p>
            </div>

            <div className="group relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 text-center transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <AlertTriangle className="w-8 h-8 text-primary group-hover:animate-pulse" />
              </div>
              <h3 className="relative text-xl font-bold mb-3">{content.benefits.card3.title}</h3>
              <p className="relative text-muted-foreground">
                {content.benefits.card3.description}
              </p>
            </div>

            <div className="group relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 text-center transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <Shield className="w-8 h-8 text-primary group-hover:animate-pulse" />
              </div>
              <h3 className="relative text-xl font-bold mb-3">{content.benefits.card4.title}</h3>
              <p className="relative text-muted-foreground">
                {content.benefits.card4.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Technology Differentials Section - Enterprise Grade */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm mb-6">
              <Server className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Tecnologia de Nível Empresarial</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Atualização Segura Sem Downtime
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Mantenha todos os seus computadores protegidos e atualizados automaticamente, sem interrupções
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-primary/20 hover:border-primary/50 transition-all hover:scale-105 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <RefreshCw className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-2">Zero Interrupção</h3>
              <p className="text-sm text-muted-foreground">
                Updates em background, ativados no próximo boot natural
              </p>
            </div>

            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-primary/20 hover:border-primary/50 transition-all hover:scale-105 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <FileCheck className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-2">Validação SHA256</h3>
              <p className="text-sm text-muted-foreground">
                Integridade verificada criptograficamente antes de aplicar
              </p>
            </div>

            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-primary/20 hover:border-primary/50 transition-all hover:scale-105 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <Undo2 className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-2">Rollback Automático</h3>
              <p className="text-sm text-muted-foreground">
                Se algo der errado, versão anterior é preservada
              </p>
            </div>

            <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-primary/20 hover:border-primary/50 transition-all hover:scale-105 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <Server className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-2">Escala Empresarial</h3>
              <p className="text-sm text-muted-foreground">
                Funciona com 3 ou 3.000 computadores simultaneamente
              </p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="mt-12 max-w-3xl mx-auto">
            <div className="bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50 overflow-hidden">
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 border-b border-border/50 font-semibold text-sm">
                <div>Recurso</div>
                <div className="text-center text-primary">CyberShield</div>
                <div className="text-center text-muted-foreground">Concorrentes</div>
              </div>
              <div className="divide-y divide-border/50">
                <div className="grid grid-cols-3 gap-4 p-4 text-sm">
                  <div>Update sem restart forçado</div>
                  <div className="text-center text-primary font-bold">✓</div>
                  <div className="text-center text-muted-foreground">✗</div>
                </div>
                <div className="grid grid-cols-3 gap-4 p-4 text-sm">
                  <div>Validação criptográfica</div>
                  <div className="text-center text-primary font-bold">✓</div>
                  <div className="text-center text-muted-foreground">✗</div>
                </div>
                <div className="grid grid-cols-3 gap-4 p-4 text-sm">
                  <div>Rollback automático</div>
                  <div className="text-center text-primary font-bold">✓</div>
                  <div className="text-center text-muted-foreground">✗</div>
                </div>
                <div className="grid grid-cols-3 gap-4 p-4 text-sm">
                  <div>Anti-corrupção de dados</div>
                  <div className="text-center text-primary font-bold">✓</div>
                  <div className="text-center text-muted-foreground">✗</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Casos de Uso Específicos
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Soluções para diferentes setores e necessidades empresariais
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            <div className="group relative bg-card/50 backdrop-blur-sm p-8 rounded-2xl border border-border text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-lg hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative mb-4 inline-block">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <Laptop className="relative mx-auto w-12 h-12 text-primary group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="relative text-xl font-bold mb-2">TI Corporativa</h3>
              <p className="relative text-muted-foreground">Monitoramento e resposta para redes empresariais complexas.</p>
            </div>
            <div className="group relative bg-card/50 backdrop-blur-sm p-8 rounded-2xl border border-border text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-lg hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative mb-4 inline-block">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <Building2 className="relative mx-auto w-12 h-12 text-primary group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="relative text-xl font-bold mb-2">Pequenas e Médias Empresas</h3>
              <p className="relative text-muted-foreground">Soluções acessíveis para proteger seus ativos digitais.</p>
            </div>
            <div className="group relative bg-card/50 backdrop-blur-sm p-8 rounded-2xl border border-border text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-lg hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative mb-4 inline-block">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <ShieldCheck className="relative mx-auto w-12 h-12 text-primary group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="relative text-xl font-bold mb-2">Compliance e Segurança</h3>
              <p className="relative text-muted-foreground">Atenda requisitos regulatórios com relatórios detalhados.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background to-muted/30" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Como Funciona
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Comece em minutos, sem complicação
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="relative text-center p-6">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center text-primary-foreground font-bold text-xl shadow-lg">
                1
              </div>
              <div className="pt-16">
                <h3 className="text-xl font-bold mb-3">{content.howItWorks.step1.title}</h3>
                <p className="text-muted-foreground">{content.howItWorks.step1.description}</p>
              </div>
            </div>

            <div className="relative text-center p-6">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center text-primary-foreground font-bold text-xl shadow-lg">
                2
              </div>
              <div className="pt-16">
                <h3 className="text-xl font-bold mb-3">{content.howItWorks.step2.title}</h3>
                <p className="text-muted-foreground">{content.howItWorks.step2.description}</p>
              </div>
            </div>

            <div className="relative text-center p-6">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center text-primary-foreground font-bold text-xl shadow-lg">
                3
              </div>
              <div className="pt-16">
                <h3 className="text-xl font-bold mb-3">{content.howItWorks.step3.title}</h3>
                <p className="text-muted-foreground">{content.howItWorks.step3.description}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Deep Dive */}
      <section className="py-20 bg-muted/30 relative overflow-hidden">
        <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-3xl md:text-4xl font-bold">
                Recursos Completos para Sua Empresa
              </h2>
              <p className="text-xl text-muted-foreground">
                Monitoramento avançado com interface simples
              </p>

              <div className="grid gap-4">
                <div className="group flex gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                  <div className="shrink-0 w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Shield className="w-6 h-6 text-primary group-hover:rotate-12 transition-transform" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Detecção de Ameaças</h3>
                    <p className="text-muted-foreground">
                      Integração com VirusTotal e Hybrid Analysis para detecção de ameaças em tempo real.
                    </p>
                  </div>
                </div>

                <div className="group flex gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                  <div className="shrink-0 w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Lock className="w-6 h-6 text-primary group-hover:rotate-12 transition-transform" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Quarentena Automática</h3>
                    <p className="text-muted-foreground">
                      Arquivos maliciosos são automaticamente isolados para proteger sua rede.
                    </p>
                  </div>
                </div>

                <div className="group flex gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                  <div className="shrink-0 w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <BarChart className="w-6 h-6 text-primary group-hover:rotate-12 transition-transform" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Relatórios de Compliance</h3>
                    <p className="text-muted-foreground">
                      Exportação de dados e relatórios customizados para compliance e auditoria.
                    </p>
                  </div>
                </div>

                <div className="group flex gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                  <div className="shrink-0 w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Activity className="w-6 h-6 text-primary group-hover:rotate-12 transition-transform" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">API Completa</h3>
                    <p className="text-muted-foreground">
                      Integre com seus sistemas existentes através de nossa API RESTful.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative animate-fade-in">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl blur-3xl animate-pulse-slow" />
              <div className="relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 shadow-glow-primary">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                    <span className="font-medium">Dispositivos Ativos</span>
                    <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">248</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                    <span className="font-medium">Ameaças Bloqueadas Hoje</span>
                    <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">17</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                    <span className="font-medium">Scans Realizados</span>
                    <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">1.2k</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-green-500/10 rounded-lg border border-green-500/30 hover:border-green-500/50 transition-all hover:scale-105 animate-pulse-glow">
                    <span className="font-medium">Status Geral</span>
                    <span className="text-lg font-bold text-green-500">✓ Protegido</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="precos" className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background to-muted/30" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm animate-pulse-glow mb-6">
              <Shield className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm font-medium text-foreground">🎉 Iniciar teste grátis – 14 dias (cartão requerido)</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Proteção completa sem equipe de TI
            </h2>
            <p className="text-lg text-muted-foreground">
              Inventário, antivírus, vulnerabilidades, web, desempenho — tudo em um painel. Agente leve que não deixa o computador lento.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Starter Compliance */}
            <div className="group relative p-8 rounded-2xl border-2 border-border hover:border-primary/50 transition-all duration-300 bg-card/50 backdrop-blur-sm hover:scale-105 hover:shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center gap-2 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg group-hover:scale-110 transition-transform">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold">Starter Compliance</h3>
              </div>
              <div className="relative mb-2">
                <span className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">R$ 249</span>
                <span className="text-muted-foreground">/mês</span>
              </div>
              <p className="relative text-xs text-muted-foreground mb-4">
                Base: 10 dispositivos • +R$ 29/dispositivo adicional<br />
                <span className="font-medium text-primary">Até 50 dispositivos</span>
              </p>
              <p className="relative text-sm text-muted-foreground mb-6">Compliance básico para PMEs em crescimento</p>
              <ul className="relative space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Monitoramento em tempo real</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Inventário de software completo</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Status de antivírus</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Detecção de vulnerabilidades</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Dashboard centralizado</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Suporte por email</span>
                </li>
              </ul>
              <Button variant="outline" className="relative w-full group-hover:bg-primary/10 transition-colors" asChild>
                <Link to="/signup">
                  Começar diagnóstico gratuito
                </Link>
              </Button>
            </div>

            {/* Business - RECOMENDADO */}
            <div className="relative p-8 rounded-2xl scale-105 shadow-2xl backdrop-blur-xl border-2 transition-all duration-300 hover:scale-110 bg-gradient-to-br from-primary via-primary/90 to-accent text-primary-foreground border-primary">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-4 py-1.5 rounded-full text-sm font-bold shadow-lg animate-pulse-glow">
                RECOMENDADO
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Crown className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold">Business</h3>
              </div>
              <div className="mb-2">
                <span className="text-3xl font-bold">R$ 599</span>
                <span className="opacity-90">/mês</span>
              </div>
              <p className="text-xs opacity-80 mb-4">
                Base: 30 dispositivos • +R$ 24/dispositivo adicional<br />
                <span className="font-medium">Até 200 dispositivos</span>
              </p>
              <p className="text-sm opacity-90 mb-6">Para empresas que não podem parar nem errar</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Tudo do Starter, mais:</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold">Scans avançados ilimitados</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold">Relatórios customizados</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold">Analytics avançado de riscos</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Evidências e histórico estendido</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Suporte prioritário</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full bg-white/20 hover:bg-white/30 border-white/30" asChild>
                <Link to="/signup">
                  Começar diagnóstico gratuito
                </Link>
              </Button>
            </div>

            {/* Enterprise / MSP */}
            <div className="group relative p-8 rounded-2xl border-2 border-border hover:border-primary/50 transition-all duration-300 bg-card/50 backdrop-blur-sm hover:scale-105 hover:shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center gap-2 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold">Enterprise / MSP</h3>
              </div>
              <div className="relative mb-6">
                <span className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Sob consulta</span>
              </div>
              <p className="relative text-sm text-muted-foreground mb-6">Para empresas +200 dispositivos ou MSPs</p>
              <ul className="relative space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Tudo do Business, mais:</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold">Suporte dedicado 24/7</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold">SLA formal garantido</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Onboarding dedicado</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Multi-tenant para MSPs</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Descontos por volume (até 35%)</span>
                </li>
              </ul>
              <Button variant="outline" className="relative w-full group-hover:bg-primary/10 transition-colors" asChild>
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  Falar com especialista
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-muted/30 relative overflow-hidden">
        <div className="absolute top-20 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              O Que Nossos Clientes Falam
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Resultados reais de empresas como a sua
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            <Card className="group relative bg-card/50 backdrop-blur-xl border-primary/20 transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardContent className="relative pt-6">
                <div className="mb-4 text-primary/30 text-5xl font-serif leading-none">"</div>
                <p className="mb-6 text-muted-foreground leading-relaxed">"Achávamos que estava tudo certo. Em dois dias surgiram problemas que nunca tinham sido detectados. Não foi confortável de ver, mas evitamos algo muito pior."</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <span className="font-bold text-primary">RC</span>
                  </div>
                  <div>
                    <p className="font-bold">Roberto Costa</p>
                    <p className="text-sm text-muted-foreground">Diretor de TI • Indústria</p>
                    <p className="text-xs text-primary">65 computadores monitorados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="group relative bg-card/50 backdrop-blur-xl border-primary/20 transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardContent className="relative pt-6">
                <div className="mb-4 text-primary/30 text-5xl font-serif leading-none">"</div>
                <p className="mb-6 text-muted-foreground leading-relaxed">"Instalamos pensando só em antivírus. Descobrimos que 3 máquinas de produção estavam expostas sem ninguém saber. Resolvemos antes de virar incidente."</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <span className="font-bold text-primary">AS</span>
                  </div>
                  <div>
                    <p className="font-bold">Ana Silva</p>
                    <p className="text-sm text-muted-foreground">Gerente de Segurança • Varejo</p>
                    <p className="text-xs text-primary">120 computadores protegidos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="group relative bg-card/50 backdrop-blur-xl border-primary/20 transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardContent className="relative pt-6">
                <div className="mb-4 text-primary/30 text-5xl font-serif leading-none">"</div>
                <p className="mb-6 text-muted-foreground leading-relaxed">"O suporte é rápido e direto — sem enrolação técnica. Quando tive uma dúvida sobre LGPD, já me mandaram um relatório pronto."</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <span className="font-bold text-primary">MF</span>
                  </div>
                  <div>
                    <p className="font-bold">Marcos Ferreira</p>
                    <p className="text-sm text-muted-foreground">CEO • Startup SaaS</p>
                    <p className="text-xs text-primary">28 computadores protegidos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Perguntas Frequentes
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Tire suas dúvidas antes de começar
            </p>
          </div>

          <Accordion type="single" collapsible className="max-w-3xl mx-auto space-y-4">
            <AccordionItem value="q1">
              <AccordionTrigger>Preciso instalar em todos os computadores?</AccordionTrigger>
              <AccordionContent>
                Não. O diagnóstico inicial funciona com poucos dispositivos para mapear riscos reais.
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="q0">
              <AccordionTrigger>Funciona sem equipe de TI?</AccordionTrigger>
              <AccordionContent>
                Sim. O laudo já vem com prioridades claras e ações recomendadas.
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="q2">
              <AccordionTrigger>Funciona com Mac e Linux?</AccordionTrigger>
              <AccordionContent>
                Sim! O CyberShield funciona em Windows, Mac e Linux. Você pode proteger todos os dispositivos da sua empresa, independente do sistema operacional.
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="q3">
              <AccordionTrigger>E se eu não gostar? Posso cancelar?</AccordionTrigger>
              <AccordionContent>
                Claro! Você tem 14 dias para testar gratuitamente, sem compromisso. Se não gostar, basta cancelar - não cobramos nada. Sem perguntas, sem burocracia.
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="q4">
              <AccordionTrigger>Meus dados ficam seguros com vocês?</AccordionTrigger>
              <AccordionContent>
                Sim. Dados criptografados e acesso controlado.
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="q5">
              <AccordionTrigger>Vocês são empresa brasileira? Têm CNPJ?</AccordionTrigger>
              <AccordionContent>
                Sim! Somos uma empresa 100% brasileira, com CNPJ, nota fiscal e suporte totalmente em português. Você pode confiar que terá suporte local e atendimento humano.
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="q6">
              <AccordionTrigger>Como funciona o período de teste?</AccordionTrigger>
              <AccordionContent>
                Você tem 14 dias com acesso completo a todos os recursos. Não pedimos cartão de crédito para começar. Se gostar, escolhe um plano. Se não gostar, é só não fazer nada - cancela automaticamente.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="q7">
              <AccordionTrigger>Vocês emitem nota fiscal?</AccordionTrigger>
              <AccordionContent>
                Sim, emitimos nota fiscal para todas as assinaturas. Você pode usar para prestação de contas e compliance da sua empresa.
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="q8">
              <AccordionTrigger>Ajuda com LGPD?</AccordionTrigger>
              <AccordionContent>
                Sim! Nossos relatórios ajudam a demonstrar que sua empresa toma medidas de segurança, o que é exigido pela LGPD. Fornecemos documentação e logs de auditoria.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* Calculator Section */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">
            Qual Plano é Ideal Para Você?
          </h2>
          <p className="text-center text-muted-foreground mb-8">
            {content.calculator.label}
          </p>
          <div className="flex flex-col items-center gap-6 justify-center">
            <Input 
              type="number" 
              min={1} 
              max={500} 
              value={deviceCount} 
              onChange={e => setDeviceCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} 
              className="max-w-xs text-center text-lg" 
              aria-label={content.calculator.label} 
            />
            
            <Card className="w-full max-w-md border-primary/20 bg-card/50 backdrop-blur">
              <CardContent className="pt-6 text-center">
                {tierResult.isEnterprise ? (
                  <>
                    <div className="text-sm text-muted-foreground mb-2">Plano Recomendado</div>
                    <div className="text-2xl font-bold text-primary mb-2">Enterprise</div>
                    <p className="text-muted-foreground mb-4">
                      Para {deviceCount}+ dispositivos, entre em contato para um plano personalizado.
                    </p>
                    <Button asChild className="w-full">
                      <Link to="/pricing">Ver Planos Enterprise</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-muted-foreground mb-2">Plano Recomendado</div>
                    <div className="text-2xl font-bold text-primary mb-1">{tierResult.plan}</div>
                    <div className="text-3xl font-bold mb-2">
                      {tierResult.price === 0 ? 'Grátis' : `R$ ${tierResult.price}/mês`}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Inclui até {tierResult.maxDevices} dispositivos
                    </p>
                    <Button asChild className="w-full">
                      <Link to="/pricing">Ver Detalhes do Plano</Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Final Section */}
      <section className="py-16 bg-gradient-to-r from-primary/10 to-accent/10 border-y border-primary/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">
            Veja como está a segurança da sua empresa
          </h2>
          <Button asChild size="lg" className="text-lg h-14 px-10 bg-gradient-to-r from-primary to-accent hover:shadow-glow-primary transition-all hover:scale-105">
            <Link to="/signup">
              Fazer diagnóstico gratuito
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground mt-4">Sem cartão de crédito • Resultado em até 48h</p>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contato" className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">Fale Conosco</h2>
          <ContactForm />
        </div>
      </section>
    </div>
  );
};

export default Landing;
