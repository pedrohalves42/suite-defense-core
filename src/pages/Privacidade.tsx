import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, Lock, Eye, FileText, Globe, UserCheck, ArrowRight, ExternalLink, Mail, Clock, Building2, Cookie, Server, Bell } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { CONTACT } from '@/constants/config';

const sections = [
  {
    icon: Eye,
    title: '1. O que coletamos e por quê',
    summary: 'Coletamos apenas o necessário para proteger sua empresa.',
    items: [
      { label: 'Seus dados de conta', desc: 'Nome, e-mail e organização — para identificar você e dar acesso seguro ao painel.' },
      { label: 'Como você usa o sistema', desc: 'Páginas visitadas, horários de acesso e ações realizadas — para melhorar sua experiência e detectar acessos suspeitos.' },
      { label: 'Dados dos computadores protegidos', desc: 'Status de proteção, programas instalados e alertas de segurança — é o que permite o CyberShield monitorar e proteger.' },
    ],
  },
  {
    icon: Lock,
    title: '2. Como protegemos seus dados',
    summary: 'Usamos as mesmas tecnologias que grandes empresas de segurança.',
    items: [
      { label: 'Tudo criptografado', desc: 'Suas senhas são armazenadas com criptografia forte (bcrypt). Toda comunicação usa HTTPS.' },
      { label: 'Dados isolados por empresa', desc: 'Cada organização tem seus dados completamente separados. Ninguém de outra empresa consegue ver os seus.' },
      { label: 'Registro de tudo', desc: 'Todas as ações importantes ficam registradas, criando um histórico completo para auditoria.' },
    ],
  },
  {
    icon: UserCheck,
    title: '3. Seus direitos — você está no controle',
    summary: 'A LGPD e o GDPR garantem que seus dados são seus. Sempre.',
    items: [
      { label: '📋 Ver e exportar', desc: 'Peça uma cópia de todos os dados que temos sobre você. Entregaremos em formato legível.' },
      { label: '✏️ Corrigir', desc: 'Encontrou algo errado? Solicite a correção e atualizaremos imediatamente.' },
      { label: '🗑️ Apagar', desc: 'Quer sair? Solicite a exclusão completa dos seus dados. Sem perguntas.' },
      { label: '⏸️ Limitar', desc: 'Peça para pausar o uso dos seus dados enquanto analisa alguma questão.' },
      { label: '🔄 Levar para outro lugar', desc: 'Exporte seus dados em formato padrão para usar em outro serviço.' },
      { label: '🚫 Se opor', desc: 'Discorda de como usamos seus dados? Diga e resolveremos.' },
    ],
  },
  {
    icon: Globe,
    title: '4. Com quem compartilhamos',
    summary: 'Resumo: com quase ninguém. E nunca vendemos seus dados.',
    items: [
      { label: '🚫 Nunca vendemos', desc: 'Seus dados pessoais jamais são vendidos, alugados ou comercializados. Ponto final.' },
      { label: '🔧 Parceiros essenciais', desc: 'Usamos serviços para análise de ameaças (VirusTotal) e pagamentos (Stripe). Apenas o mínimo necessário.' },
      { label: '⚖️ Obrigações legais', desc: 'Se a justiça ou a ANPD pedir, somos obrigados a fornecer. Mas avisaremos você quando possível.' },
    ],
  },
  {
    icon: Cookie,
    title: '5. Cookies e armazenamento local',
    summary: 'Usamos cookies para manter você logado e melhorar o sistema.',
    items: [
      { label: '✅ Essenciais', desc: 'Mantêm sua sessão ativa e o sistema funcionando. Não podem ser desligados.' },
      { label: '📊 Análise', desc: 'Nos ajudam a entender como o sistema é usado para melhorá-lo. Você pode recusar.' },
      { label: '⚙️ Suas preferências', desc: 'Lembram suas configurações (tema, idioma). Você controla nas configurações de cookies.' },
    ],
  },
  {
    icon: Server,
    title: '6. Onde ficam seus dados',
    summary: 'Seus dados são processados em infraestrutura segura com data centers certificados.',
    items: [
      { label: 'Infraestrutura em nuvem', desc: 'Utilizamos provedores com certificações SOC 2 e ISO 27001.' },
      { label: 'Transferências internacionais', desc: 'Quando necessário, usamos cláusulas contratuais padrão aprovadas pela ANPD.' },
      { label: 'Backups seguros', desc: 'Cópias de segurança criptografadas para garantir que seus dados nunca se percam.' },
    ],
  },
  {
    icon: Clock,
    title: '7. Por quanto tempo guardamos',
    summary: 'Cada tipo de dado tem um prazo claro de retenção.',
    items: [
      { label: 'Dados da conta', desc: 'Enquanto sua conta estiver ativa + 30 dias após exclusão.' },
      { label: 'Histórico de segurança', desc: '12 meses — tempo suficiente para investigar incidentes.' },
      { label: 'Relatórios e laudos', desc: '24 meses — para consultas e compliance.' },
      { label: 'Dados financeiros', desc: '5 anos — conforme exigido pela legislação fiscal brasileira.' },
    ],
  },
  {
    icon: Bell,
    title: '8. Mudanças nesta política',
    summary: 'Se mudarmos algo importante, você saberá antes.',
    items: [
      { label: 'Aviso prévio', desc: 'Mudanças significativas serão comunicadas por e-mail com 30 dias de antecedência.' },
      { label: 'Histórico de versões', desc: 'Mantemos um registro de todas as alterações para sua consulta.' },
      { label: 'Consentimento renovado', desc: 'Se a mudança afetar seus direitos, pediremos seu consentimento novamente.' },
    ],
  },
];

