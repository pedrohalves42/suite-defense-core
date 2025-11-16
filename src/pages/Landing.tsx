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

type Audience = 'business' | 'home';

const Landing = () => {
  const whatsappLink = "https://wa.me/5534984432835?text=Olá!%20Gostaria%20de%20conhecer%20o%20CyberShield";
  const [deviceCount, setDeviceCount] = useState<number>(10);
  const [audience, setAudience] = useState<Audience>('business');

  const content = {
    business: {
      hero: {
        badge: "Proteção Empresarial de Verdade",
        title1: "Proteja os Ativos Digitais",
        title2: "da Sua Empresa",
        description: "Monitore todos os dispositivos da sua empresa em um único painel centralizado.",
        descriptionBold: " Visibilidade completa e resposta em tempo real.",
        stat2Label: "Dispositivos por plano",
        ctaButton: "Começar Trial Grátis",
        reassurance: "✓ 30 dias de trial gratuito • ✓ Instalação em 5 minutos • ✓ Suporte 100% em português"
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
        reassurance: "✓ 30 dias grátis • ✓ Instale você mesmo em 5min • ✓ Suporte em português via WhatsApp"
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
  const calculatePrice = (devices: number): number => devices <= 30 ? 59.90 : devices <= 200 ? 149.90 : 299.90;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <WhatsAppButton />

      {/* Hero Section with Toggle */}
      <section id="inicio" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        <div className="absolute inset-0 bg-grid-white/[0.02]" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24">
          <div className="text-center space-y-8">
            {/* Toggle de Contexto */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 p-1 rounded-full bg-muted/50 backdrop-blur-sm border border-border">
                <button onClick={() => setAudience('business')} className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${audience === 'business' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Briefcase className="w-4 h-4" />
                  <span className="text-sm font-medium">Para Empresas</span>
                </button>
                <button onClick={() => setAudience('home')} className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${audience === 'home' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Home className="w-4 h-4" />
                  <span className="text-sm font-medium">Para Minha Casa</span>
                </button>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{currentContent.hero.badge}</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">{currentContent.hero.title1}</span>
              <br />
              <span className="text-foreground">{currentContent.hero.title2}</span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              {currentContent.hero.description}<span className="text-foreground font-semibold">{currentContent.hero.descriptionBold}</span>
            </p>

            <div className="flex flex-wrap justify-center gap-8 pt-4">
              <div className="text-center"><div className="text-3xl font-bold text-primary">30 dias</div><div className="text-sm text-muted-foreground">Trial gratuito</div></div>
              <div className="text-center"><div className="text-3xl font-bold text-primary">{audience === 'business' ? '200+' : '1-10'}</div><div className="text-sm text-muted-foreground">{currentContent.hero.stat2Label}</div></div>
              <div className="text-center"><div className="text-3xl font-bold text-primary">100%</div><div className="text-sm text-muted-foreground">Visibilidade dos PCs</div></div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Button asChild size="lg" className="text-lg h-14 px-8"><Link to="/signup">{currentContent.hero.ctaButton}<ArrowRight className="ml-2 h-5 w-5" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="text-lg h-14 px-8 bg-green-600 hover:bg-green-700 text-white border-green-600"><a href={whatsappLink} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-5 w-5" />Falar no WhatsApp</a></Button>
            </div>

            <p className="text-sm text-muted-foreground">{currentContent.hero.reassurance}</p>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="recursos" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {audience === 'business' ? "Por Que Escolher o CyberShield" : "Benefícios para Sua Casa"}
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {audience === 'business' ? "Proteção empresarial simplificada com tecnologia de ponta" : "Segurança digital fácil para proteger sua família e seus dispositivos"}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="bg-card p-8 rounded-2xl border border-border text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mb-4 mx-auto">
                <span className="text-3xl">👀</span>
              </div>
              <h3 className="text-xl font-bold mb-3">{currentContent.benefits.card1.title}</h3>
              <p className="text-muted-foreground">
                {currentContent.benefits.card1.description}
              </p>
            </div>

            <div className="bg-card p-8 rounded-2xl border border-border text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mb-4 mx-auto">
                <span className="text-3xl">⚡</span>
              </div>
              <h3 className="text-xl font-bold mb-3">{currentContent.benefits.card2.title}</h3>
              <p className="text-muted-foreground">
                {currentContent.benefits.card2.description}
              </p>
            </div>

            <div className="bg-card p-8 rounded-2xl border border-border text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mb-4 mx-auto">
                <span className="text-3xl">💰</span>
              </div>
              <h3 className="text-xl font-bold mb-3">{currentContent.benefits.card3.title}</h3>
              <p className="text-muted-foreground">
                {currentContent.benefits.card3.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
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
                <div className="bg-card p-8 rounded-2xl border border-border text-center">
                  <Laptop className="mx-auto mb-4 w-12 h-12 text-primary" />
                  <h3 className="text-xl font-bold mb-2">TI Corporativa</h3>
                  <p className="text-muted-foreground">Monitoramento e resposta para redes empresariais complexas.</p>
                </div>
                <div className="bg-card p-8 rounded-2xl border border-border text-center">
                  <Building2 className="mx-auto mb-4 w-12 h-12 text-primary" />
                  <h3 className="text-xl font-bold mb-2">Pequenas e Médias Empresas</h3>
                  <p className="text-muted-foreground">Soluções acessíveis para proteger seus ativos digitais.</p>
                </div>
                <div className="bg-card p-8 rounded-2xl border border-border text-center">
                  <ShieldCheck className="mx-auto mb-4 w-12 h-12 text-primary" />
                  <h3 className="text-xl font-bold mb-2">Compliance e Segurança</h3>
                  <p className="text-muted-foreground">Atenda requisitos regulatórios com relatórios detalhados.</p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-card p-8 rounded-2xl border border-border text-center">
                  <Laptop className="mx-auto mb-4 w-12 h-12 text-primary" />
                  <h3 className="text-xl font-bold mb-2">Home Office Seguro</h3>
                  <p className="text-muted-foreground">Proteja seu computador de trabalho e dados pessoais.</p>
                </div>
                <div className="bg-card p-8 rounded-2xl border border-border text-center">
                  <Baby className="mx-auto mb-4 w-12 h-12 text-primary" />
                  <h3 className="text-xl font-bold mb-2">Proteção para Crianças</h3>
                  <p className="text-muted-foreground">Mantenha os dispositivos dos filhos seguros contra ameaças.</p>
                </div>
                <div className="bg-card p-8 rounded-2xl border border-border text-center">
                  <Users className="mx-auto mb-4 w-12 h-12 text-primary" />
                  <h3 className="text-xl font-bold mb-2">Família Conectada</h3>
                  <p className="text-muted-foreground">Gerencie a segurança de todos os dispositivos da casa.</p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {audience === 'business' ? "Como Funciona" : "Como Funciona o CyberShield em Casa"}
            </h2>
            <p className="text-xl text-muted-foreground">
              {audience === 'business' ? "Três passos simples para proteção completa" : "Proteção fácil em três passos para sua família"}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="relative">
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative bg-card p-8 rounded-2xl border border-border h-full">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <span className="text-2xl font-bold text-primary">1</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">{audience === 'business' ? "Instalação em Minutos" : "Instale em Minutos"}</h3>
                <p className="text-muted-foreground text-lg">
                  {audience === 'business' ? "Instale o agente em cada dispositivo. Processo simplificado, sem necessidade de conhecimento técnico avançado." : "Instale o software facilmente em todos os computadores da sua casa."}
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative bg-card p-8 rounded-2xl border border-border h-full">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <span className="text-2xl font-bold text-primary">2</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">{audience === 'business' ? "Monitoramento Centralizado" : "Monitoramento Fácil"}</h3>
                <p className="text-muted-foreground text-lg">
                  {audience === 'business' ? "Dashboard unificado exibe status operacional, ameaças detectadas e anomalias em tempo real." : "Veja o status de todos os PCs da casa em um painel simples e intuitivo."}
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative bg-card p-8 rounded-2xl border border-border h-full">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <span className="text-2xl font-bold text-primary">3</span>
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
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                {audience === 'business' ? "Recursos Essenciais" : "Recursos para Sua Casa"}
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{audience === 'business' ? "Scans de Vírus Avançados" : "Proteção Contra Vírus"}</h3>
                    <p className="text-muted-foreground">
                      {audience === 'business' ? "Integração com VirusTotal e Hybrid Analysis para detecção de ameaças em tempo real." : "Detecta e remove vírus e malwares automaticamente."}
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Lock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{audience === 'business' ? "Quarentena Automática" : "Isolamento de Ameaças"}</h3>
                    <p className="text-muted-foreground">
                      {audience === 'business' ? "Arquivos maliciosos são automaticamente isolados para proteger sua rede." : "Arquivos suspeitos são isolados para manter sua casa segura."}
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <BarChart className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{audience === 'business' ? "Relatórios Detalhados" : "Relatórios Simples"}</h3>
                    <p className="text-muted-foreground">
                      {audience === 'business' ? "Exportação de dados e relatórios customizados para compliance e auditoria." : "Relatórios fáceis de entender sobre a segurança da sua casa."}
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Activity className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{audience === 'business' ? "API Completa" : "Suporte Fácil"}</h3>
                    <p className="text-muted-foreground">
                      {audience === 'business' ? "Integre com seus sistemas existentes através de nossa API RESTful." : "Suporte via WhatsApp para tirar dúvidas e ajudar na instalação."}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl blur-3xl" />
              <div className="relative bg-card p-8 rounded-2xl border border-border">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <span className="font-medium">Dispositivos Ativos</span>
                    <span className="text-2xl font-bold text-primary">{audience === 'business' ? "248" : "10"}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <span className="font-medium">Ameaças Bloqueadas Hoje</span>
                    <span className="text-2xl font-bold text-primary">{audience === 'business' ? "17" : "5"}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <span className="font-medium">Scans Realizados</span>
                    <span className="text-2xl font-bold text-primary">{audience === 'business' ? "1.2k" : "150"}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-green-500/10 rounded-lg border border-green-500/20">
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
      <section id="precos" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {audience === 'business' ? "Planos Transparentes" : "Planos para Sua Casa"}
            </h2>
            <p className="text-xl text-muted-foreground">
              {audience === 'business' ? "Escolha o plano ideal para o tamanho da sua empresa" : "Planos acessíveis para proteger todos os computadores da sua casa"}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Starter */}
            <div className={`p-8 rounded-2xl border-2 hover:border-primary/50 transition-colors ${audience === 'business' ? 'bg-card border-border' : 'bg-white border-gray-300'}`}>
              <div className="flex items-center gap-2 mb-4">
                <Zap className={`w-6 h-6 ${audience === 'business' ? 'text-primary' : 'text-gray-700'}`} />
                <h3 className="text-2xl font-bold">{audience === 'business' ? "Starter" : "Básico"}</h3>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">{audience === 'business' ? "R$ 30" : "R$ 15"}</span>
                <span className="text-muted-foreground">/{audience === 'business' ? "dispositivo/mês" : "computador/mês"}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">{audience === 'business' ? "Ideal para pequenas empresas (até 30 dispositivos)" : "Ideal para até 3 computadores em casa"}</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className={`w-5 h-5 ${audience === 'business' ? 'text-primary' : 'text-green-600'} shrink-0 mt-0.5`} />
                  <span className="text-sm">{audience === 'business' ? "Dashboard avançado" : "Proteção básica contra vírus"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className={`w-5 h-5 ${audience === 'business' ? 'text-primary' : 'text-green-600'} shrink-0 mt-0.5`} />
                  <span className="text-sm">{audience === 'business' ? "2 scans avançados por dia" : "Scans automáticos semanais"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className={`w-5 h-5 ${audience === 'business' ? 'text-primary' : 'text-green-600'} shrink-0 mt-0.5`} />
                  <span className="text-sm">{audience === 'business' ? "Monitoramento em tempo real" : "Monitoramento básico em tempo real"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className={`w-5 h-5 ${audience === 'business' ? 'text-primary' : 'text-green-600'} shrink-0 mt-0.5`} />
                  <span className="text-sm">{audience === 'business' ? "Suporte por email" : "Suporte via WhatsApp"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className={`w-5 h-5 ${audience === 'business' ? 'text-primary' : 'text-green-600'} shrink-0 mt-0.5`} />
                  <span className="text-sm">{audience === 'business' ? "30 dias de trial gratuito" : "30 dias grátis para testar"}</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/signup">
                  {audience === 'business' ? "Começar Trial Grátis" : "Começar Agora"}
                </Link>
              </Button>
            </div>

            {/* Pro */}
            <div className={`p-8 rounded-2xl relative scale-105 shadow-2xl ${audience === 'business' ? 'bg-gradient-to-br from-primary via-primary to-accent text-primary-foreground' : 'bg-gradient-to-br from-green-400 via-green-500 to-green-600 text-white'}`}>
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-4 py-1 rounded-full text-sm font-bold">
                {audience === 'business' ? "RECOMENDADO" : "MELHOR PARA CASA"}
              </div>
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-6 h-6" />
                <h3 className="text-2xl font-bold">{audience === 'business' ? "Pro" : "Completo"}</h3>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">{audience === 'business' ? "R$ 50" : "R$ 30"}</span>
                <span className="opacity-90">/{audience === 'business' ? "dispositivo/mês" : "computador/mês"}</span>
              </div>
              <p className="text-sm opacity-90 mb-6">{audience === 'business' ? "Para empresas em crescimento (até 200 dispositivos)" : "Proteção completa para até 10 computadores"}</p>
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
                  <span className="text-sm">{audience === 'business' ? "Quarentena automática" : "Isolamento automático de ameaças"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Suporte prioritário" : "Suporte dedicado via WhatsApp"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">{audience === 'business' ? "Relatórios customizados" : "Relatórios simples e claros"}</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/signup">
                  {audience === 'business' ? "Começar Trial Grátis" : "Assinar Agora"}
                </Link>
              </Button>
            </div>

            {/* Enterprise */}
            <div className={`p-8 rounded-2xl border-2 border-border hover:border-primary/50 transition-colors ${audience === 'business' ? 'bg-card' : 'bg-white border-gray-300'}`}>
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className={`w-6 h-6 ${audience === 'business' ? 'text-primary' : 'text-gray-700'}`} />
                <h3 className="text-2xl font-bold">{audience === 'business' ? "Enterprise" : "Avançado"}</h3>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">{audience === 'business' ? "R$ 100" : "R$ 50"}</span>
                <span className="text-muted-foreground">/{audience === 'business' ? "dispositivo/mês" : "computador/mês"}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">{audience === 'business' ? "Para grandes empresas e necessidades avançadas" : "Para casas com muitos dispositivos e necessidades especiais"}</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className={`w-5 h-5 ${audience === 'business' ? 'text-primary' : 'text-green-600'} shrink-0 mt-0.5`} />
                  <span className="text-sm">{audience === 'business' ? "Tudo do Pro, mais:" : "Tudo do Completo, mais:"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className={`w-5 h-5 ${audience === 'business' ? 'text-primary' : 'text-green-600'} shrink-0 mt-0.5`} />
                  <span className="text-sm">{audience === 'business' ? "Suporte dedicado 24/7" : "Suporte premium 24/7"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className={`w-5 h-5 ${audience === 'business' ? 'text-primary' : 'text-green-600'} shrink-0 mt-0.5`} />
                  <span className="text-sm">{audience === 'business' ? "Consultoria personalizada" : "Consultoria para segurança doméstica"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className={`w-5 h-5 ${audience === 'business' ? 'text-primary' : 'text-green-600'} shrink-0 mt-0.5`} />
                  <span className="text-sm">{audience === 'business' ? "Relatórios avançados e auditoria" : "Relatórios detalhados para sua família"}</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/signup">
                  {audience === 'business' ? "Fale Conosco" : "Fale Conosco"}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {audience === 'business' ? "Depoimentos de Clientes" : "O Que Nossos Usuários Dizem"}
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {audience === 'business' ? "Veja como ajudamos empresas a proteger seus ativos digitais" : "Famílias confiando no CyberShield para segurança digital"}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            {audience === 'business' ? (
              <>
                <Card>
                  <CardContent>
                    <p className="mb-4 text-muted-foreground">"O CyberShield transformou nossa segurança digital. Monitoramento em tempo real e resposta rápida salvaram nossa empresa de várias ameaças."</p>
                    <div className="flex items-center gap-4">
                      <ShieldCheck className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-bold">Carlos Silva</p>
                        <p className="text-sm text-muted-foreground">CTO - TechCorp</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <p className="mb-4 text-muted-foreground">"A automação e os relatórios detalhados facilitaram nossa conformidade com a LGPD. Suporte excelente e fácil de usar."</p>
                    <div className="flex items-center gap-4">
                      <ShieldCheck className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-bold">Ana Pereira</p>
                        <p className="text-sm text-muted-foreground">Gerente de Segurança - FinançasPlus</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <p className="mb-4 text-muted-foreground">"Recomendo para qualquer empresa que queira proteger seus dados sem complicação. Interface intuitiva e suporte dedicado."</p>
                    <div className="flex items-center gap-4">
                      <ShieldCheck className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-bold">João Costa</p>
                        <p className="text-sm text-muted-foreground">CEO - StartUpX</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Card>
                  <CardContent>
                    <p className="mb-4 text-muted-foreground">"Finalmente uma solução simples para proteger todos os computadores da minha casa. Fácil de instalar e usar."</p>
                    <div className="flex items-center gap-4">
                      <Home className="w-8 h-8 text-green-600" />
                      <div>
                        <p className="font-bold">Mariana Souza</p>
                        <p className="text-sm text-muted-foreground">Mãe e Usuária</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <p className="mb-4 text-muted-foreground">"O suporte via WhatsApp foi essencial para me ajudar a configurar tudo rapidamente. Recomendo para famílias."</p>
                    <div className="flex items-center gap-4">
                      <Home className="w-8 h-8 text-green-600" />
                      <div>
                        <p className="font-bold">Lucas Fernandes</p>
                        <p className="text-sm text-muted-foreground">Pai e Usuário</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <p className="mb-4 text-muted-foreground">"Protegeu o computador dos meus filhos contra vírus e ataques. Agora fico mais tranquilo sabendo que estão seguros."</p>
                    <div className="flex items-center gap-4">
                      <Home className="w-8 h-8 text-green-600" />
                      <div>
                        <p className="font-bold">Fernanda Lima</p>
                        <p className="text-sm text-muted-foreground">Mãe e Usuária</p>
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
              {audience === 'business' ? "Perguntas Frequentes" : "Dúvidas Frequentes"}
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {audience === 'business' ? "Respostas para as dúvidas mais comuns sobre o CyberShield empresarial" : "Tire suas dúvidas sobre o uso do CyberShield em casa"}
            </p>
          </div>

          <Accordion type="single" collapsible className="max-w-3xl mx-auto space-y-4">
            {audience === 'business' ? (
              <>
                <AccordionItem value="q1">
                  <AccordionTrigger>Como funciona o período de trial?</AccordionTrigger>
                  <AccordionContent>
                    Você pode testar o CyberShield gratuitamente por 30 dias com acesso completo a todos os recursos empresariais.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="q2">
                  <AccordionTrigger>Posso adicionar mais dispositivos depois?</AccordionTrigger>
                  <AccordionContent>
                    Sim, você pode escalar seu plano conforme sua empresa cresce, adicionando mais dispositivos facilmente.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="q3">
                  <AccordionTrigger>O suporte é em português?</AccordionTrigger>
                  <AccordionContent>
                    Sim, oferecemos suporte 100% em português via email e WhatsApp.
                  </AccordionContent>
                </AccordionItem>
              </>
            ) : (
              <>
                <AccordionItem value="q1">
                  <AccordionTrigger>Como instalo o CyberShield em casa?</AccordionTrigger>
                  <AccordionContent>
                    Basta baixar o software e seguir o assistente de instalação simples para proteger todos os computadores da sua casa.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="q2">
                  <AccordionTrigger>Preciso de conhecimento técnico?</AccordionTrigger>
                  <AccordionContent>
                    Não, o CyberShield foi desenvolvido para ser fácil de usar, mesmo para quem não tem experiência técnica.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="q3">
                  <AccordionTrigger>Como funciona o suporte?</AccordionTrigger>
                  <AccordionContent>
                    Oferecemos suporte via WhatsApp para ajudar você a qualquer momento.
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
            {audience === 'business' ? "Calculadora de Preço" : "Calculadora de Preço para Casa"}
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
              {`R$ ${calculatePrice(deviceCount).toFixed(2)} / ${audience === 'business' ? 'mês' : 'mês'}`}
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            {audience === 'business' ? "Preços baseados no número de dispositivos monitorados." : "Preços baseados no número de computadores protegidos."}
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
