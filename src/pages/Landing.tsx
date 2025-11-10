import { Button } from "@/components/ui/button";
import { Shield, CheckCircle, Zap, Lock, BarChart, Users, ArrowRight, Mail, MessageCircle, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { ContactForm } from "@/components/ContactForm";
import { Navbar } from "@/components/Navbar";
import { WhatsAppButton } from "@/components/WhatsAppButton";

const Landing = () => {
  const whatsappLink = "https://wa.me/5534984432835?text=Olá!%20Gostaria%20de%20conhecer%20o%20CyberShield";

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
              Monitore todos os computadores da sua empresa em um único painel centralizado.
              <span className="text-foreground font-semibold"> Visibilidade completa e resposta em tempo real.</span>
            </p>

            {/* Proof Stats */}
            <div className="flex flex-wrap justify-center gap-8 pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">12s</div>
                <div className="text-sm text-muted-foreground">Tempo de resposta</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">15.4k</div>
                <div className="text-sm text-muted-foreground">Ações automatizadas/mês</div>
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
                className="text-lg h-14 px-8 bg-green-600 hover:bg-green-700"
              >
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Falar no WhatsApp
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-lg h-14 px-8">
                <Link to="/signup">
                  Testar Grátis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              ✓ Mais de 500 empresas protegidas &nbsp;•&nbsp; ✓ Instalação em 5 minutos &nbsp;•&nbsp; ✓ Suporte 100% em português
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
                Painel centralizado com status de todos os computadores da empresa
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
              Implementação Simplificada
            </h2>
            <p className="text-xl text-muted-foreground">
              Três passos para proteção completa
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
                  Deploy do agente em cada estação de trabalho. Processo simplificado e sem necessidade de conhecimento técnico avançado.
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
                  Implemente correções e atualizações em escala através de interface centralizada com aprovação controlada.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                O Que Você Ganha
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Resposta em 12 Segundos</h3>
                    <p className="text-muted-foreground">
                      Detecte e bloqueie ameaças antes que causem dano. Não espere horas ou dias.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Lock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Dados 100% Protegidos</h3>
                    <p className="text-muted-foreground">
                      Isolamento total entre clientes, criptografia militar e auditoria completa de tudo que acontece.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <BarChart className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Conformidade Garantida</h3>
                    <p className="text-muted-foreground">
                      Relatórios automáticos para LGPD, Banco Central e auditorias. Tudo documentado e rastreável.
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
                    <span className="font-medium">Computadores Monitorados</span>
                    <span className="text-2xl font-bold text-primary">248</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <span className="font-medium">Ameaças Bloqueadas Hoje</span>
                    <span className="text-2xl font-bold text-primary">17</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <span className="font-medium">Tempo Médio de Resposta</span>
                    <span className="text-2xl font-bold text-primary">12s</span>
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

      {/* Use Cases */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Para Quem É
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
                Gerencie dezenas de clientes em um único painel. Cada cliente totalmente isolado e seguro.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Um painel para todos os clientes</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Comandos reutilizáveis entre clientes</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Relatórios personalizados com sua marca</span>
                </li>
              </ul>
            </div>

            {/* Empresas */}
            <div className="bg-gradient-to-br from-card via-card to-accent/5 p-8 rounded-2xl border border-border">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="w-8 h-8 text-primary" />
                <h3 className="text-2xl font-bold">Empresas (20-500 PCs)</h3>
              </div>
              <p className="text-muted-foreground text-lg mb-6">
                Proteja sua empresa sem precisar contratar especialista em segurança.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Configuração de segurança em 7 dias</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Relatórios prontos para LGPD e Banco Central</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Funciona com seu antivírus atual</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Funciona com o que Você Já Usa
            </h2>
            <p className="text-xl text-muted-foreground">
              Não precisa trocar seu antivírus. O CyberShield trabalha junto.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card p-6 rounded-xl border border-border text-center">
              <div className="text-4xl mb-3">🛡️</div>
              <h3 className="font-bold text-lg mb-2">Windows Defender / Antivírus</h3>
              <p className="text-sm text-muted-foreground">
                Continua detectando. CyberShield orquestra e corrige.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border text-center">
              <div className="text-4xl mb-3">🔍</div>
              <h3 className="font-bold text-lg mb-2">VirusTotal</h3>
              <p className="text-sm text-muted-foreground">
                Verificação de arquivos suspeitos (use sua própria chave empresarial)
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border text-center">
              <div className="text-4xl mb-3">📧</div>
              <h3 className="font-bold text-lg mb-2">Email / Webhooks</h3>
              <p className="text-sm text-muted-foreground">
                Alertas instantâneos por email ou integração com seu sistema
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="precos" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Planos Empresariais
            </h2>
            <p className="text-xl text-muted-foreground">
              Modelo de precificação transparente por endpoint
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Starter */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <h3 className="text-2xl font-bold mb-2">Starter</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">R$ 30</span>
                <span className="text-muted-foreground">/endpoint/mês</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">Contrato mínimo: 25 endpoints</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Monitoramento contínuo</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Execução remota básica</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Notificações via email</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">API VirusTotal (chave cliente)</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  Solicitar Cotação
                </a>
              </Button>
            </div>

            {/* Pro */}
            <div className="bg-gradient-to-br from-primary via-primary to-accent p-8 rounded-2xl text-primary-foreground relative scale-105 shadow-2xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-4 py-1 rounded-full text-sm font-bold">
                RECOMENDADO
              </div>
              <h3 className="text-2xl font-bold mb-2">Professional</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">R$ 20</span>
                <span className="opacity-90">/endpoint/mês</span>
              </div>
              <p className="text-sm opacity-90 mb-6">Contrato mínimo: 100 endpoints</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Todos recursos do Starter</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Webhooks customizáveis</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Workflow de aprovação</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Relatórios PDF/CSV</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Exportação de dados</span>
                </li>
              </ul>
              <Button className="w-full bg-background text-foreground hover:bg-background/90" asChild>
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  Solicitar Cotação
                </a>
              </Button>
            </div>

            {/* Enterprise */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">Custom</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">Soluções para MSPs e grandes corporações</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Todos recursos Professional</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">SSO/SAML integration</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">SIEM integration</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Retenção de dados estendida</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">SLA 24×7</span>
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
            <p className="text-muted-foreground">
              Infraestrutura completa incluída em todos os planos • Sem taxas ocultas • Suporte técnico especializado
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Perguntas Frequentes
            </h2>
          </div>

          <div className="space-y-6">
            <div className="bg-card p-6 rounded-xl border border-border">
              <h3 className="font-bold text-lg mb-2">É necessário substituir a solução antivírus existente?</h3>
              <p className="text-muted-foreground">
                Não. O CyberShield integra-se com soluções antivírus corporativas existentes (Windows Defender, Kaspersky, ESET, etc.), 
                atuando como camada de orquestração e resposta centralizada.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border">
              <h3 className="font-bold text-lg mb-2">Qual o tempo de implantação?</h3>
              <p className="text-muted-foreground">
                O processo de instalação do agente em cada endpoint leva aproximadamente 5 minutos. 
                O agente (menos de 10MB) não requer reinicialização e registra-se automaticamente no painel central.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border">
              <h3 className="font-bold text-lg mb-2">Como é garantida a segurança dos dados?</h3>
              <p className="text-muted-foreground">
                Implementamos isolamento multi-tenant completo, criptografia end-to-end em todas comunicações, 
                e trilha de auditoria detalhada. Conformidade total com LGPD e normas do Banco Central.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border">
              <h3 className="font-bold text-lg mb-2">Qual a política de cancelamento?</h3>
              <p className="text-muted-foreground">
                Cancelamento sem penalidades contratuais. Cobrança proporcional ao período efetivamente utilizado.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/10 to-background" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Proteja os Ativos Digitais da Sua Empresa
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Período de avaliação de 30 dias sem compromisso. Sem exigência de cartão de crédito.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              size="lg"
              className="text-lg h-14 px-8 bg-green-600 hover:bg-green-700"
            >
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-5 w-5" />
                Falar com Especialista
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-lg h-14 px-8">
              <Link to="/signup">
                Iniciar Teste Grátis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contato" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Entre em Contato
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Preencha o formulário ou utilize nossos canais diretos de atendimento. 
                Tempo de resposta: até 24 horas úteis.
              </p>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <div className="font-medium">WhatsApp</div>
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-green-600 transition-colors"
                    >
                      (34) 98443-2835
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">Email Corporativo</div>
                    <a
                      href="mailto:gamehousetecnologia@gmail.com"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      gamehousetecnologia@gmail.com
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">Localização</div>
                    <div className="text-muted-foreground">Minas Gerais - Brasil</div>
                  </div>
                </div>
              </div>
            </div>

            <ContactForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-bold mb-4">Produto</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Recursos</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Preços</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Segurança</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4">Empresa</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/terms" className="hover:text-foreground transition-colors">Termos de Uso</Link></li>
                <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacidade</Link></li>
                <li><a href="#contact" className="hover:text-foreground transition-colors">Contato</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4">Suporte</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Documentação</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Central de Ajuda</a></li>
                <li><Link to="/login" className="hover:text-foreground transition-colors">Área do Cliente</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4">CyberShield</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Proteção empresarial simplificada para MSPs e empresas.
              </p>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <span className="font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  CyberShield
                </span>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
            © 2025 CyberShield. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
