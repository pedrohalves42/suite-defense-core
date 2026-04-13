import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, Lock, Server, Eye, Users, FileCheck, ArrowRight, CheckCircle2, Globe, Fingerprint, ShieldCheck, KeyRound } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';

const practices = [
  {
    icon: Lock,
    title: 'Criptografia em tudo',
    description: 'Todas as comunicações usam TLS 1.3. Senhas são armazenadas com bcrypt. Dados sensíveis são criptografados em repouso com AES-256.',
    badge: 'Infraestrutura',
  },
  {
    icon: Fingerprint,
    title: 'Autenticação forte',
    description: 'Suporte a autenticação multifator (MFA), tokens de sessão seguros e bloqueio automático após tentativas falhas.',
    badge: 'Identidade',
  },
  {
    icon: Users,
    title: 'Isolamento multi-tenant',
    description: 'Cada empresa tem seus dados completamente isolados usando Row Level Security no banco de dados. É impossível acessar dados de outra organização.',
    badge: 'Isolamento',
  },
  {
    icon: KeyRound,
    title: 'Autenticação de agentes (HMAC)',
    description: 'Cada computador protegido possui uma chave criptográfica única. Todas as comunicações são assinadas e verificadas.',
    badge: 'Agentes',
  },
  {
    icon: Eye,
    title: 'Auditoria completa',
    description: 'Todas as ações sensíveis são registradas com histórico imutável. Quem fez, quando fez e o que mudou — tudo rastreável.',
    badge: 'Compliance',
  },
  {
    icon: FileCheck,
    title: 'Integridade verificável',
    description: 'Laudos e relatórios possuem hash criptográfico único. Qualquer alteração é detectada automaticamente.',
    badge: 'Integridade',
  },
  {
    icon: Server,
    title: 'Infraestrutura segura',
    description: 'Hospedagem em provedores com certificações SOC 2 e ISO 27001. Backups criptografados diários com retenção geográfica.',
    badge: 'Infraestrutura',
  },
  {
    icon: ShieldCheck,
    title: 'Zero Trust por padrão',
    description: 'Nunca confiamos cegamente. Cada requisição é autenticada e autorizada independentemente. Princípio do menor privilégio em todo o sistema.',
    badge: 'Arquitetura',
  },
];

const certifications = [
  { name: 'LGPD', description: 'Lei Geral de Proteção de Dados — Brasil' },
  { name: 'GDPR', description: 'Regulamento Geral sobre a Proteção de Dados — Europa' },
  { name: 'SOC 2', description: 'Controles de segurança auditados (infraestrutura)' },
  { name: 'ISO 27001', description: 'Gestão de segurança da informação (infraestrutura)' },
];

export default function Security() {
  return (
    <>
      <SEOHead
        title="Segurança | CyberShield — Como protegemos seus dados"
        description="Conheça as práticas de segurança do CyberShield: criptografia, isolamento multi-tenant, autenticação forte e conformidade LGPD/GDPR."
        canonicalUrl="/security"
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
                Segurança
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Como protegemos seus dados
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              Segurança não é apenas o que oferecemos — é como construímos cada parte do CyberShield.
              Aqui mostramos, com transparência, o que fazemos para proteger sua empresa.
            </p>
          </div>
        </header>

        {/* Practices */}
        <main className="container mx-auto px-4 py-12 md:py-16 max-w-5xl">
          <div className="grid gap-6 md:grid-cols-2">
            {practices.map((practice) => {
              const Icon = practice.icon;
              return (
                <div
                  key={practice.title}
                  className="group rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">{practice.title}</h2>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium uppercase tracking-wider">
                          {practice.badge}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {practice.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compliance */}
          <section className="mt-16">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3">Conformidade e certificações</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Seguimos os mais rigorosos padrões de segurança e privacidade do mercado.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {certifications.map((cert) => (
                <div key={cert.name} className="text-center p-6 rounded-2xl border border-border/50 bg-card/50 hover:border-primary/30 transition-colors">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-3">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h3 className="font-bold text-lg">{cert.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{cert.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Responsible Disclosure */}
          <section className="mt-16 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Globe className="h-5 w-5" />
              </div>
              <h2 className="text-xl md:text-2xl font-semibold">Encontrou uma vulnerabilidade?</h2>
            </div>
            <p className="text-muted-foreground mb-4">
              Levamos segurança a sério. Se você encontrou uma falha de segurança, queremos saber.
              Temos um programa de divulgação responsável e reconhecemos pesquisadores de boa-fé.
            </p>
            <div className="grid gap-3 sm:grid-cols-3 mb-6">
              <div className="p-3 rounded-xl bg-card border border-border/50">
                <p className="text-sm font-medium">📧 Reporte</p>
                <p className="text-sm text-muted-foreground">security@cybershield.com.br</p>
              </div>
              <div className="p-3 rounded-xl bg-card border border-border/50">
                <p className="text-sm font-medium">⏱️ Resposta</p>
                <p className="text-sm text-muted-foreground">Em até 48 horas</p>
              </div>
              <div className="p-3 rounded-xl bg-card border border-border/50">
                <p className="text-sm font-medium">🏆 Reconhecimento</p>
                <p className="text-sm text-muted-foreground">Hall of Fame para pesquisadores</p>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className="mt-16 text-center">
            <div className="inline-flex flex-col items-center gap-6 p-8 md:p-12 rounded-3xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent max-w-2xl">
              <Shield className="h-12 w-12 text-primary" />
              <div className="space-y-2">
                <h2 className="text-2xl md:text-3xl font-bold">Pronto para proteger sua empresa?</h2>
                <p className="text-muted-foreground">
                  Comece gratuitamente e veja o CyberShield em ação.
                </p>
              </div>
              <Link to="/">
                <Button size="lg" className="gap-2 text-base px-8">
                  Conhecer o CyberShield
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Footer links */}
          <div className="mt-12 flex flex-wrap justify-center gap-4 text-sm">
            <Link to="/privacy" className="text-muted-foreground hover:text-primary transition-colors">
              Política de Privacidade
            </Link>
            <span className="text-border/40">•</span>
            <Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors">
              Termos de Serviço
            </Link>
          </div>

          <p className="text-center text-xs text-muted-foreground/60 mt-8">
            © {new Date().getFullYear()} CyberShield — Todos os direitos reservados.
          </p>
        </main>
      </div>
    </>
  );
}
