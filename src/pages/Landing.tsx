import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle, Zap, Lock, BarChart, Users, ArrowRight, Mail, MessageCircle, MapPin, Crown, Activity, TrendingUp, Calculator, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { ContactForm } from "@/components/ContactForm";
import { Navbar } from "@/components/Navbar";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const Landing = () => {
  const whatsappLink = "https://wa.me/5534984432835?text=Olá!%20Gostaria%20de%20conhecer%20o%20CyberShield";
  const [deviceCount, setDeviceCount] = useState<number>(10);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <WhatsAppButton />

      {/* Hero Section */}
      <section id="inicio" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        <div className="absolute inset-0 bg-grid-white/[0.02]" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Proteção Empresarial de Verdade</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Proteja os Ativos Digitais
              </span>
              <br />
              <span className="text-foreground">da Sua Empresa</span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Monitore todos os dispositivos da sua empresa em um único painel centralizado.
              <span className="text-foreground font-semibold"> Visibilidade completa e resposta em tempo real.</span>
            </p>

            {/* Proof Stats */}
            <div className="flex flex-wrap justify-center gap-8 pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">30 dias</div>
                <div className="text-sm text-muted-foreground">Trial gratuito</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">200+</div>
                <div className="text-sm text-muted-foreground">Dispositivos por plano</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">100%</div>
                <div className="text-sm text-muted-foreground">Visibilidade dos PCs</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Button
                asChild
                size="lg"
                className="text-lg h-14 px-8"
              >
                <Link to="/signup">
                  Começar Trial Grátis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="text-lg h-14 px-8 bg-green-600 hover:bg-green-700 text-white border-green-600"
              >
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Falar no WhatsApp
                </a>
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              ✓ 30 dias de trial gratuito &nbsp;•&nbsp; ✓ Instalação em 5 minutos &nbsp;•&nbsp; ✓ Suporte 100% em português
            </p>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="recursos" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Por Que Escolher o CyberShield
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Proteção empresarial simplificada com tecnologia de ponta
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <div className="bg-card p-8 rounded-2xl border border-border text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mb-4 mx-auto">
                <span className="text-3xl">👀</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Veja Tudo em Um Só Lugar</h3>
              <p className="text-muted-foreground">
                Painel centralizado com status de todos os dispositivos da empresa
              </p>
            </div>

            <div className="bg-card p-8 rounded-2xl border border-border text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mb-4 mx-auto">
                <span className="text-3xl">⚡</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Aja em Segundos</h3>
              <p className="text-muted-foreground">
                Resposta em tempo real para proteger seus ativos digitais
              </p>
            </div>

            <div className="bg-card p-8 rounded-2xl border border-border text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mb-4 mx-auto">
                <span className="text-3xl">💰</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Economize Tempo e Dinheiro</h3>
              <p className="text-muted-foreground">
                Automação inteligente reduz custos operacionais
              </p>
            </div>

            <div className="bg-card p-8 rounded-2xl border border-border text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mb-4 mx-auto">
                <span className="text-3xl">🇧🇷</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Suporte Brasileiro</h3>
              <p className="text-muted-foreground">
                Equipe local, suporte em português, conformidade com LGPD
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Como Funciona
            </h2>
            <p className="text-xl text-muted-foreground">
              Três passos simples para proteção completa
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="relative">
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative bg-card p-8 rounded-2xl border border-border h-full">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <span className="text-2xl font-bold text-primary">1</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">Instalação em Minutos</h3>
                <p className="text-muted-foreground text-lg">
                  Instale o agente em cada dispositivo. Processo simplificado, sem necessidade de conhecimento técnico avançado.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative bg-card p-8 rounded-2xl border border-border h-full">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <span className="text-2xl font-bold text-primary">2</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">Monitoramento Centralizado</h3>
                <p className="text-muted-foreground text-lg">
                  Dashboard unificado exibe status operacional, ameaças detectadas e anomalias em tempo real.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative bg-card p-8 rounded-2xl border border-border h-full">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <span className="text-2xl font-bold text-primary">3</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">Resposta Automatizada</h3>
                <p className="text-muted-foreground text-lg">
                  Execute correções e atualizações remotamente através da interface centralizada.
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
                Recursos Essenciais
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Scans de Vírus Avançados</h3>
                    <p className="text-muted-foreground">
                      Integração com VirusTotal e Hybrid Analysis para detecção de ameaças em tempo real.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Lock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Quarentena Automática</h3>
                    <p className="text-muted-foreground">
                      Arquivos maliciosos são automaticamente isolados para proteger sua rede.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <BarChart className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Relatórios Detalhados</h3>
                    <p className="text-muted-foreground">
                      Exportação de dados e relatórios customizados para compliance e auditoria.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Activity className="w-6 h-6 text-primary" />
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

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl blur-3xl" />
              <div className="relative bg-card p-8 rounded-2xl border border-border">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <span className="font-medium">Dispositivos Ativos</span>
                    <span className="text-2xl font-bold text-primary">248</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <span className="font-medium">Ameaças Bloqueadas Hoje</span>
                    <span className="text-2xl font-bold text-primary">17</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <span className="font-medium">Scans Realizados</span>
                    <span className="text-2xl font-bold text-primary">1.2k</span>
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
              Planos Transparentes
            </h2>
            <p className="text-xl text-muted-foreground">
              Escolha o plano ideal para o tamanho da sua empresa
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Starter */}
            <div className="bg-card p-8 rounded-2xl border-2 border-border hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-6 h-6 text-primary" />
                <h3 className="text-2xl font-bold">Starter</h3>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">R$ 30</span>
                <span className="text-muted-foreground">/dispositivo/mês</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">Ideal para pequenas empresas (até 30 dispositivos)</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Dashboard avançado</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">2 scans avançados por dia</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Monitoramento em tempo real</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Suporte por email</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">30 dias de trial gratuito</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/signup">
                  Começar Trial Grátis
                </Link>
              </Button>
            </div>

            {/* Pro */}
            <div className="bg-gradient-to-br from-primary via-primary to-accent p-8 rounded-2xl text-primary-foreground relative scale-105 shadow-2xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-4 py-1 rounded-full text-sm font-bold">
                RECOMENDADO
              </div>
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-6 h-6" />
                <h3 className="text-2xl font-bold">Pro</h3>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">R$ 50</span>
                <span className="opacity-90">/dispositivo/mês</span>
              </div>
              <p className="text-sm opacity-90 mb-6">Para empresas em crescimento (até 200 dispositivos)</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Tudo do Starter, mais:</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Scans avançados ilimitados</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Dashboard com analytics</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Suporte prioritário</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">API access completo</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Relatórios customizados</span>
                </li>
              </ul>
              <Button className="w-full bg-background text-foreground hover:bg-background/90" asChild>
                <Link to="/signup">
                  Começar Trial Grátis
                </Link>
              </Button>
            </div>

            {/* Enterprise */}
            <div className="bg-card p-8 rounded-2xl border-2 border-border hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-6 h-6 text-primary" />
                <h3 className="text-2xl font-bold">Enterprise</h3>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">Custom</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">Soluções para MSPs e grandes corporações</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Tudo do Pro, mais:</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Dispositivos ilimitados</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Multi-tenant para MSPs</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">SSO/SAML integration</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">SLA 99.9%</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Suporte 24/7</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  Contatar Vendas
                </a>
              </Button>
            </div>
          </div>

          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">
              ✓ Sem taxas de setup &nbsp;•&nbsp; ✓ Cancele quando quiser &nbsp;•&nbsp; ✓ Suporte técnico incluído
            </p>
            <p className="text-sm text-muted-foreground">
              Todos os planos incluem 30 dias de trial gratuito. Não é necessário cartão de crédito.
            </p>
          </div>
        </div>
      </section>

      {/* Price Calculator */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <Calculator className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Calculadora de Preços</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Calcule o Investimento para Sua Empresa
            </h2>
            <p className="text-xl text-muted-foreground">
              Digite quantos dispositivos você precisa proteger e veja o custo mensal
            </p>
          </div>

          <div className="bg-card p-8 rounded-2xl border-2 border-primary/20 shadow-lg">
            <div className="mb-8">
              <label htmlFor="device-count" className="block text-lg font-bold mb-4 text-center">
                Quantos dispositivos você tem?
              </label>
              <div className="max-w-md mx-auto">
                <Input
                  id="device-count"
                  type="number"
                  min="1"
                  max="200"
                  value={deviceCount}
                  onChange={(e) => setDeviceCount(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                  className="text-center text-2xl h-16 font-bold"
                />
                <p className="text-sm text-muted-foreground text-center mt-2">
                  Entre 1 e 200 dispositivos
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Starter Calculation */}
              <div className={`p-6 rounded-xl border-2 transition-all ${
                deviceCount <= 30 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border bg-muted/30 opacity-60'
              }`}>
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold">Starter</h3>
                </div>
                {deviceCount <= 30 ? (
                  <>
                    <div className="mb-4">
                      <div className="text-4xl font-bold text-primary mb-1">
                        R$ {(deviceCount * 30).toLocaleString('pt-BR')}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        por mês ({deviceCount} × R$ 30)
                      </div>
                    </div>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        <span>2 scans avançados/dia</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        <span>Dashboard avançado</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        <span>Suporte por email</span>
                      </li>
                    </ul>
                  </>
                ) : (
                  <div className="text-muted-foreground">
                    <p className="font-semibold mb-2">Limite excedido</p>
                    <p className="text-sm">O plano Starter suporta até 30 dispositivos.</p>
                  </div>
                )}
              </div>

              {/* Pro Calculation */}
              <div className="p-6 rounded-xl border-2 border-primary bg-gradient-to-br from-primary/10 to-accent/10">
                <div className="flex items-center gap-2 mb-4">
                  <Crown className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold">Pro</h3>
                  {deviceCount > 30 && (
                    <span className="ml-auto text-xs bg-accent text-accent-foreground px-2 py-1 rounded-full font-bold">
                      RECOMENDADO
                    </span>
                  )}
                </div>
                <div className="mb-4">
                  <div className="text-4xl font-bold text-primary mb-1">
                    R$ {(deviceCount * 50).toLocaleString('pt-BR')}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    por mês ({deviceCount} × R$ 50)
                  </div>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span>Scans ilimitados</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span>Analytics avançado</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span>API completa</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span>Suporte prioritário</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                💡 Todos os planos incluem 30 dias de trial gratuito
              </p>
              <Button size="lg" asChild>
                <Link to="/signup">
                  Começar Trial Grátis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Quem Usa o CyberShield
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* MSPs */}
            <div className="bg-gradient-to-br from-card via-card to-primary/5 p-8 rounded-2xl border border-border">
              <div className="flex items-center gap-3 mb-6">
                <Users className="w-8 h-8 text-primary" />
                <h3 className="text-2xl font-bold">Provedores de TI (MSPs)</h3>
              </div>
              <p className="text-muted-foreground text-lg mb-6">
                Gerencie múltiplos clientes em um único painel. Cada cliente totalmente isolado e seguro.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Dashboard multi-tenant</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Isolamento completo entre clientes</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>White-label disponível</span>
                </li>
              </ul>
            </div>

            {/* Empresas */}
            <div className="bg-gradient-to-br from-card via-card to-accent/5 p-8 rounded-2xl border border-border">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="w-8 h-8 text-primary" />
                <h3 className="text-2xl font-bold">Empresas (5-200 PCs)</h3>
              </div>
              <p className="text-muted-foreground text-lg mb-6">
                Proteja sua empresa sem precisar contratar especialista em segurança.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Setup em menos de 1 dia</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Interface intuitiva e em português</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Conformidade com LGPD facilitada</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Perguntas Frequentes
            </h2>
            <p className="text-xl text-muted-foreground">
              Tire suas dúvidas sobre instalação, segurança e preços
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {/* Instalação */}
            <AccordionItem value="item-1" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                Como funciona a instalação do CyberShield?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                A instalação é simples e rápida. Após criar sua conta, você receberá um script de instalação personalizado. 
                Basta executar o script em cada dispositivo que deseja monitorar. O processo leva menos de 5 minutos por dispositivo 
                e não requer conhecimento técnico avançado. Oferecemos scripts para Windows e Linux.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                Preciso instalar em todos os dispositivos manualmente?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Para pequenas empresas, a instalação manual é rápida e simples. Para empresas maiores, oferecemos deployment 
                automatizado via GPO (Group Policy) no Windows ou scripts de deployment em massa para Linux. Nossa equipe de 
                suporte pode auxiliar na configuração inicial sem custo adicional.
              </AccordionContent>
            </AccordionItem>

            {/* Segurança */}
            <AccordionItem value="item-3" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                Meus dados estão seguros no CyberShield?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Sim! Utilizamos criptografia de ponta a ponta para todas as comunicações. Os dados são armazenados em servidores 
                no Brasil com certificação ISO 27001. Somos 100% compatíveis com a LGPD (Lei Geral de Proteção de Dados). 
                Cada tenant é completamente isolado, garantindo que seus dados nunca sejam acessíveis a outros clientes.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                O CyberShield afeta a performance dos meus PCs?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                O impacto na performance é mínimo. O agente do CyberShield consome menos de 50MB de RAM e menos de 1% de CPU 
                em operação normal. Os scans de vírus são executados apenas quando solicitados e podem ser agendados para horários 
                de baixo uso. Você mantém total controle sobre quando e como os recursos são utilizados.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                Quais tipos de ameaças o CyberShield detecta?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Detectamos vírus, malware, ransomware, trojans, spyware e outras ameaças através da integração com VirusTotal 
                e Hybrid Analysis - que agregam dezenas de motores antivírus. Também monitoramos anomalias de rede e 
                comportamentos suspeitos nos dispositivos. Os arquivos maliciosos são automaticamente colocados em quarentena.
              </AccordionContent>
            </AccordionItem>

            {/* Preços */}
            <AccordionItem value="item-6" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                Como funciona o trial gratuito de 30 dias?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Você tem 30 dias de acesso completo a todos os recursos do plano escolhido, sem necessidade de cartão de crédito. 
                Durante o trial, você pode testar todas as funcionalidades com até 200 dispositivos. Após o período, você decide 
                se quer continuar. Não há renovação automática - você só paga se decidir assinar.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-7" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                Posso mudar de plano depois?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Sim! Você pode fazer upgrade ou downgrade a qualquer momento. Ao fazer upgrade, você terá acesso imediato aos 
                novos recursos e pagaremos proporcionalmente. No downgrade, o crédito é aplicado no próximo ciclo de cobrança. 
                Não há taxas de mudança de plano ou penalidades.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-8" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                O que acontece se eu ultrapassar o limite de dispositivos?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                No plano Starter (máx 30 dispositivos), você será notificado ao se aproximar do limite e poderá fazer upgrade 
                para o Pro. No plano Pro (máx 200 dispositivos), entraremos em contato para criar um plano Enterprise customizado. 
                Você nunca será cobrado surpresas - sempre avisaremos antes de qualquer mudança necessária.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-9" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                Qual a diferença entre scans básicos e avançados?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Scans avançados utilizam nossa integração com VirusTotal e Hybrid Analysis, que combinam dezenas de motores 
                antivírus para máxima precisão. O plano Starter inclui 2 scans avançados por dia, ideal para análise de arquivos 
                suspeitos específicos. O plano Pro oferece scans avançados ilimitados, permitindo análise contínua e em larga escala.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-10" className="bg-card border border-border rounded-lg px-6">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                Posso cancelar a qualquer momento?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Sim! Não há fidelidade ou multas por cancelamento. Você pode cancelar sua assinatura a qualquer momento através 
                do painel administrativo ou entrando em contato conosco. O serviço permanecerá ativo até o final do período já 
                pago, e não há cobranças adicionais.
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">
              Ainda tem dúvidas?
            </p>
            <Button variant="outline" size="lg" asChild>
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-5 w-5" />
                Falar com Nossa Equipe
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contato" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Entre em Contato
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Tire suas dúvidas ou solicite uma demonstração personalizada
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <MessageCircle className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">WhatsApp</h3>
                    <p className="text-muted-foreground">(34) 98443-2835</p>
                    <Button variant="link" className="p-0 h-auto" asChild>
                      <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                        Iniciar conversa →
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <Mail className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Email</h3>
                    <p className="text-muted-foreground">gamehousetecnologia@gmail.com</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Localização</h3>
                    <p className="text-muted-foreground">Minas Gerais, Brasil</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card p-8 rounded-2xl border border-border">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-primary/5 via-accent/5 to-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Comece Seu Trial Gratuito Hoje
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            30 dias de acesso completo. Sem cartão de crédito. Cancele quando quiser.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-lg h-14 px-8" asChild>
              <Link to="/signup">
                Começar Agora
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg h-14 px-8"
              asChild
            >
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-5 w-5" />
                Agendar Demo
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-gradient-cyber rounded-lg border border-primary/20">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <span className="font-bold text-lg">CyberShield</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Proteção empresarial simplificada com tecnologia de ponta.
              </p>
            </div>

            <div>
              <h4 className="font-bold mb-4">Produto</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#recursos" className="text-muted-foreground hover:text-foreground transition-colors">
                    Recursos
                  </a>
                </li>
                <li>
                  <a href="#precos" className="text-muted-foreground hover:text-foreground transition-colors">
                    Preços
                  </a>
                </li>
                <li>
                  <Link to="/signup" className="text-muted-foreground hover:text-foreground transition-colors">
                    Começar Trial
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4">Empresa</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#contato" className="text-muted-foreground hover:text-foreground transition-colors">
                    Contato
                  </a>
                </li>
                <li>
                  <Link to="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                    Termos de Uso
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                    Privacidade
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4">Contato</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>(34) 98443-2835</li>
                <li>gamehousetecnologia@gmail.com</li>
                <li>Minas Gerais, Brasil</li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            <p>© 2024 CyberShield. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
