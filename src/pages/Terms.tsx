import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, FileText, ArrowLeft, CheckCircle2, XCircle, CreditCard, Scale, AlertTriangle, RefreshCw, Mail, Gavel } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { CONTACT } from '@/constants/config';

const sections = [
  {
    icon: CheckCircle2,
    title: '1. O que você está aceitando',
    content: (
      <div className="space-y-3">
        <p>Ao criar uma conta ou usar o CyberShield, você concorda com estes termos. Em linguagem simples:</p>
        <ul className="space-y-2">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-cta-positive mt-1 shrink-0" />
            <span>Você pode usar o CyberShield para proteger os computadores da sua empresa</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-cta-positive mt-1 shrink-0" />
            <span>Vamos monitorar e proteger seus equipamentos conforme o plano contratado</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-cta-positive mt-1 shrink-0" />
            <span>Seus dados ficam isolados e protegidos — só sua equipe tem acesso</span>
          </li>
        </ul>
      </div>
    ),
  },
  {
    icon: Shield,
    title: '2. O que o CyberShield faz por você',
    content: (
      <div className="space-y-3">
        <p>O CyberShield é uma plataforma de segurança para empresas que oferece:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            'Monitoramento em tempo real dos seus computadores',
            'Detecção automática de ameaças e malware',
            'Relatórios e laudos de segurança',
            'Alertas inteligentes quando algo precisa de atenção',
            'Painel centralizado para toda a equipe',
            'Conformidade com LGPD e boas práticas de segurança',
          ].map((item) => (
            <div key={item} className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-sm">{item}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: XCircle,
    title: '3. O que você NÃO pode fazer',
    content: (
      <div className="space-y-3">
        <p>Para manter o CyberShield seguro para todos, você concorda em não:</p>
        <ul className="space-y-2">
          {[
            'Usar o sistema para atividades ilegais ou prejudicar terceiros',
            'Tentar acessar dados de outras empresas',
            'Compartilhar suas credenciais com pessoas não autorizadas',
            'Fazer engenharia reversa do software ou dos agentes',
            'Sobrecarregar o sistema com uso abusivo de recursos',
            'Transmitir vírus ou código malicioso através da plataforma',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive mt-1 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    icon: CreditCard,
    title: '4. Planos e pagamento',
    content: (
      <div className="space-y-4">
        <p>Oferecemos diferentes planos para diferentes necessidades:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-2">
            <h4 className="font-medium">💳 Cobrança</h4>
            <p className="text-sm text-muted-foreground">Pagamentos processados com segurança via Stripe. Aceitamos cartão de crédito e boleto.</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-2">
            <h4 className="font-medium">📅 Renovação</h4>
            <p className="text-sm text-muted-foreground">Assinaturas renovam automaticamente. Avisaremos 7 dias antes da cobrança.</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-2">
            <h4 className="font-medium">❌ Cancelamento</h4>
            <p className="text-sm text-muted-foreground">Cancele quando quiser. O acesso continua até o fim do período já pago.</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-2">
            <h4 className="font-medium">💰 Reembolso</h4>
            <p className="text-sm text-muted-foreground">Insatisfeito nos primeiros 14 dias? Devolvemos seu dinheiro sem perguntas.</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: AlertTriangle,
    title: '5. Limitações importantes',
    content: (
      <div className="space-y-3">
        <p>Precisamos ser transparentes sobre o que podemos e não podemos garantir:</p>
        <div className="p-4 rounded-xl bg-warning/5 border border-warning/20 space-y-3">
          <p className="text-sm">
            <strong>O CyberShield reduz significativamente os riscos de segurança</strong>, mas nenhum sistema é 100% infalível.
            Fazemos o nosso melhor para proteger sua empresa, mas não garantimos detecção de todas as ameaças existentes.
          </p>
          <p className="text-sm">
            Não nos responsabilizamos por danos indiretos causados por falhas no serviço, como perda de dados que não estejam
            sob nosso controle direto.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          <strong>Dica:</strong> O CyberShield funciona melhor quando combinado com boas práticas de segurança na sua empresa
          (senhas fortes, atualizações em dia, treinamento da equipe).
        </p>
      </div>
    ),
  },
  {
    icon: Scale,
    title: '6. Propriedade intelectual',
    content: (
      <div className="space-y-3">
        <p>
          O CyberShield, incluindo seu código, design, marca e documentação, é propriedade exclusiva da nossa empresa.
          Você tem o direito de <strong>usar</strong> o serviço conforme seu plano, mas não de copiar, modificar ou redistribuir.
        </p>
        <p className="text-sm text-muted-foreground">
          Os relatórios e dados gerados sobre <strong>sua</strong> empresa são seus. Você pode exportá-los a qualquer momento.
        </p>
      </div>
    ),
  },
  {
    icon: RefreshCw,
    title: '7. Mudanças nestes termos',
    content: (
      <div className="space-y-3">
        <p>Podemos atualizar estes termos quando necessário. Quando isso acontecer:</p>
        <ul className="space-y-2">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
            <span>Avisaremos por e-mail com <strong>30 dias de antecedência</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
            <span>Destacaremos o que mudou de forma clara</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" />
            <span>Você pode discordar e encerrar sua conta sem custo</span>
          </li>
        </ul>
      </div>
    ),
  },
  {
    icon: Gavel,
    title: '8. Lei aplicável e foro',
    content: (
      <div className="space-y-3">
        <p>
          Estes termos são regidos pelas leis brasileiras, incluindo o Código de Defesa do Consumidor,
          Marco Civil da Internet e LGPD.
        </p>
        <p className="text-sm text-muted-foreground">
          Qualquer disputa será resolvida preferencialmente por mediação. Se necessário, o foro será
          o da comarca de Uberlândia/MG.
        </p>
      </div>
    ),
  },
];

export default function Terms() {
  return (
    <>
      <SEOHead
        title="Termos de Serviço | CyberShield"
        description="Termos de Serviço do CyberShield em linguagem clara e acessível. Saiba seus direitos e responsabilidades ao usar nossa plataforma de segurança."
        canonicalUrl="/terms"
      />

      <div className="min-h-screen bg-background text-foreground">
        {/* Header */}
        <header className="relative overflow-hidden border-b border-border/40">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
          <div className="container mx-auto px-4 py-16 md:py-24 max-w-5xl relative z-10">
            <Link to="/">
              <Button variant="ghost" size="sm" className="mb-6 -ml-2">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao início
              </Button>
            </Link>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                Contrato de uso
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Termos de Serviço
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              Escrevemos estes termos para que qualquer pessoa consiga entender.
              Sem juridiquês, sem letras miúdas.
            </p>

            {/* Quick summary */}
            <div className="mt-8 p-4 rounded-xl bg-primary/5 border border-primary/20 max-w-2xl">
              <h2 className="text-sm font-semibold text-primary mb-2">📌 Em resumo</h2>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li>✅ Use o CyberShield para proteger sua empresa</li>
                <li>✅ Seus dados e relatórios são seus — exporte quando quiser</li>
                <li>✅ Cancele a qualquer momento, sem multa</li>
                <li>✅ 14 dias de garantia de satisfação</li>
                <li>⚠️ Não use para atividades ilegais ou acessar dados de terceiros</li>
              </ul>
            </div>

            <p className="text-sm text-muted-foreground/70 mt-6">
              Última atualização: Janeiro de 2025 · Versão 2.0
            </p>
          </div>
        </header>

        {/* Content */}
        <main className="container mx-auto px-4 py-12 md:py-16 max-w-5xl">
          <div className="grid gap-8 md:gap-10">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <section
                  key={section.title}
                  className="group rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 md:p-8 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-semibold">{section.title}</h2>
                  </div>
                  <div className="text-muted-foreground leading-relaxed">
                    {section.content}
                  </div>
                </section>
              );
            })}

            {/* Contact */}
            <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </div>
                <h2 className="text-xl md:text-2xl font-semibold">Dúvidas sobre estes termos?</h2>
              </div>
              <p className="text-muted-foreground mb-4">
                Se algo não ficou claro, entre em contato. Teremos prazer em explicar.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href={`mailto:${CONTACT.EMAIL}`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Mail className="h-4 w-4" />
                    {CONTACT.EMAIL}
                  </Button>
                </a>
                <a href={CONTACT.WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2">
                    WhatsApp · {CONTACT.PHONE_FORMATTED}
                  </Button>
                </a>
              </div>
            </section>
          </div>

          {/* Navigation */}
          <div className="mt-16 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/privacy">
              <Button variant="outline" className="gap-2 w-full sm:w-auto">
                <Shield className="h-4 w-4" />
                Política de Privacidade
              </Button>
            </Link>
            <Link to="/security">
              <Button variant="outline" className="gap-2 w-full sm:w-auto">
                <Shield className="h-4 w-4" />
                Como protegemos seus dados
              </Button>
            </Link>
          </div>

          <p className="text-center text-xs text-muted-foreground/60 mt-12">
            © {new Date().getFullYear()} CyberShield — Todos os direitos reservados.
          </p>
        </main>
      </div>
    </>
  );
}
