import { Button } from "@/components/ui/button";
import { Shield, CheckCircle, Zap, Lock, BarChart, Users, ArrowRight, Mail, Phone, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { ContactForm } from "@/components/ContactForm";

const Landing = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
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
                Sua Empresa Segura
              </span>
              <br />
              <span className="text-foreground">em Segundos, Não Dias</span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Detecte e elimine ameaças antes que causem prejuízo. 
              <span className="text-foreground font-semibold"> Controle total sobre todos os computadores</span> da sua empresa, em tempo real.
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
              <Button asChild size="lg" className="text-lg h-14 px-8">
                <Link to="/signup">
                  Testar 30 Dias Grátis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg h-14 px-8">
                <Link to="/login">Entrar</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg h-14 px-8">
                <a href="#contact">Falar com Especialista</a>
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              ✓ Sem cartão de crédito &nbsp;•&nbsp; ✓ Instalação em 5 minutos &nbsp;•&nbsp; ✓ Suporte em português
            </p>
          </div>
        </div>
      </section>

      {/* Problems Section */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Você Já Perdeu o Controle da Segurança?
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              A maioria das empresas só descobre problemas quando já é tarde demais
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card p-8 rounded-2xl border border-border">
              <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Sem Visibilidade</h3>
              <p className="text-muted-foreground">
                Você não sabe quais computadores estão vulneráveis ou infectados agora mesmo
              </p>
            </div>

            <div className="bg-card p-8 rounded-2xl border border-border">
              <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">⏰</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Resposta Lenta</h3>
              <p className="text-muted-foreground">
                Horas ou dias para descobrir e corrigir um problema enquanto o prejuízo aumenta
              </p>
            </div>

            <div className="bg-card p-8 rounded-2xl border border-border">
              <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">💸</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Custos Escondidos</h3>
              <p className="text-muted-foreground">
                Perde tempo e dinheiro com problemas que poderiam ser evitados automaticamente
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
              Simples, rápido e sem complicação
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="relative">
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative bg-card p-8 rounded-2xl border border-border h-full">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <span className="text-2xl font-bold text-primary">1</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">Instale em Minutos</h3>
                <p className="text-muted-foreground text-lg">
                  Baixe o instalador e rode em cada computador. Pronto. Não precisa ser técnico.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative bg-card p-8 rounded-2xl border border-border h-full">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <span className="text-2xl font-bold text-primary">2</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">Veja Tudo em Tempo Real</h3>
                <p className="text-muted-foreground text-lg">
                  Painel mostra status de todos os PCs, vírus detectados e problemas encontrados.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative bg-card p-8 rounded-2xl border border-border h-full">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <span className="text-2xl font-bold text-primary">3</span>
                </div>
                <h3 className="text-2xl font-bold mb-4">Corrija com 1 Clique</h3>
                <p className="text-muted-foreground text-lg">
                  Execute comandos, atualizações e correções em todos os computadores ao mesmo tempo.
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
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Preços Simples e Transparentes
            </h2>
            <p className="text-xl text-muted-foreground">
              Pague apenas pelos computadores que você protege
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Starter */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <h3 className="text-2xl font-bold mb-2">Starter</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">R$ 20</span>
                <span className="text-muted-foreground">/PC/mês</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">Mínimo 25 computadores</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Monitoramento em tempo real</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Comandos básicos</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Alertas por email</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">VirusTotal (sua chave)</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/signup">Começar Teste Grátis</Link>
              </Button>
            </div>

            {/* Pro */}
            <div className="bg-gradient-to-br from-primary via-primary to-accent p-8 rounded-2xl text-primary-foreground relative scale-105 shadow-2xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-4 py-1 rounded-full text-sm font-bold">
                MAIS POPULAR
              </div>
              <h3 className="text-2xl font-bold mb-2">Pro</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">R$ 30</span>
                <span className="opacity-90">/PC/mês</span>
              </div>
              <p className="text-sm opacity-90 mb-6">Mínimo 100 computadores</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Tudo do Starter, mais:</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Webhooks personalizados</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="text-sm">Comandos com aprovação</span>
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
                <Link to="/signup">Começar Teste Grátis</Link>
              </Button>
            </div>

            {/* Enterprise */}
            <div className="bg-card p-8 rounded-2xl border border-border">
              <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">Sob</span>
                <span className="text-muted-foreground"> consulta</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">Para MSPs e grandes empresas</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Tudo do Pro, mais:</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">SSO/SAML</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Integração com SIEM</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Retenção estendida</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm">Suporte 24×7</span>
                </li>
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <a href="#contact">Falar com Vendas</a>
              </Button>
            </div>
          </div>

          <div className="text-center mt-12">
            <p className="text-muted-foreground">
              Todos os planos incluem: comandos, alertas, integrações e relatórios • Sem custos escondidos
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
              <h3 className="font-bold text-lg mb-2">Preciso desinstalar meu antivírus atual?</h3>
              <p className="text-muted-foreground">
                Não! O CyberShield trabalha junto com seu Defender, Kaspersky, ESET ou qualquer outro antivírus. 
                Eles continuam detectando vírus, e o CyberShield orquestra as ações de correção.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border">
              <h3 className="font-bold text-lg mb-2">Quanto tempo leva para instalar?</h3>
              <p className="text-muted-foreground">
                Menos de 5 minutos por computador. Você baixa um instalador pequeno (menos de 10MB), executa, 
                e pronto. Não precisa reiniciar. O computador já aparece no painel em segundos.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border">
              <h3 className="font-bold text-lg mb-2">Meus dados ficam seguros?</h3>
              <p className="text-muted-foreground">
                Sim. Cada cliente é 100% isolado (impossível um ver dados do outro). Toda comunicação é criptografada 
                com proteção militar. Cada ação é registrada para auditoria. Conformidade total com LGPD.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border">
              <h3 className="font-bold text-lg mb-2">Posso cancelar quando quiser?</h3>
              <p className="text-muted-foreground">
                Sim, sem multa ou burocracia. Você pode cancelar a qualquer momento e só paga pelo período que usar.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border">
              <h3 className="font-bold text-lg mb-2">O que acontece se eu passar do limite de PCs?</h3>
              <p className="text-muted-foreground">
                Você paga apenas pelos PCs adicionais, no mesmo valor por PC do seu plano. 
                Sem surpresas ou taxas escondidas.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl border border-border">
              <h3 className="font-bold text-lg mb-2">Vocês oferecem suporte em português?</h3>
              <p className="text-muted-foreground">
                Sim! Todo o suporte é em português, com equipe brasileira. 
                Plano Enterprise inclui suporte 24×7.
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
            Proteja Sua Empresa Agora
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Teste por 30 dias sem compromisso. Sem cartão de crédito. Cancele quando quiser.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="text-lg h-14 px-8">
              <Link to="/signup">
                Começar Teste Grátis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-lg h-14 px-8">
              <a href="#contact">Agendar Demo</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Fale com Nossa Equipe
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Preencha o formulário ou entre em contato diretamente. 
                Respondemos em até 24 horas.
              </p>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">Email</div>
                    <div className="text-muted-foreground">contato@cybershield.com.br</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Phone className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">Telefone</div>
                    <div className="text-muted-foreground">(11) 9999-9999</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">Localização</div>
                    <div className="text-muted-foreground">São Paulo, SP - Brasil</div>
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