export default function Privacidade() {
  return (
    <>
      <SEOHead
        title="Política de Privacidade | CyberShield"
        description="Saiba como o CyberShield protege seus dados. Política de Privacidade em conformidade com LGPD e GDPR. Linguagem clara e transparente."
        canonicalUrl="/privacidade"
        noIndex={false}
      />

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
              Transparência e segurança são pilares do CyberShield. Aqui explicamos,
              em linguagem simples, como coletamos, usamos e protegemos seus dados.
            </p>

            {/* Resumo rápido */}
            <div className="mt-8 p-4 rounded-xl bg-primary/5 border border-primary/20 max-w-2xl">
              <h2 className="text-sm font-semibold text-primary mb-2">📌 Resumo rápido</h2>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li>✅ Coletamos apenas o necessário para proteger sua empresa</li>
                <li>✅ Nunca vendemos seus dados</li>
                <li>✅ Você pode ver, corrigir ou apagar seus dados a qualquer momento</li>
                <li>✅ Dados isolados por empresa — ninguém vê o que é seu</li>
                <li>✅ Em conformidade com LGPD (Brasil) e GDPR (Europa)</li>
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
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-semibold">{section.title}</h2>
                  </div>
                  <p className="text-sm text-primary/80 mb-6 ml-12">{section.summary}</p>
                  <div className={`grid gap-4 ${section.items.length > 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-3'}`}>
                    {section.items.map((item) => (
                      <div key={item.label} className="space-y-1.5 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                        <h3 className="font-medium text-foreground">{item.label}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {/* DPO Contact */}
            <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </div>
                <h2 className="text-xl md:text-2xl font-semibold">Fale com nosso DPO</h2>
              </div>
              <p className="text-muted-foreground mb-6">
                O Encarregado de Proteção de Dados (DPO) é a pessoa responsável por cuidar da sua privacidade dentro do CyberShield.
                Qualquer dúvida, reclamação ou solicitação sobre seus dados, fale diretamente:
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border/50">
                  <Mail className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">E-mail</p>
                    <p className="text-sm text-muted-foreground">{CONTACT.EMAIL}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border/50">
                  <Clock className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Prazo de resposta</p>
                    <p className="text-sm text-muted-foreground">Até 15 dias úteis</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border/50">
                  <Building2 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Autoridade Nacional</p>
                    <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      ANPD — www.gov.br/anpd
                    </a>
                  </div>
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
                  Segurança completa com monitoramento em tempo real, alertas inteligentes e conformidade LGPD.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link to="/">
                  <Button size="lg" className="gap-2 text-base px-8">
                    Conhecer o CyberShield
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/terms">
                  <Button size="lg" variant="outline" className="gap-2 text-base px-8">
                    Ver Termos de Serviço
                    <FileText className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground/60 mt-12">
            © {new Date().getFullYear()} CyberShield — Todos os direitos reservados. · CNPJ: XX.XXX.XXX/0001-XX
          </p>
        </main>
      </div>
    </>
  );
}
