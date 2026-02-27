import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, Lock, Eye, FileText, Globe, UserCheck, ArrowRight, ExternalLink } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

const sections = [
  {
    icon: Eye,
    title: '1. Informações que Coletamos',
    items: [
      { label: 'Dados de Cadastro', desc: 'Nome, e-mail e organização para identificação e autenticação.' },
      { label: 'Dados de Uso', desc: 'Endereço IP, user agent e logs de atividade para segurança.' },
      { label: 'Dados Técnicos', desc: 'Status de agentes, hashes de arquivos e relatórios de segurança.' },
    ],
  },
  {
    icon: Lock,
    title: '2. Segurança dos Dados',
    items: [
      { label: 'Criptografia', desc: 'Senhas com hash bcrypt, HTTPS para toda transmissão de dados.' },
      { label: 'Isolamento Multi-tenant', desc: 'Row Level Security (RLS) garante isolamento total por organização.' },
      { label: 'Auditoria Completa', desc: 'Logs de todas as ações sensíveis com rastreamento integral.' },
    ],
  },
  {
    icon: UserCheck,
    title: '3. Seus Direitos (LGPD/GDPR)',
    items: [
      { label: 'Acesso e Portabilidade', desc: 'Solicite cópia ou exportação dos seus dados a qualquer momento.' },
      { label: 'Retificação e Exclusão', desc: 'Corrija dados incorretos ou solicite remoção completa.' },
      { label: 'Revogação', desc: 'Retire seu consentimento quando desejar, sem prejuízo.' },
    ],
  },
  {
    icon: Globe,
    title: '4. Compartilhamento',
    items: [
      { label: 'Nunca vendemos seus dados', desc: 'Seus dados pessoais jamais são comercializados.' },
      { label: 'Parceiros essenciais', desc: 'Apenas serviços necessários como análise de malware e pagamentos.' },
      { label: 'Conformidade legal', desc: 'Compartilhamento somente quando exigido por autoridades competentes.' },
    ],
  },
];

export default function Privacidade() {
  return (
    <>
      <Helmet>
        <title>Política de Privacidade | CyberShield</title>
        <meta name="description" content="Saiba como o CyberShield protege seus dados. Política de Privacidade em conformidade com LGPD e GDPR." />
        <link rel="canonical" href="https://cybsheld.com.br/privacidade" />
      </Helmet>

      <div className="min-h-screen bg-background text-foreground">
        {/* Hero */}
        <header className="relative overflow-hidden border-b border-border/40">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
          <div className="container mx-auto px-4 py-16 md:py-24 max-w-5xl relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                LGPD &amp; GDPR
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Política de Privacidade
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              Transparência e segurança são pilares do CyberShield. Conheça como
              coletamos, utilizamos e protegemos seus dados.
            </p>
            <p className="text-sm text-muted-foreground/70 mt-4">
              Última atualização: {new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' })}
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
                  <div className="grid gap-4 sm:grid-cols-3">
                    {section.items.map((item) => (
                      <div key={item.label} className="space-y-1.5">
                        <h3 className="font-medium text-foreground">{item.label}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {/* Additional Info */}
            <section className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <h2 className="text-xl md:text-2xl font-semibold">5. Informações Adicionais</h2>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="font-medium">Retenção de Dados</h3>
                  <ul className="text-sm text-muted-foreground space-y-1.5">
                    <li>• Dados de conta: enquanto ativa</li>
                    <li>• Logs de auditoria: 12 meses</li>
                    <li>• Relatórios de segurança: 24 meses</li>
                    <li>• Dados financeiros: conforme lei (7 anos)</li>
                  </ul>
                </div>
                <div className="space-y-3">
                  <h3 className="font-medium">Contato do DPO</h3>
                  <ul className="text-sm text-muted-foreground space-y-1.5">
                    <li>📧 dpo@cybershield.com</li>
                    <li>⏱️ Resposta em até 15 dias úteis</li>
                    <li>🏛️ ANPD: www.gov.br/anpd</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <div className="inline-flex flex-col items-center gap-6 p-8 md:p-12 rounded-3xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent max-w-2xl">
              <Shield className="h-12 w-12 text-primary" />
              <div className="space-y-2">
                <h2 className="text-2xl md:text-3xl font-bold">Proteja sua empresa agora</h2>
                <p className="text-muted-foreground">
                  Segurança de endpoint com monitoramento em tempo real, alertas inteligentes e conformidade LGPD.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link to="/">
                  <Button size="lg" className="gap-2 text-base px-8">
                    Conhecer o CyberShield
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="https://cybsheld.com.br" target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="outline" className="gap-2 text-base px-8">
                    Visitar site
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-muted-foreground/60 mt-12">
            © {new Date().getFullYear()} CyberShield — Todos os direitos reservados.
          </p>
        </main>
      </div>
    </>
  );
}
