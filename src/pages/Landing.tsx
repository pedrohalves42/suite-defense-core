import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Activity, Bell, Users, Lock, Zap, CheckCircle2 } from 'lucide-react';

export default function Landing() {
  const features = [
    {
      icon: Activity,
      title: 'Monitoramento em Tempo Real',
      description: 'Acompanhe o status de seus servidores 24/7 com atualizações instantâneas.',
    },
    {
      icon: Shield,
      title: 'Detecção de Ameaças',
      description: 'Integração com VirusTotal para análise avançada de arquivos suspeitos.',
    },
    {
      icon: Bell,
      title: 'Alertas Inteligentes',
      description: 'Receba notificações imediatas sobre eventos críticos de segurança.',
    },
    {
      icon: Users,
      title: 'Multi-Tenant',
      description: 'Gerencie múltiplos clientes e organizações em uma única plataforma.',
    },
    {
      icon: Lock,
      title: 'Segurança Avançada',
      description: 'RBAC, HMAC, auditoria completa e proteção de dados sensíveis.',
    },
    {
      icon: Zap,
      title: 'Deploy Rápido',
      description: 'Instale agentes em servidores Linux e Windows com apenas um comando.',
    },
  ];

  const steps = [
    {
      number: '01',
      title: 'Crie sua Conta',
      description: 'Cadastre-se gratuitamente e configure sua organização.',
    },
    {
      number: '02',
      title: 'Instale os Agentes',
      description: 'Use nossos scripts de instalação automatizada em seus servidores.',
    },
    {
      number: '03',
      title: 'Monitore e Proteja',
      description: 'Acompanhe em tempo real e receba alertas de segurança.',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header/Navbar */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary animate-pulse-glow" />
            <span className="text-xl font-bold text-foreground">CyberShield Cloud</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link to="/signup">
              <Button className="shadow-glow-primary">Começar Gratuitamente</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 lg:py-32">
        <div className="max-w-4xl mx-auto text-center space-y-8 animate-slide-in">
          <div className="inline-block">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
              <Shield className="h-4 w-4" />
              Proteção Empresarial
            </div>
          </div>
          
          <h1 className="text-4xl lg:text-6xl font-bold text-foreground leading-tight">
            Monitore e Proteja Seus
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              Servidores em Tempo Real
            </span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Plataforma completa de monitoramento e segurança para servidores Linux e Windows.
            Detecção de ameaças, alertas inteligentes e gestão multi-tenant.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/signup">
              <Button size="lg" className="shadow-glow-primary text-lg px-8">
                Começar Agora
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="text-lg px-8">
                Já tenho conta
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20 bg-gradient-cyber">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
              Por que escolher o CyberShield?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Recursos poderosos para proteger sua infraestrutura
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="bg-gradient-card border-border/50 hover:border-primary/50 transition-all hover:shadow-glow-primary"
              >
                <CardHeader>
                  <div className="rounded-lg bg-primary/10 w-12 h-12 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
              Como funciona?
            </h2>
            <p className="text-lg text-muted-foreground">
              Três passos simples para começar
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-2xl font-bold shadow-glow-primary">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary/50 to-accent/50" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="container mx-auto px-4 py-20 bg-gradient-cyber">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-gradient-card border-primary/30 shadow-glow-primary">
            <CardHeader className="text-center space-y-4">
              <CardTitle className="text-3xl">Pronto para proteger seus servidores?</CardTitle>
              <CardDescription className="text-base">
                Junte-se a empresas que confiam no CyberShield para manter sua infraestrutura segura
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  'Instalação em minutos',
                  'Sem custos iniciais',
                  'Suporte técnico',
                  'Atualizações automáticas',
                ].map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span className="text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-center pt-4">
                <Link to="/signup">
                  <Button size="lg" className="shadow-glow-primary text-lg px-12">
                    Criar Conta Gratuita
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <span className="font-bold text-foreground">CyberShield Cloud</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Proteção e monitoramento avançado para sua infraestrutura.
              </p>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-semibold text-foreground">Recursos</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/login" className="hover:text-primary transition-colors">Dashboard</Link></li>
                <li><Link to="/signup" className="hover:text-primary transition-colors">Criar Conta</Link></li>
              </ul>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-semibold text-foreground">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/terms" className="hover:text-primary transition-colors">Termos de Uso</Link></li>
                <li><Link to="/privacy" className="hover:text-primary transition-colors">Política de Privacidade</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-border/40 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} CyberShield Cloud. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
