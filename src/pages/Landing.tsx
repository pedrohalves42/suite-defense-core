import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, CheckCircle, Zap, Lock, BarChart, Users, ArrowRight, Mail, MessageCircle, MapPin, Crown, Activity, TrendingUp, Calculator, Home, Briefcase, Laptop, Baby, Building2, ShieldCheck, HeadphonesIcon, AlertTriangle, RefreshCw, FileCheck, Undo2, Server } from "lucide-react";
import { Link } from "react-router-dom";
import { ContactForm } from "@/components/ContactForm";
import { Navbar } from "@/components/Navbar";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CONTACT } from "@/constants/config";
type Audience = 'business' | 'home';
const Landing = () => {
  const whatsappLink = `${CONTACT.WHATSAPP_LINK}?text=${CONTACT.WHATSAPP_TEXT_DEFAULT}`;
  const [deviceCount, setDeviceCount] = useState<number>(10);
  const [audience, setAudience] = useState<Audience>('business');
  const content = {
    business: {
      hero: {
        badge: "Empresa Brasileira • Suporte 100% em Português",
        title1: "Pare de se preocupar com vírus e hackers",
        title2: "Tenha visibilidade real dos riscos da sua empresa",
        description: "Descubra vulnerabilidades invisíveis, softwares desatualizados e riscos críticos",
        descriptionBold: " antes que virem prejuízo, multa ou paralisação.",
        stat1Label: "Diagnóstico gratuito",
        stat1Value: "48h",
        stat2Label: "Monitoramento contínuo",
        ctaButton: "Ver riscos reais da minha empresa (grátis)",
        reassurance: "Planos a partir de R$ 150/mês após o diagnóstico. Sem cartão de crédito."
      },
      benefits: {
        card1: {
          title: "Veja tudo que acontece",
          description: "Veja tudo que acontece nos computadores da empresa em um único painel simples."
        },
        card2: {
          title: "Reaja antes da crise",
          description: "Reaja antes do problema virar crise. Alertas claros e ações sugeridas."
        },
        card3: {
          title: "Menos interrupções",
          description: "Menos interrupções, mais tranquilidade. Funciona mesmo sem equipe de TI."
        },
        card4: {
          title: "Tecnologia simplificada",
          description: "Tecnologia usada por grandes empresas, simplificada para PMEs."
        }
      },
      calculator: {
        label: "Quantos dispositivos sua empresa possui?"
      },
      painQuestions: ["O que acontece se sua empresa parar amanhã?", "Você sabe quais riscos estão invisíveis agora?", "Quem responde se houver vazamento de dados?"],
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
    },
    home: {
      hero: {
        badge: "Proteção Fácil • Suporte via WhatsApp",
        title1: "Suas Fotos e Dados",
        title2: "Protegidos de Hackers",
        description: "Proteção automática para todos os computadores de casa",
        descriptionBold: " — mesmo que você não entenda nada de tecnologia.",
        stat1Label: "Diagnóstico gratuito",
        stat1Value: "48h",
        stat2Label: "Ideal para 1-10 PCs",
        ctaButton: "Quero meu diagnóstico gratuito",
        reassurance: "Sem cartão de crédito • Cancelamento simples"
      },
      benefits: {
        card1: {
          title: "Veja tudo que acontece",
          description: "Do seu home office ao computador dos filhos – tudo num único painel simples."
        },
        card2: {
          title: "Proteção automática 24h",
          description: "Vírus e ameaças bloqueados automaticamente, sem você precisar fazer nada."
        },
        card3: {
          title: "Menos interrupções",
          description: "Chega de chamar técnico. Menos interrupções, mais tranquilidade."
        },
        card4: {
          title: "Tecnologia simplificada",
          description: "Proteção de nível empresarial, simplificada para sua casa."
        }
      },
      calculator: {
        label: "Quantos computadores você tem em casa?"
      },
      painQuestions: ["Suas fotos e documentos estão realmente seguros?", "Você sabe o que acontece no seu computador quando não está olhando?", "Quem protege sua família online?"],
      painNote: "Famílias são alvos fáceis porque não têm proteção profissional.",
      howItWorks: {
        step1: {
          title: "Instalamos o agente",
          description: "Instalamos o agente em até 3 computadores para começar o diagnóstico."
        },
        step2: {
          title: "Encontramos riscos invisíveis",
          description: "Identificamos vírus ocultos, programas suspeitos e vulnerabilidades."
        },
        step3: {
          title: "Você recebe um relatório claro",
          description: "Relatório simples com o que corrigir — ou deixa o CyberShield protegendo."
        }
      }
    }
  };
  const currentContent = content[audience];

  // Cálculo baseado em tiers híbridos (base + adicional por dispositivo)
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

    // Starter: R$ 150 base (5 disp) + R$ 20/adicional (máx 30)
    if (devices <= 30) {
      const basePrice = 150;
      const baseDevices = 5;
      const pricePerExtra = 20;
      const extraDevices = Math.max(0, devices - baseDevices);
      const extraPrice = extraDevices * pricePerExtra;
      return {
        price: basePrice + extraPrice,
        plan: 'Starter',
        baseDevices,
        maxDevices: 30,
        basePrice,
        extraDevices,
        extraPrice,
        pricePerExtra,
        isEnterprise: false
      };
    }

    // Business: R$ 450 base (25 disp) + R$ 18/adicional (máx 200)
    if (devices <= 200) {
      const basePrice = 450;
      const baseDevices = 25;
      const pricePerExtra = 18;
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
  return <div className="min-h-screen bg-background">
      <Navbar />
      <WhatsAppButton />

      {/* Hero Section with Toggle */}
      <section id="inicio" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-background animate-gradient-slow" />
        <div className="absolute inset-0 bg-grid-white/[0.02]" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse-slow" style={{
        animationDelay: '1s'
      }} />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24">
          <div className="text-center space-y-8 animate-fade-in">
            {/* Toggle de Contexto */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 p-1.5 rounded-full bg-card/80 backdrop-blur-xl border border-primary/20 shadow-glow-primary">
                <button onClick={() => setAudience('business')} className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all duration-300 ${audience === 'business' ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                  <Briefcase className="w-4 h-4" />
                  <span className="text-sm font-medium">Para Empresas</span>
                </button>
                <button onClick={() => setAudience('home')} className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all duration-300 ${audience === 'home' ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                  <Home className="w-4 h-4" />
                  <span className="text-sm font-medium">Para Minha Casa</span>
                </button>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm animate-pulse-glow">
              <Shield className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm font-medium text-foreground">{currentContent.hero.badge}</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-gradient-x">{currentContent.hero.title1}</span>
              <br />
              <span className="text-foreground">{currentContent.hero.title2}</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              {currentContent.hero.description}<span className="text-foreground font-semibold">{currentContent.hero.descriptionBold}</span>
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
                  {currentContent.hero.ctaButton}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">{currentContent.hero.reassurance}</p>
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
              {currentContent.painQuestions?.map((question, index) => <p key={index} className="text-lg md:text-xl font-bold text-foreground">
                  {question}
                </p>)}
            </div>

            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-destructive">
              {currentContent.painNote}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {audience === 'business' ? <>
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
              </> : <>
                <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-destructive/20 hover:border-destructive/50 transition-all hover:scale-105">
                  <div className="text-3xl mb-3">📸</div>
                  <h3 className="font-bold text-lg mb-2 text-destructive">Fotos Sequestradas</h3>
                  <p className="text-sm text-muted-foreground">Hackers podem exigir R$ 5.000 para devolver suas fotos de família.</p>
                </div>
                <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-destructive/20 hover:border-destructive/50 transition-all hover:scale-105">
                  <div className="text-3xl mb-3">💳</div>
                  <h3 className="font-bold text-lg mb-2 text-destructive">Conta Zerada</h3>
                  <p className="text-sm text-muted-foreground">Vírus podem roubar seus dados bancários e esvaziar sua conta.</p>
                </div>
                <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-destructive/20 hover:border-destructive/50 transition-all hover:scale-105">
                  <div className="text-3xl mb-3">👨‍👩‍👧</div>
                  <h3 className="font-bold text-lg mb-2 text-destructive">Filhos em Perigo</h3>
                  <p className="text-sm text-muted-foreground">Sem monitoramento, crianças acessam sites perigosos todos os dias.</p>
                </div>
                <div className="group p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-destructive/20 hover:border-destructive/50 transition-all hover:scale-105">
                  <div className="text-3xl mb-3">🐌</div>
                  <h3 className="font-bold text-lg mb-2 text-destructive">PC Travando</h3>
                  <p className="text-sm text-muted-foreground">Vírus escondidos deixam seu computador lento e inutilizável.</p>
                </div>
              </>}
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
              <p className="text-sm text-muted-foreground mt-1">Computadores analisados</p>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary">+100.000</div>
              <p className="text-sm text-muted-foreground mt-1">Riscos identificados</p>
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

      {/* Benefits Section */}
      <section id="recursos" className="py-20 bg-muted/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              {audience === 'business' ? "Por Que Escolher o CyberShield" : "Benefícios para Sua Casa"}
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              {audience === 'business' ? "Proteção empresarial simplificada com tecnologia de ponta" : "Segurança digital fácil para proteger sua família e seus dispositivos"}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="group relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 text-center transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <BarChart className="w-8 h-8 text-primary group-hover:animate-pulse" />
              </div>
              <h3 className="relative text-xl font-bold mb-3">{currentContent.benefits.card1.title}</h3>
              <p className="relative text-muted-foreground">
                {currentContent.benefits.card1.description}
              </p>
            </div>

            <div className="group relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 text-center transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <Zap className="w-8 h-8 text-primary group-hover:animate-pulse" />
              </div>
              <h3 className="relative text-xl font-bold mb-3">{currentContent.benefits.card2.title}</h3>
              <p className="relative text-muted-foreground">
                {currentContent.benefits.card2.description}
              </p>
            </div>

            <div className="group relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 text-center transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                <TrendingUp className="w-8 h-8 text-primary group-hover:animate-pulse" />
              </div>
              <h3 className="relative text-xl font-bold mb-3">{currentContent.benefits.card3.title}</h3>
              <p className="relative text-muted-foreground">
                {currentContent.benefits.card3.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Technology Differentials Section - Enterprise Grade */}
      {audience === 'business' && (
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
      )}

      {/* Use Cases Section */}
      <section className="py-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              {audience === 'business' ? "Casos de Uso Específicos" : "Como o CyberShield Protege Sua Casa"}
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              {audience === 'business' ? "Soluções para diferentes setores e necessidades empresariais" : "Proteção para todos os dispositivos e membros da família"}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            {audience === 'business' ? <>
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
              </> : <>
                <div className="group relative bg-card/50 backdrop-blur-sm p-8 rounded-2xl border border-border text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-lg hover:border-primary/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative mb-4 inline-block">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Laptop className="relative mx-auto w-12 h-12 text-primary group-hover:scale-110 transition-transform" />
                  </div>
                  <h3 className="relative text-xl font-bold mb-2">Home Office Seguro</h3>
                  <p className="relative text-muted-foreground">Proteja seu computador de trabalho e dados pessoais.</p>
                </div>
                <div className="group relative bg-card/50 backdrop-blur-sm p-8 rounded-2xl border border-border text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-lg hover:border-primary/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative mb-4 inline-block">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Baby className="relative mx-auto w-12 h-12 text-primary group-hover:scale-110 transition-transform" />
                  </div>
                  <h3 className="relative text-xl font-bold mb-2">Proteção para Crianças</h3>
                  <p className="relative text-muted-foreground">Mantenha os dispositivos dos filhos seguros contra ameaças.</p>
                </div>
                <div className="group relative bg-card/50 backdrop-blur-sm p-8 rounded-2xl border border-border text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-lg hover:border-primary/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative mb-4 inline-block">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Users className="relative mx-auto w-12 h-12 text-primary group-hover:scale-110 transition-transform" />
                  </div>
                  <h3 className="relative text-xl font-bold mb-2">Família Conectada</h3>
                  <p className="relative text-muted-foreground">Gerencie a segurança de todos os dispositivos da casa.</p>
                </div>
              </>}
          </div>
        </div>
      </section>

      {/* How It Works - V4 Reformulado */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute top-1/4 left-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-10 w-64 h-64 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{
        animationDelay: '1.5s'
      }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Como Funciona
            </h2>
            <p className="text-xl text-muted-foreground">
              Simples assim
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="group relative">
              <div className="absolute -top-4 -left-4 w-20 h-20 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" />
              <div className="relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 h-full transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                <div className="w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform">
                  <span className="text-2xl font-bold text-primary-foreground">1</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">{currentContent.howItWorks.step1.title}</h3>
                <p className="text-muted-foreground text-lg">
                  {currentContent.howItWorks.step1.description}
                </p>
              </div>
            </div>

            <div className="group relative">
              <div className="absolute -top-4 -left-4 w-20 h-20 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" style={{
              animationDelay: '0.5s'
            }} />
              <div className="relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 h-full transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                <div className="w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform">
                  <span className="text-2xl font-bold text-primary-foreground">2</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">{currentContent.howItWorks.step2.title}</h3>
                <p className="text-muted-foreground text-lg">
                  {currentContent.howItWorks.step2.description}
                </p>
              </div>
            </div>

            <div className="group relative">
              <div className="absolute -top-4 -left-4 w-20 h-20 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" style={{
              animationDelay: '1s'
            }} />
              <div className="relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 h-full transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                <div className="w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform">
                  <span className="text-2xl font-bold text-primary-foreground">3</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">{currentContent.howItWorks.step3.title}</h3>
                <p className="text-muted-foreground text-lg">
                  {currentContent.howItWorks.step3.description}
                </p>
              </div>
            </div>
          </div>
          
          <div className="text-center mt-12">
            <Button asChild size="lg" className="bg-gradient-to-r from-primary to-accent hover:shadow-glow-primary transition-all hover:scale-105">
              <Link to="/signup">
                Ver riscos reais da minha empresa (grátis)
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-muted/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/50" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="animate-fade-in">
              <h2 className="text-2xl md:text-3xl font-bold mb-6">
                {audience === 'business' ? "Recursos Essenciais" : "Recursos para Sua Casa"}
              </h2>
              <div className="space-y-6">
                <div className="group flex gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                  <div className="shrink-0 w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Zap className="w-6 h-6 text-primary group-hover:rotate-12 transition-transform" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{audience === 'business' ? "Scans de Vírus Avançados" : "Proteção Contra Vírus"}</h3>
                    <p className="text-muted-foreground">
                      {audience === 'business' ? "Integração com VirusTotal e Hybrid Analysis para detecção de ameaças em tempo real." : "Detecta e remove vírus e malwares automaticamente."}
                    </p>
                  </div>
                </div>

                <div className="group flex gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                  <div className="shrink-0 w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Lock className="w-6 h-6 text-primary group-hover:rotate-12 transition-transform" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{audience === 'business' ? "Quarentena Automática" : "Isolamento de Ameaças"}</h3>
                    <p className="text-muted-foreground">
                      {audience === 'business' ? "Arquivos maliciosos são automaticamente isolados para proteger sua rede." : "Arquivos suspeitos são isolados para manter sua casa segura."}
                    </p>
                  </div>
                </div>

                <div className="group flex gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                  <div className="shrink-0 w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <BarChart className="w-6 h-6 text-primary group-hover:rotate-12 transition-transform" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{audience === 'business' ? "Relatorios Detalhados" : "Relatorios Simples"}</h3>
                    <p className="text-muted-foreground">
                      {audience === 'business' ? "Exportacao de dados e relatorios customizados para compliance e auditoria." : "Relatorios faceis de entender sobre a seguranca da sua casa."}
                    </p>
                  </div>
                </div>

                <div className="group flex gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                  <div className="shrink-0 w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Activity className="w-6 h-6 text-primary group-hover:rotate-12 transition-transform" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{audience === 'business' ? "API Completa" : "Suporte Facil"}</h3>
                    <p className="text-muted-foreground">
                      {audience === 'business' ? "Integre com seus sistemas existentes atraves de nossa API RESTful." : "Suporte via WhatsApp para tirar duvidas e ajudar na instalacao."}
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
                    <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{audience === 'business' ? "248" : "10"}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                    <span className="font-medium">Ameacas Bloqueadas Hoje</span>
                    <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{audience === 'business' ? "17" : "5"}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                    <span className="font-medium">Scans Realizados</span>
                    <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{audience === 'business' ? "1.2k" : "150"}</span>
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
              {audience === 'business' ? "Proteção completa sem equipe de TI" : "Planos para Sua Casa"}
            </h2>
            <p className="text-lg text-muted-foreground">
              {audience === 'business' ? "Inventário, antivírus, vulnerabilidades, web, desempenho — tudo em um painel. Agente leve que não deixa o computador lento." : "Planos acessíveis para proteger todos os computadores da sua casa"}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Starter */}
            <div className="group relative p-8 rounded-2xl border-2 border-border hover:border-primary/50 transition-all duration-300 bg-card/50 backdrop-blur-sm hover:scale-105 hover:shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center gap-2 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg group-hover:scale-110 transition-transform">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold">{audience === 'business' ? "Starter" : "Básico"}</h3>
              </div>
              <div className="relative mb-2">
                <span className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{audience === 'business' ? "R$ 150" : "R$ 15"}</span>
                <span className="text-muted-foreground">/{audience === 'business' ? "mês" : "computador/mês"}</span>
              </div>
              {audience === 'business' && <p className="relative text-xs text-muted-foreground mb-4">
                  Base: 5 dispositivos • +R$ 20/dispositivo adicional<br />
                  <span className="font-medium text-primary">Até 30 dispositivos</span>
                </p>}
              <p className="relative text-sm text-muted-foreground mb-6">{audience === 'business' ? "Ideal para micro e pequenas empresas" : "Ideal para até 3 computadores em casa"}</p>
              <ul className="relative space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Dashboard centralizado" : "Proteção básica contra vírus"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Monitoramento em tempo real" : "Scans automáticos semanais"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Inventário de software" : "Monitoramento básico em tempo real"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Status do antivírus" : "Suporte via WhatsApp"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Suporte por email" : "14 dias grátis para testar"}</span>
                </li>
              </ul>
              <Button variant="outline" className="relative w-full group-hover:bg-primary/10 transition-colors" asChild>
                <Link to="/signup">
                  Começar diagnóstico gratuito
                </Link>
              </Button>
            </div>

            {/* Business */}
            <div className={`relative p-8 rounded-2xl scale-105 shadow-2xl backdrop-blur-xl border-2 transition-all duration-300 hover:scale-110 ${audience === 'business' ? 'bg-gradient-to-br from-primary via-primary/90 to-accent text-primary-foreground border-primary' : 'bg-gradient-to-br from-green-400 via-green-500 to-green-600 text-white border-green-400'}`}>
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-4 py-1.5 rounded-full text-sm font-bold shadow-lg animate-pulse-glow">
                {audience === 'business' ? "RECOMENDADO" : "MELHOR PARA CASA"}
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Crown className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold">{audience === 'business' ? "Business" : "Completo"}</h3>
              </div>
              <div className="mb-2">
                <span className="text-3xl font-bold">{audience === 'business' ? "R$ 450" : "R$ 30"}</span>
                <span className="opacity-90">/{audience === 'business' ? "mês" : "computador/mês"}</span>
              </div>
              {audience === 'business' && <p className="text-xs opacity-80 mb-4">
                  Base: 25 dispositivos • +R$ 18/dispositivo adicional<br />
                  <span className="font-medium">Até 200 dispositivos</span>
                </p>}
              <p className="text-sm opacity-90 mb-6">{audience === 'business' ? "Para pequenas e médias empresas" : "Proteção completa para até 10 computadores"}</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Tudo do Starter, mais:" : "Tudo do Básico, mais:"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Scans avançados ilimitados" : "Scans diários automáticos"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Relatórios customizados" : "Isolamento automático de ameaças"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Suporte prioritário" : "Suporte dedicado via WhatsApp"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Analytics avançado" : "Relatórios simples e claros"}</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full bg-white/20 hover:bg-white/30 border-white/30" asChild>
                <Link to="/signup">
                  Começar diagnóstico gratuito
                </Link>
              </Button>
            </div>

            {/* Enterprise */}
            <div className="group relative p-8 rounded-2xl border-2 border-border hover:border-primary/50 transition-all duration-300 bg-card/50 backdrop-blur-sm hover:scale-105 hover:shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center gap-2 mb-4">
                <div className="p-2 bg-primary/10 rounded-lg group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold">{audience === 'business' ? "Enterprise" : "Avançado"}</h3>
              </div>
              <div className="relative mb-6">
                <span className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{audience === 'business' ? "Sob consulta" : "R$ 50"}</span>
                <span className="text-muted-foreground">{audience === 'business' ? "" : "/computador/mês"}</span>
              </div>
              <p className="relative text-sm text-muted-foreground mb-6">{audience === 'business' ? "Para grandes empresas - dispositivos ilimitados" : "Para casas com muitos dispositivos"}</p>
              <ul className="relative space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Tudo do Business, mais:" : "Tudo do Completo, mais:"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Suporte dedicado 24/7" : "Suporte premium 24/7"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Consultoria personalizada" : "Consultoria para segurança doméstica"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "SLA garantido e onboarding dedicado" : "Relatórios detalhados"}</span>
                </li>
              </ul>
              <Button variant="outline" className="relative w-full group-hover:bg-primary/10 transition-colors" asChild>
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  Fale Conosco
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials - More Authentic */}
      <section className="py-20 bg-muted/30 relative overflow-hidden">
        <div className="absolute top-20 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{
        animationDelay: '1s'
      }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {audience === 'business' ? "O Que Nossos Clientes Falam" : "O Que as Famílias Falam"}
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {audience === 'business' ? "Resultados reais de empresas como a sua" : "Pessoas reais protegendo suas famílias"}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            {audience === 'business' ? <>
                {/* Depoimentos V4 com fricção */}
                <Card className="group relative bg-card/50 backdrop-blur-xl border-primary/20 transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-primary/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"Achávamos que estava tudo certo. Em dois dias surgiram problemas que nunca tinham sido detectados. Não foi confortável de ver, mas evitamos algo muito pior."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="font-bold text-primary">RS</span>
                      </div>
                      <div>
                        <p className="font-bold">Sócio</p>
                        <p className="text-sm text-muted-foreground">Escritório Contábil (SP)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="group relative bg-card/50 backdrop-blur-xl border-primary/20 transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-primary/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"O relatório mostrou riscos que passariam fácil numa auditoria comum. Ajustamos antes que virasse um problema sério."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="font-bold text-primary">CS</span>
                      </div>
                      <div>
                        <p className="font-bold">Diretor de TI</p>
                        <p className="text-sm text-muted-foreground">Distribuidora (RJ)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="group relative bg-card/50 backdrop-blur-xl border-primary/20 transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-primary/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"O suporte respondeu rápido, mas o principal foi a clareza do laudo. Finalmente entendemos onde estavam os riscos."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="font-bold text-primary">JC</span>
                      </div>
                      <div>
                        <p className="font-bold">CEO</p>
                        <p className="text-sm text-muted-foreground">Startup Tech (SP)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </> : <>
                <Card className="group relative bg-card/50 backdrop-blur-xl border-green-500/20 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-green-500/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-green-500/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"Meu filho clicou num link suspeito e <span className="font-semibold text-foreground">o CyberShield bloqueou na hora</span>. Recebi o alerta no celular e pude conversar com ele sobre segurança online."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="font-bold text-green-600">MS</span>
                      </div>
                      <div>
                        <p className="font-bold">Mariana Souza</p>
                        <p className="text-sm text-muted-foreground">Mãe de 2 filhos • São Paulo</p>
                        <p className="text-xs text-green-600">4 computadores protegidos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="group relative bg-card/50 backdrop-blur-xl border-green-500/20 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-green-500/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-green-500/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"Eu não entendia nada de computador, mas <span className="font-semibold text-foreground">instalei sozinho em 5 minutos</span>. Quando tive dúvida, o suporte no WhatsApp me ajudou na hora."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="font-bold text-green-600">LF</span>
                      </div>
                      <div>
                        <p className="font-bold">Lucas Fernandes</p>
                        <p className="text-sm text-muted-foreground">Aposentado • Curitiba</p>
                        <p className="text-xs text-green-600">2 computadores protegidos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="group relative bg-card/50 backdrop-blur-xl border-green-500/20 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-green-500/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-green-500/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"Antes eu pagava R$ 150 por mês em antivírus separados. Agora <span className="font-semibold text-foreground">protejo 6 computadores por menos da metade</span>. E ainda vejo tudo pelo celular."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="font-bold text-green-600">FL</span>
                      </div>
                      <div>
                        <p className="font-bold">Fernanda Lima</p>
                        <p className="text-sm text-muted-foreground">Advogada • Rio de Janeiro</p>
                        <p className="text-xs text-green-600">6 computadores protegidos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>}
          </div>
        </div>
      </section>

      {/* FAQ Section - Expanded */}
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
            {/* Common Questions for Both */}
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
                Sim! O CyberShield funciona em Windows, Mac e Linux. Você pode proteger todos os dispositivos da sua {audience === 'business' ? 'empresa' : 'casa'}, independente do sistema operacional.
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
            
            {audience === 'business' && <>
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
              </>}
            
            {audience === 'home' && <>
                <AccordionItem value="q7">
                  <AccordionTrigger>Posso monitorar o computador dos meus filhos?</AccordionTrigger>
                  <AccordionContent>
                    Sim! Você pode ver quais sites são acessados e receber alertas se houver tentativas de acesso a conteúdo perigoso. Tudo pelo painel do CyberShield.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="q8">
                  <AccordionTrigger>Deixa o computador lento?</AccordionTrigger>
                  <AccordionContent>
                    Não! O CyberShield foi desenvolvido para ser leve e não impactar a performance do seu computador. Você nem vai perceber que está rodando.
                  </AccordionContent>
                </AccordionItem>
              </>}
          </Accordion>
        </div>
      </section>

      {/* Calculator Section */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">
            {audience === 'business' ? "Qual Plano é Ideal Para Você?" : "Qual Plano é Ideal Para Sua Casa?"}
          </h2>
          <p className="text-center text-muted-foreground mb-8">
            {currentContent.calculator.label}
          </p>
          <div className="flex flex-col items-center gap-6 justify-center">
            <Input type="number" min={1} max={500} value={deviceCount} onChange={e => setDeviceCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} className="max-w-xs text-center text-lg" aria-label={currentContent.calculator.label} />
            
            <Card className="w-full max-w-md border-primary/20 bg-card/50 backdrop-blur">
              <CardContent className="pt-6 text-center">
                {tierResult.isEnterprise ? <>
                    <div className="text-sm text-muted-foreground mb-2">Plano Recomendado</div>
                    <div className="text-2xl font-bold text-primary mb-2">Enterprise</div>
                    <p className="text-muted-foreground mb-4">
                      Para {deviceCount}+ dispositivos, entre em contato para um plano personalizado.
                    </p>
                    <Button asChild className="w-full">
                      <Link to="/pricing">Ver Planos Enterprise</Link>
                    </Button>
                  </> : <>
                    <div className="text-sm text-muted-foreground mb-2">Plano Recomendado</div>
                    <div className="text-2xl font-bold text-primary mb-1">{tierResult.plan}</div>
                    <div className="text-3xl font-bold mb-2">
                      {tierResult.price === 0 ? 'Grátis' : `R$ ${tierResult.price}/mês`}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Inclui até {tierResult.maxDevices} {audience === 'business' ? 'dispositivos' : 'computadores'}
                    </p>
                    <Button asChild className="w-full">
                      <Link to="/pricing">Ver Detalhes do Plano</Link>
                    </Button>
                  </>}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Final Section - V4 */}
      <section className="py-16 bg-gradient-to-r from-primary/10 to-accent/10 border-y border-primary/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">
            Veja como está a segurança da sua {audience === 'business' ? 'empresa' : 'casa'}
          </h2>
          <Button asChild size="lg" className="text-lg h-14 px-10 bg-gradient-to-r from-primary to-accent hover:shadow-glow-primary transition-all hover:scale-105">
            <Link to="/signup">
              Ver riscos reais da minha empresa (grátis)
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground mt-4">Planos a partir de R$ 150/mês após o diagnóstico. Sem cartão de crédito.</p>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contato" className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">Fale Conosco</h2>
          <ContactForm />
        </div>
      </section>
    </div>;
};
export default Landing;