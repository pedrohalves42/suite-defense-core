import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, CheckCircle, Zap, Lock, BarChart, Users, ArrowRight, Mail, MessageCircle, MapPin, Crown, Activity, TrendingUp, Calculator, Home, Briefcase, Laptop, Baby, Building2, ShieldCheck, HeadphonesIcon } from "lucide-react";
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
        badge: "Proteção Empresarial de Verdade",
        title1: "Proteja os Ativos Digitais",
        title2: "da Sua Empresa",
        description: "Monitore todos os dispositivos da sua empresa em um único painel centralizado.",
        descriptionBold: " Visibilidade completa, e resposta em tempo real.",
        stat2Label: "Dispositivos por plano",
        ctaButton: "Começar Trial Grátis",
        reassurance: "✓ 30 dias de trial gratuito | ✓ Instalação em 5 minutos | ✓ Suporte 100% em português"
      },
      benefits: {
        card1: { title: "Veja Tudo em Um Só Lugar", description: "Painel centralizado com status de todos os dispositivos da empresa" },
        card2: { title: "Haja em Segundos", description: "Resposta em tempo real para proteger seus ativos digitais" },
        card3: { title: "Economize Tempo e Dinheiro", description: "Automação inteligente reduz custos operacionais" }
      },
      calculator: { label: "Quantos dispositivos sua empresa possui?" }
    },
    home: {
      hero: {
        badge: "Segurança Digital Para Toda a Família",
        title1: "Proteja os Computadores e Dados",
        title2: "da Sua Família",
        description: "Monitore todos os PCs de casa em um único painel.",
        descriptionBold: " Proteja fotos, documentos e a privacidade da família contra vírus e ameaças.",
        stat2Label: "Ideal para 1-10 PCs",
        ctaButton: "Proteger Minha Casa Agora",
        reassurance: "✓ 30 dias grátis | ✓ Instale você mesmo em 5min | ✓ Suporte em português via WhatsApp"
      },
      benefits: {
        card1: { title: "Veja Tudo em Um Só Lugar", description: "Veja o status de todos os PCs da casa: do seu home office ao computador dos filhos" },
        card2: { title: "Haja em Segundos", description: "Proteja fotos de família, documentos importantes e a privacidade de todos em tempo real" },
        card3: { title: "Economize Tempo e Dinheiro", description: "Chega de pagar técnico toda semana. Mantenha os PCs seguros automaticamente" }
      },
      calculator: { label: "Quantos computadores você tem em casa?" }
    }
  };

  const currentContent = content[audience];
  
  // Cálculo dinâmico por tier (FASE 1)
  const calculatePrice = (devices: number): number => {
    if (devices <= 0 || Number.isNaN(devices)) return 0;
    
    const pricePerDevice = 
      devices <= 30 ? 4.61 :    // R$ 59,90 / 13 dispositivos
      devices <= 200 ? 0.75 :   // R$ 149,90 / 200 dispositivos  
      0.29;                     // R$ 299,90 / 1000 dispositivos
    
    return Number((devices * pricePerDevice).toFixed(2));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <WhatsAppButton />

      {/* Hero Section with Toggle */}
      <section id="inicio" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-background animate-gradient-slow" />
        <div className="absolute inset-0 bg-grid-white/[0.02]" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse-slow" style={{animationDelay: '1s'}} />
        
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

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-gradient-x">{currentContent.hero.title1}</span>
              <br />
              <span className="text-foreground">{currentContent.hero.title2}</span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              {currentContent.hero.description}<span className="text-foreground font-semibold">{currentContent.hero.descriptionBold}</span>
            </p>

            <div className="flex flex-wrap justify-center gap-8 pt-4">
              <div className="text-center p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">30 dias</div>
                <div className="text-sm text-muted-foreground">Trial gratuito</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{audience === 'business' ? '200+' : '1-10'}</div>
                <div className="text-sm text-muted-foreground">{currentContent.hero.stat2Label}</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105">
                <div className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">100%</div>
                <div className="text-sm text-muted-foreground">Visibilidade dos PCs</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Button asChild size="lg" className="text-lg h-14 px-8 bg-gradient-to-r from-primary to-accent hover:shadow-glow-primary transition-all hover:scale-105"><Link to="/signup">{currentContent.hero.ctaButton}<ArrowRight className="ml-2 h-5 w-5" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="text-lg h-14 px-8 bg-green-600 hover:bg-green-700 text-white border-green-600 hover:shadow-lg transition-all hover:scale-105"><a href={whatsappLink} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-5 w-5" />Falar no WhatsApp</a></Button>
            </div>

            <p className="text-sm text-muted-foreground">{currentContent.hero.reassurance}</p>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="recursos" className="py-20 bg-muted/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {audience === 'business' ? "Por Que Escolher o CyberShield" : "Benefícios para Sua Casa"}
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
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

      {/* Use Cases Section */}
      <section className="py-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {audience === 'business' ? "Casos de Uso Específicos" : "Como o CyberShield Protege Sua Casa"}
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {audience === 'business' ? "Soluções para diferentes setores e necessidades empresariais" : "Proteção para todos os dispositivos e membros da família"}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            {audience === 'business' ? (
              <>
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
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute top-1/4 left-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-10 w-64 h-64 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{animationDelay: '1.5s'}} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {audience === 'business' ? "Como Funciona" : "Como Funciona o CyberShield em Casa"}
            </h2>
            <p className="text-xl text-muted-foreground">
              {audience === 'business' ? "Três passos simples para proteção completa" : "Proteção fácil em três passos para sua família"}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="group relative">
              <div className="absolute -top-4 -left-4 w-20 h-20 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" />
              <div className="relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 h-full transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                <div className="w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform">
                  <span className="text-2xl font-bold text-primary-foreground">1</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">{audience === 'business' ? "Instalação em Minutos" : "Instale em Minutos"}</h3>
                <p className="text-muted-foreground text-lg">
                  {audience === 'business' ? "Instale o agente em cada dispositivo. Processo simplificado, sem necessidade de conhecimento técnico avançado." : "Instale o software facilmente em todos os computadores da sua casa."}
                </p>
              </div>
            </div>

            <div className="group relative">
              <div className="absolute -top-4 -left-4 w-20 h-20 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" style={{animationDelay: '0.5s'}} />
              <div className="relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 h-full transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                <div className="w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform">
                  <span className="text-2xl font-bold text-primary-foreground">2</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">{audience === 'business' ? "Monitoramento Centralizado" : "Monitoramento Fácil"}</h3>
                <p className="text-muted-foreground text-lg">
                  {audience === 'business' ? "Dashboard unificado exibe status operacional, ameaças detectadas e anomalias em tempo real." : "Veja o status de todos os PCs da casa em um painel simples e intuitivo."}
                </p>
              </div>
            </div>

            <div className="group relative">
              <div className="absolute -top-4 -left-4 w-20 h-20 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" style={{animationDelay: '1s'}} />
              <div className="relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 h-full transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                <div className="w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform">
                  <span className="text-2xl font-bold text-primary-foreground">3</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">{audience === 'business' ? "Resposta Automatizada" : "Proteção Automatizada"}</h3>
                <p className="text-muted-foreground text-lg">
                  {audience === 'business' ? "Execute correções e atualizações remotamente através da interface centralizada." : "O CyberShield protege automaticamente contra ameaças sem que você precise se preocupar."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-muted/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/50" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="animate-fade-in">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
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
              <span className="text-sm font-medium text-foreground">🎉 Trial de 14 dias - Sem cartão necessário</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {audience === 'business' ? "Planos Transparentes" : "Planos para Sua Casa"}
            </h2>
            <p className="text-xl text-muted-foreground">
              {audience === 'business' ? "Escolha o plano ideal para o tamanho da sua empresa" : "Planos acessiveis para proteger todos os computadores da sua casa"}
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
                <h3 className="text-2xl font-bold">{audience === 'business' ? "Starter" : "Basico"}</h3>
              </div>
              <div className="relative mb-6">
                <span className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{audience === 'business' ? "R$ 30" : "R$ 15"}</span>
                <span className="text-muted-foreground">/{audience === 'business' ? "dispositivo/mes" : "computador/mes"}</span>
              </div>
              <p className="relative text-sm text-muted-foreground mb-6">{audience === 'business' ? "Ideal para pequenas empresas (ate 30 dispositivos)" : "Ideal para ate 3 computadores em casa"}</p>
              <ul className="relative space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Dashboard avancado" : "Protecao basica contra virus"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "2 scans avancados por dia" : "Scans automaticos semanais"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Monitoramento em tempo real" : "Monitoramento basico em tempo real"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Suporte por email" : "Suporte via WhatsApp"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "30 dias de trial gratuito" : "30 dias gratis para testar"}</span>
                </li>
              </ul>
              <Button variant="outline" className="relative w-full group-hover:bg-primary/10 transition-colors" asChild>
                <Link to="/signup">
                  {audience === 'business' ? "Comecar Trial Gratis" : "Comecar Agora"}
                </Link>
              </Button>
            </div>

            {/* Pro */}
            <div className={`relative p-8 rounded-2xl scale-105 shadow-2xl backdrop-blur-xl border-2 transition-all duration-300 hover:scale-110 ${audience === 'business' ? 'bg-gradient-to-br from-primary via-primary/90 to-accent text-primary-foreground border-primary' : 'bg-gradient-to-br from-green-400 via-green-500 to-green-600 text-white border-green-400'}`}>
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-4 py-1.5 rounded-full text-sm font-bold shadow-lg animate-pulse-glow">
                {audience === 'business' ? "RECOMENDADO" : "MELHOR PARA CASA"}
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Crown className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold">{audience === 'business' ? "Pro" : "Completo"}</h3>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">{audience === 'business' ? "R$ 50" : "R$ 30"}</span>
                <span className="opacity-90">/{audience === 'business' ? "dispositivo/mes" : "computador/mes"}</span>
              </div>
              <p className="text-sm opacity-90 mb-6">{audience === 'business' ? "Para empresas em crescimento (ate 200 dispositivos)" : "Protecao completa para ate 10 computadores"}</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Tudo do Starter, mais:" : "Tudo do Basico, mais:"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Scans avancados ilimitados" : "Scans diarios automaticos"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Quarentena automatica" : "Isolamento automatico de ameacas"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Suporte prioritario" : "Suporte dedicado via WhatsApp"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Relatorios customizados" : "Relatorios simples e claros"}</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full bg-white/20 hover:bg-white/30 border-white/30" asChild>
                <Link to="/signup">
                  {audience === 'business' ? "Comecar Trial Gratis" : "Assinar Agora"}
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
                <h3 className="text-2xl font-bold">{audience === 'business' ? "Enterprise" : "Avancado"}</h3>
              </div>
              <div className="relative mb-6">
                <span className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{audience === 'business' ? "R$ 100" : "R$ 50"}</span>
                <span className="text-muted-foreground">/{audience === 'business' ? "dispositivo/mes" : "computador/mes"}</span>
              </div>
              <p className="relative text-sm text-muted-foreground mb-6">{audience === 'business' ? "Para grandes empresas e necessidades avancadas" : "Para casas com muitos dispositivos e necessidades especiais"}</p>
              <ul className="relative space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Tudo do Pro, mais:" : "Tudo do Completo, mais:"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Suporte dedicado 24/7" : "Suporte premium 24/7"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Consultoria personalizada" : "Consultoria para seguranca domestica"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Relatorios avancados e auditoria" : "Relatorios detalhados para sua familia"}</span>
                </li>
              </ul>
              <Button variant="outline" className="relative w-full group-hover:bg-primary/10 transition-colors" asChild>
                <Link to="/signup">
                  {audience === 'business' ? "Fale Conosco" : "Fale Conosco"}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-muted/30 relative overflow-hidden">
        <div className="absolute top-20 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{animationDelay: '1s'}} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {audience === 'business' ? "Depoimentos de Clientes" : "O Que Nossos Usuarios Dizem"}
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {audience === 'business' ? "Veja como ajudamos empresas a proteger seus ativos digitais" : "Familias confiando no CyberShield para seguranca digital"}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            {audience === 'business' ? (
              <>
                <Card className="group relative bg-card/50 backdrop-blur-xl border-primary/20 transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-primary/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"O CyberShield transformou nossa seguranca digital. Monitoramento em tempo real e resposta rapida salvaram nossa empresa de varias ameacas."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <ShieldCheck className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold">Carlos Silva</p>
                        <p className="text-sm text-muted-foreground">CTO - TechCorp</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="group relative bg-card/50 backdrop-blur-xl border-primary/20 transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-primary/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"A automacao e os relatorios detalhados facilitaram nossa conformidade com a LGPD. Suporte excelente e facil de usar."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <ShieldCheck className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold">Ana Pereira</p>
                        <p className="text-sm text-muted-foreground">Gerente de Seguranca - FinancasPlus</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="group relative bg-card/50 backdrop-blur-xl border-primary/20 transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-primary/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"Recomendo para qualquer empresa que queira proteger seus dados sem complicacao. Interface intuitiva e suporte dedicado."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <ShieldCheck className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold">Joao Costa</p>
                        <p className="text-sm text-muted-foreground">CEO - StartUpX</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Card className="group relative bg-card/50 backdrop-blur-xl border-green-500/20 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-green-500/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-green-500/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"Finalmente uma solucao simples para proteger todos os computadores da minha casa. Facil de instalar e usar."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Home className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <p className="font-bold">Mariana Souza</p>
                        <p className="text-sm text-muted-foreground">Mae e Usuaria</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="group relative bg-card/50 backdrop-blur-xl border-green-500/20 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-green-500/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-green-500/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"O suporte via WhatsApp foi essencial para me ajudar a configurar tudo rapidamente. Recomendo para familias."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Home className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <p className="font-bold">Lucas Fernandes</p>
                        <p className="text-sm text-muted-foreground">Pai e Usuario</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="group relative bg-card/50 backdrop-blur-xl border-green-500/20 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-green-500/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="relative pt-6">
                    <div className="mb-4 text-green-500/30 text-5xl font-serif leading-none">"</div>
                    <p className="mb-6 text-muted-foreground leading-relaxed">"Protegeu o computador dos meus filhos contra virus e ataques. Agora fico mais tranquilo sabendo que estao seguros."</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Home className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <p className="font-bold">Fernanda Lima</p>
                        <p className="text-sm text-muted-foreground">Mae e Usuaria</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {audience === 'business' ? "Perguntas Frequentes" : "Duvidas Frequentes"}
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {audience === 'business' ? "Respostas para as duvidas mais comuns sobre o CyberShield empresarial" : "Tire suas duvidas sobre o uso do CyberShield em casa"}
            </p>
          </div>

          <Accordion type="single" collapsible className="max-w-3xl mx-auto space-y-4">
            {audience === 'business' ? (
              <>
                <AccordionItem value="q1">
                  <AccordionTrigger>Como funciona o periodo de trial?</AccordionTrigger>
                  <AccordionContent>
                    Voce pode testar o CyberShield gratuitamente por 30 dias com acesso completo a todos os recursos empresariais.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="q2">
                  <AccordionTrigger>Posso adicionar mais dispositivos depois?</AccordionTrigger>
                  <AccordionContent>
                    Sim, voce pode escalar seu plano conforme sua empresa cresce, adicionando mais dispositivos facilmente.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="q3">
                  <AccordionTrigger>O suporte e em portugues?</AccordionTrigger>
                  <AccordionContent>
                    Sim, oferecemos suporte 100% em portugues via email e WhatsApp.
                  </AccordionContent>
                </AccordionItem>
              </>
            ) : (
              <>
                <AccordionItem value="q1">
                  <AccordionTrigger>Como instalo o CyberShield em casa?</AccordionTrigger>
                  <AccordionContent>
                    Basta baixar o software e seguir o assistente de instalacao simples para proteger todos os computadores da sua casa.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="q2">
                  <AccordionTrigger>Preciso de conhecimento tecnico?</AccordionTrigger>
                  <AccordionContent>
                    Nao, o CyberShield foi desenvolvido para ser facil de usar, mesmo para quem nao tem experiencia tecnica.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="q3">
                  <AccordionTrigger>Como funciona o suporte?</AccordionTrigger>
                  <AccordionContent>
                    Oferecemos suporte via WhatsApp para ajudar voce a qualquer momento.
                  </AccordionContent>
                </AccordionItem>
              </>
            )}
          </Accordion>
        </div>
      </section>

      {/* Calculator Section */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">
            {audience === 'business' ? "Calculadora de Preco" : "Calculadora de Preco para Casa"}
          </h2>
          <p className="text-center text-muted-foreground mb-8">
            {currentContent.calculator.label}
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
            <Input
              type="number"
              min={1}
              max={1000}
              value={deviceCount}
              onChange={(e) => setDeviceCount(Number(e.target.value))}
              className="max-w-xs"
              aria-label={currentContent.calculator.label}
            />
            <div className="text-2xl font-bold">
              {`R$ ${calculatePrice(deviceCount).toFixed(2)} / ${audience === 'business' ? 'mes' : 'mes'}`}
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            {audience === 'business' ? "Precos baseados no numero de dispositivos monitorados." : "Precos baseados no numero de computadores protegidos."}
          </p>
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
