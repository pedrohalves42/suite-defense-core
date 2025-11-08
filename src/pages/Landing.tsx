import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Zap, 
  Users, 
  CheckCircle2, 
  TrendingUp, 
  Lock, 
  FileCheck, 
  Clock,
  Server,
  Play,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  Network,
  Activity,
  BookOpen,
  Mail
} from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">CyberShield</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#como-funciona" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Como Funciona</a>
            <a href="#beneficios" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Benefícios</a>
            <a href="#precos" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Preços</a>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Login</Button>
            </Link>
            <Link to="/signup">
              <Button size="sm" className="shadow-glow-primary">Começar Grátis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5 pointer-events-none" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
              Orquestração Multi-Tenant para Endpoints
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              Orquestração e resposta para endpoints — <span className="text-primary">multi-tenant</span>, em minutos
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Funciona por cima do Defender/AV: detecta, prioriza e remedia com playbooks aprovados, em tempo real
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/signup">
                <Button size="lg" className="text-lg px-8 shadow-glow-primary hover:shadow-border-glow">
                  Testar 30 dias grátis
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="text-lg px-8">
                <Play className="mr-2 h-5 w-5" />
                Ver demo de 5 min
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-8 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">10K+</div>
                <div className="text-sm text-muted-foreground">Jobs/mês processados</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">&lt;15s</div>
                <div className="text-sm text-muted-foreground">p95 execução de job</div>
              </div>
              <div className="text-center col-span-2 md:col-span-1">
                <div className="text-3xl font-bold text-primary">99.8%</div>
                <div className="text-sm text-muted-foreground">Taxa de sucesso</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Como Funciona */}
      <section id="como-funciona" className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Como funciona</h2>
            <p className="text-muted-foreground text-lg">Deploy em minutos, controle imediato</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="bg-card/50 border-border/50 hover:border-primary/50 transition-all duration-300">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Server className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">1. Instale o agente</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Script PowerShell/Bash com HMAC. Compatível com Windows Server 2016+, Linux (Ubuntu/Debian/RHEL).
                </CardDescription>
                <div className="mt-4 p-3 bg-muted/30 rounded border border-border/30">
                  <code className="text-xs font-mono text-primary">./install-agent.ps1</code>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50 hover:border-primary/50 transition-all duration-300">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">2. Execute playbooks</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Crie jobs: escanear vírus (VirusTotal), hardening (desabilitar SMBv1), compliance, patches. Aprove em dupla etapa.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50 hover:border-primary/50 transition-all duration-300">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <FileCheck className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">3. Gere relatórios</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Trilha completa de auditoria (quem, quando, resultado). Evidências para LGPD e BACEN 4.893.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Para Quem É */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Para quem é</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="bg-gradient-to-br from-card to-card/50 border-primary/20">
              <CardHeader>
                <Users className="h-10 w-10 text-primary mb-2" />
                <CardTitle className="text-2xl">MSPs e Integradores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Multi-tenancy nativo com RLS (Row Level Security)</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Auditoria completa por cliente e técnico</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Playbooks reutilizáveis entre clientes</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-card/50 border-accent/20">
              <CardHeader>
                <Network className="h-10 w-10 text-accent mb-2" />
                <CardTitle className="text-2xl">SMBs 20-500 endpoints</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Hardening rápido sem equipe dedicada</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Evidências para auditorias e compliance</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">Setup em 1 dia, resultados em 7 dias</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefícios → Features */}
      <section id="beneficios" className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Por que CyberShield</h2>
            <p className="text-muted-foreground text-lg">Reduza MTTR, mantenha conformidade, escale com confiança</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <Clock className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Resposta em minutos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">Jobs executam em &lt;15s (p95). Ações imediatas via playbooks pré-aprovados.</p>
                <Badge variant="outline" className="text-xs">Jobs programados</Badge>
                <Badge variant="outline" className="text-xs ml-2">Realtime updates</Badge>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <Users className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Multi-tenant real</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">Isolamento por RLS. MSPs gerenciam 100+ clientes com segurança.</p>
                <Badge variant="outline" className="text-xs">Row Level Security</Badge>
                <Badge variant="outline" className="text-xs ml-2">RBAC</Badge>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <FileCheck className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Auditoria completa</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">Trilha imutável: quem executou, quando, resultado. Export para PDF/CSV.</p>
                <Badge variant="outline" className="text-xs">LGPD ready</Badge>
                <Badge variant="outline" className="text-xs ml-2">BACEN 4.893</Badge>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CheckCircle2 className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Aprovação dupla</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">Jobs críticos exigem aprovação de admin. Histórico de quem autorizou.</p>
                <Badge variant="outline" className="text-xs">Workflow approval</Badge>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <Lock className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Segurança nativa</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">HMAC authentication, mTLS opcional, criptografia end-to-end.</p>
                <Badge variant="outline" className="text-xs">HMAC</Badge>
                <Badge variant="outline" className="text-xs ml-2">mTLS</Badge>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <Activity className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Visibilidade total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">Dashboard com status de agentes, jobs, alertas. Atualização em tempo real.</p>
                <Badge variant="outline" className="text-xs">Real-time</Badge>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Integrações */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Integrações</h2>
            <p className="text-muted-foreground text-lg">Funciona com suas ferramentas existentes</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Antivírus existente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Compatível com Windows Defender, Sophos, ESET, Kaspersky. Não substitui, orquestra por cima.</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                  VirusTotal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Scan de hash (sem upload de arquivo). BYO API key ou use quota compartilhada.</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Webhooks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Dispare alertas para Slack, Teams, Discord, ou SIEM/ITSM (em breve).</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-primary" />
                  APIs abertas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">REST API completa. Integre com automação existente (Ansible, Terraform, scripts).</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Segurança & Conformidade */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Segurança & Conformidade</h2>
              <p className="text-muted-foreground text-lg">Construído com security-first desde o dia 1</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Lock className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Isolamento por tenant</h3>
                    <p className="text-sm text-muted-foreground">Row Level Security (RLS) garante que MSPs nunca vejam dados de outros clientes.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">HMAC authentication</h3>
                    <p className="text-sm text-muted-foreground">Agentes autenticam com HMAC-SHA256. Opcional: mTLS para zero-trust.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileCheck className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Trilha de auditoria</h3>
                    <p className="text-sm text-muted-foreground">Logs imutáveis de todas as ações. Retention configurável (90 dias padrão).</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">LGPD & BACEN</h3>
                    <p className="text-sm text-muted-foreground">Relatórios de evidências para LGPD. Apoio a BACEN 4.893 (instituições financeiras).</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">RBAC granular</h3>
                    <p className="text-sm text-muted-foreground">Roles: admin, operador, auditor. Permissões por tenant e recurso.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Dados em repouso</h3>
                    <p className="text-sm text-muted-foreground">Criptografia AES-256. Backup diário automático com retention de 30 dias.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Preços */}
      <section id="precos" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Preços transparentes</h2>
            <p className="text-muted-foreground text-lg">Pague por endpoint ativo. Sem surpresas, sem lock-in.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Starter */}
            <Card className="bg-card/50 border-border/50 relative">
              <CardHeader>
                <Badge className="w-fit mb-2" variant="outline">Starter</Badge>
                <CardTitle className="text-3xl">R$ 29<span className="text-lg font-normal text-muted-foreground">/endpoint/mês</span></CardTitle>
                <CardDescription>Para SMBs até 50 endpoints</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">1 dispositivo grátis por 30 dias</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Jobs ilimitados</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Auditoria 90 dias</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Suporte por email</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">API básica</span>
                </div>
              </CardContent>
              <div className="p-6 pt-0">
                <Link to="/signup">
                  <Button className="w-full" variant="outline">Começar teste grátis</Button>
                </Link>
              </div>
            </Card>

            {/* Pro */}
            <Card className="bg-gradient-to-br from-primary/10 to-card border-primary relative shadow-glow-primary">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground">Mais Popular</Badge>
              </div>
              <CardHeader>
                <Badge className="w-fit mb-2 bg-primary/20 text-primary border-primary/30">Pro</Badge>
                <CardTitle className="text-3xl">R$ 49<span className="text-lg font-normal text-muted-foreground">/endpoint/mês</span></CardTitle>
                <CardDescription>Para MSPs e empresas 50-500 endpoints</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm font-semibold">Tudo do Starter, mais:</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">5 dispositivos grátis por 30 dias</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Multi-tenant (RLS)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Auditoria 365 dias</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Suporte prioritário (SLA 4h)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Webhooks ilimitados</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Playbooks customizados</span>
                </div>
              </CardContent>
              <div className="p-6 pt-0">
                <Link to="/signup">
                  <Button className="w-full shadow-glow-primary">Começar teste grátis</Button>
                </Link>
              </div>
            </Card>

            {/* Enterprise */}
            <Card className="bg-card/50 border-border/50 relative">
              <CardHeader>
                <Badge className="w-fit mb-2" variant="outline">Enterprise</Badge>
                <CardTitle className="text-3xl">Sob consulta</CardTitle>
                <CardDescription>Para grandes MSPs e corporações 500+</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm font-semibold">Tudo do Pro, mais:</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">SLA 99.9% uptime</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Suporte 24/7 (SLA 1h)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">SSO (SAML/OIDC)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Implementação assistida</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Customizações sob demanda</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Self-hosted opcional</span>
                </div>
              </CardContent>
              <div className="p-6 pt-0">
                <Button className="w-full" variant="outline">Falar com vendas</Button>
              </div>
            </Card>
          </div>
          <p className="text-center text-muted-foreground mt-8 text-sm">
            💡 Hardening em 7 dias: plano Pro por 30 dias, onboarding incluso. Não ficou satisfeito? 100% reembolso.
          </p>
        </div>
      </section>

      {/* Provas Sociais */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">O que nossos clientes dizem</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <Card className="bg-card/50">
              <CardContent className="pt-6">
                <p className="text-muted-foreground mb-4">"Em 7 dias, zeramos SMBv1 em 120 máquinas. Antes levávamos meses fazendo manualmente."</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">RC</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Rafael Costa</p>
                    <p className="text-xs text-muted-foreground">CTO, MSP TechSec</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardContent className="pt-6">
                <p className="text-muted-foreground mb-4">"Auditoria do BACEN ficou 3x mais rápida. Conseguimos exportar tudo com 2 cliques."</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">MS</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Mariana Silva</p>
                    <p className="text-xs text-muted-foreground">CISO, Banco Regional</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardContent className="pt-6">
                <p className="text-muted-foreground mb-4">"Gerenciamos 80 clientes com 1 técnico. Multi-tenant real mudou nosso negócio."</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">PA</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Paulo Andrade</p>
                    <p className="text-xs text-muted-foreground">CEO, Cloud Services BR</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Perguntas Frequentes</h2>
          </div>
          <div className="max-w-3xl mx-auto space-y-4">
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg">Quanto tempo leva a implantação?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Setup inicial: 1 hora. Primeiro job rodando: 15 minutos. Hardening completo (SMBv1, patches, compliance): 7 dias em média.</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg">É compatível com meu antivírus atual?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Sim! CyberShield não substitui Defender/Sophos/ESET. Orquestramos ações por cima do AV existente (verificações, hardening, compliance).</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg">Onde os dados ficam armazenados?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Cloud (AWS São Paulo) com backup diário. Planos Enterprise podem self-host. Criptografia AES-256 em repouso, TLS 1.3 em trânsito.</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg">Como funciona o billing?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Cobrança mensal por endpoint ativo (heartbeat nos últimos 7 dias). Aumente/diminua quantos quiser. Cancele quando quiser, sem multa.</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg">Qual o SLA de suporte?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Starter: email em 24h. Pro: 4h (horário comercial). Enterprise: 1h 24/7 com telefone direto.</p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg">Preciso de API key do VirusTotal?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Não obrigatório. Oferecemos quota compartilhada (4 req/min). Para volume alto, recomendamos BYO key (Public API é grátis).</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-3xl md:text-5xl font-bold">Pronto para hardening em 7 dias?</h2>
            <p className="text-xl text-muted-foreground">Teste 1 dispositivo grátis por 30 dias. Sem cartão de crédito.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Link to="/signup">
                <Button size="lg" className="text-lg px-8 shadow-glow-primary hover:shadow-border-glow">
                  Começar teste grátis
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="text-lg px-8">
                <Mail className="mr-2 h-5 w-5" />
                Falar com especialista
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-12 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-6 w-6 text-primary" />
                <span className="text-lg font-bold">CyberShield</span>
              </div>
              <p className="text-sm text-muted-foreground">Orquestração multi-tenant para endpoints. Resposta em minutos, conformidade em dias.</p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Produto</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#como-funciona" className="hover:text-foreground transition-colors">Como Funciona</a></li>
                <li><a href="#beneficios" className="hover:text-foreground transition-colors">Benefícios</a></li>
                <li><a href="#precos" className="hover:text-foreground transition-colors">Preços</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Roadmap</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Recursos</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Documentação
                </a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">API Reference</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Playbooks</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Status</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacidade</Link></li>
                <li><Link to="/terms" className="hover:text-foreground transition-colors">Termos de Uso</Link></li>
                <li><a href="#" className="hover:text-foreground transition-colors">LGPD</a></li>
                <li><a href="mailto:contato@cybershield.com.br" className="hover:text-foreground transition-colors">Contato</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/50 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2025 CyberShield. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
