import { 
  Shield, Building2, Scale, Stethoscope, Laptop, Globe,
  BarChart, FileText, AlertTriangle, CheckCircle, RefreshCw,
  FileCheck, Undo2, Server, ShieldCheck, Lock, Activity
} from "lucide-react";

export const LANDING_CONTENT = {
  // SEO Metadata
  seo: {
    title: "CyberShield - Seguranca Cibernetica Inteligente para PMEs Brasileiras",
    description: "Protecao completa para sua empresa: antivirus, monitoramento 24/7 e compliance LGPD em um so lugar. Empresa 100% brasileira com suporte em portugues. Trial gratuito de 14 dias.",
    keywords: "seguranca cibernetica, antivirus empresarial, PME Brasil, protecao de dados, compliance LGPD",
  },

  hero: {
    badge: "🇧🇷 Empresa 100% Brasileira • Suporte em Portugues",
    title1: "Protecao Cibernetica Inteligente",
    title2: "para PMEs Brasileiras",
    description: "Antivirus, monitoramento 24/7 e compliance LGPD em um so lugar.",
    descriptionBold: " Trial gratuito de 14 dias - sem cartao de credito.",
    ctaButton: "Quero meu diagnostico gratuito",
    reassurance: "Sem cartao de credito • Resultado em ate 48h • Suporte em portugues",
    stats: [
      { value: "ate 48h", label: "Diagnostico gratuito" },
      { value: "24/7", label: "Monitoramento continuo" },
      { value: "100%", label: "Empresa brasileira" }
    ],
    benefits: [
      "Compliance com LGPD automaticamente",
      "Suporte em portugues",
      "Precos em reais, sem taxas internacionais",
      "Certificacoes brasileiras reconhecidas"
    ]
  },

  targetAudience: {
    title: "Feito para empresas que não podem parar",
    subtitle: "Se você precisa de visibilidade, controle e prova de segurança, o CyberShield é para você",
    segments: [
      { icon: Building2, title: "PMEs", description: "10 a 200 computadores" },
      { icon: Scale, title: "Escritórios", description: "Contábeis e advocacias" },
      { icon: Stethoscope, title: "Clínicas", description: "Dados sensíveis (LGPD)" },
      { icon: Laptop, title: "Sem TI Interno", description: "Empresas sem equipe técnica" },
      { icon: Globe, title: "MSPs", description: "TI terceirizada" }
    ]
  },

  painPoints: {
    badge: "Pergunte a si mesmo agora",
    questions: [
      "Quem responde se houver vazamento de dados?",
      "Você conseguiria provar que tomou medidas de segurança?",
      "Você sabe hoje quais máquinas estão vulneráveis?",
      "Quanto tempo sua empresa sobreviveria parada?"
    ],
    conclusion: "Essa é a realidade de quem não tem visibilidade.",
    stats: [
      { emoji: "💸", title: "R$ 50 a 200 mil", description: "Custo médio de ataque para PMEs. Quanto seu caixa aguenta?" },
      { emoji: "⏱️", title: "7 a 27 dias parado", description: "Tempo de recuperação sem backup. Seus clientes esperariam?" },
      { emoji: "📋", title: "Multa de até 2%", description: "Do faturamento anual por vazamento de dados (LGPD)" },
      { emoji: "☠️", title: "60% fecham", description: "Das PMEs brasileiras atacadas não sobrevivem 12 meses" }
    ],
    cta: "Ver riscos reais da minha empresa (grátis)"
  },

  socialProof: {
    stats: [
      { value: "+5.000", label: "Computadores empresariais monitorados" },
      { value: "+100.000", label: "Riscos detectados antes de virar incidente" },
      { value: "99,9%", label: "De disponibilidade" },
      { value: "🇧🇷", label: "Empresa 100% Brasileira" }
    ]
  },

  diagnostic: {
    title: "O que você vai ver no diagnóstico",
    subtitle: "Sem compromisso, sem cartão de crédito",
    items: [
      { title: "Máquinas Vulneráveis", description: "Quais computadores estão expostos" },
      { title: "Softwares Desatualizados", description: "Programas que precisam de update" },
      { title: "Riscos Críticos", description: "O que precisa de ação urgente" },
      { title: "Nível de Exposição", description: "Sua pontuação de risco atual" },
      { title: "Relatório Inicial", description: "PDF completo para você" }
    ]
  },

  benefits: {
    title: "O que o CyberShield entrega",
    subtitle: "Você passa a ter controle, visibilidade e prova — não só software",
    cards: [
      { icon: BarChart, title: "Visibilidade Total", description: "Veja todos os computadores da empresa em um único painel — sem precisar de TI." },
      { icon: FileText, title: "Evidência Auditável", description: "Histórico técnico de tudo que acontece, pronto para auditoria ou incidente." },
      { icon: AlertTriangle, title: "Alertas de Risco Real", description: "Só o que importa: riscos reais com ações claras, sem ruído técnico." },
      { icon: Shield, title: "Controle Centralizado", description: "Gerencie tudo sem depender de equipe de TI interna." }
    ]
  },

  technology: {
    badge: "Tecnologia de Nível Empresarial",
    title: "Atualização Segura Sem Downtime",
    subtitle: "Mantenha todos os seus computadores protegidos e atualizados automaticamente, sem interrupções",
    features: [
      { icon: RefreshCw, title: "Zero Interrupção", description: "Updates em background, ativados no próximo boot natural" },
      { icon: FileCheck, title: "Validação SHA256", description: "Integridade verificada criptograficamente antes de aplicar" },
      { icon: Undo2, title: "Rollback Automático", description: "Se algo der errado, versão anterior é preservada" },
      { icon: Server, title: "Escala Empresarial", description: "Funciona com 3 ou 3.000 computadores simultaneamente" }
    ],
    comparison: [
      { feature: "Update sem restart forçado", cybershield: true, competitors: false },
      { feature: "Validação criptográfica", cybershield: true, competitors: false },
      { feature: "Rollback automático", cybershield: true, competitors: false },
      { feature: "Anti-corrupção de dados", cybershield: true, competitors: false }
    ]
  },

  useCases: {
    title: "Casos de Uso Específicos",
    subtitle: "Soluções para diferentes setores e necessidades empresariais",
    cases: [
      { icon: Laptop, title: "TI Corporativa", description: "Monitoramento e resposta para redes empresariais complexas." },
      { icon: Building2, title: "Pequenas e Médias Empresas", description: "Soluções acessíveis para proteger seus ativos digitais." },
      { icon: ShieldCheck, title: "Compliance e Segurança", description: "Atenda requisitos regulatórios com relatórios detalhados." }
    ]
  },

  howItWorks: {
    title: "Como Funciona",
    subtitle: "Comece em minutos, sem complicação",
    steps: [
      { number: 1, title: "Instalamos o agente", description: "Instalação rápida em até 3 computadores para iniciar o diagnóstico." },
      { number: 2, title: "Encontramos riscos invisíveis", description: "Softwares desatualizados, vulnerabilidades e comportamentos suspeitos." },
      { number: 3, title: "Você recebe um laudo claro", description: "O que corrigir, o que priorizar — ou deixar a CyberShield monitorando." }
    ]
  },

  features: {
    title: "Recursos Completos para Sua Empresa",
    subtitle: "Monitoramento avançado com interface simples",
    items: [
      { icon: Shield, title: "Detecção de Ameaças", description: "Integração com VirusTotal e Hybrid Analysis para detecção de ameaças em tempo real." },
      { icon: Lock, title: "Quarentena Automática", description: "Arquivos maliciosos são automaticamente isolados para proteger sua rede." },
      { icon: BarChart, title: "Relatórios de Compliance", description: "Exportação de dados e relatórios customizados para compliance e auditoria." },
      { icon: Activity, title: "API Completa", description: "Integre com seus sistemas existentes através de nossa API RESTful." }
    ],
    dashboard: {
      stats: [
        { label: "Dispositivos Ativos", value: "248" },
        { label: "Ameaças Bloqueadas Hoje", value: "17" },
        { label: "Scans Realizados", value: "1.2k" }
      ],
      status: { label: "Status Geral", value: "✓ Protegido" }
    }
  },

  pricing: {
    badge: "🎉 Iniciar teste grátis – 14 dias (cartão requerido)",
    title: "Proteção completa sem equipe de TI",
    subtitle: "Inventário, antivírus, vulnerabilidades, web, desempenho — tudo em um painel. Agente leve que não deixa o computador lento.",
    plans: [
      {
        id: "starter",
        name: "Starter Compliance",
        price: 499,
        period: "/mês",
        baseDevices: 10,
        maxDevices: 50,
        pricePerExtra: 39,
        description: "Compliance básico para PMEs em crescimento",
        features: [
          "Monitoramento em tempo real",
          "Inventário de software completo",
          "Status de antivírus",
          "Detecção de vulnerabilidades",
          "Dashboard centralizado",
          "Suporte por email"
        ],
        cta: "Começar diagnóstico gratuito",
        highlighted: false
      },
      {
        id: "business",
        name: "Business",
        price: 899,
        period: "/mês",
        baseDevices: 20,
        maxDevices: 200,
        pricePerExtra: 24,
        description: "Para empresas que não podem parar nem errar",
        features: [
          "Tudo do Starter, mais:",
          "Scans avançados ilimitados",
          "Relatórios customizados",
          "Analytics avançado de riscos",
          "Evidências e histórico estendido",
          "Suporte prioritário"
        ],
        cta: "Começar diagnóstico gratuito",
        highlighted: true,
        badge: "RECOMENDADO"
      },
      {
        id: "enterprise",
        name: "Enterprise / MSP",
        price: 2000,
        priceLabel: "A partir de",
        description: "Para empresas +200 dispositivos ou MSPs",
        features: [
          "Tudo do Business, mais:",
          "Suporte dedicado 24/7",
          "SLA formal garantido",
          "Onboarding dedicado",
          "Multi-tenant para MSPs",
          "Descontos por volume (até 35%)"
        ],
        cta: "Falar com especialista",
        highlighted: false,
        isEnterprise: true
      }
    ]
  },

  testimonials: {
    title: "O Que Nossos Clientes Falam",
    subtitle: "Resultados reais de empresas como a sua",
    items: [
      {
        quote: "Achávamos que estava tudo certo. Em dois dias surgiram problemas que nunca tinham sido detectados. Não foi confortável de ver, mas evitamos algo muito pior.",
        name: "Roberto Costa",
        role: "Diretor de TI • Indústria",
        devices: "65 computadores monitorados",
        initials: "RC"
      },
      {
        quote: "Instalamos pensando só em antivírus. Descobrimos que 3 máquinas de produção estavam expostas sem ninguém saber. Resolvemos antes de virar incidente.",
        name: "Ana Silva",
        role: "Gerente de Segurança • Varejo",
        devices: "120 computadores protegidos",
        initials: "AS"
      },
      {
        quote: "O suporte é rápido e direto — sem enrolação técnica. Quando tive uma dúvida sobre LGPD, já me mandaram um relatório pronto.",
        name: "Marcos Ferreira",
        role: "CEO • Startup SaaS",
        devices: "28 computadores protegidos",
        initials: "MF"
      }
    ]
  },

  faq: {
    title: "Perguntas Frequentes",
    subtitle: "Tire suas dúvidas antes de começar",
    items: [
      { question: "Preciso instalar em todos os computadores?", answer: "Não. O diagnóstico inicial funciona com poucos dispositivos para mapear riscos reais." },
      { question: "Funciona sem equipe de TI?", answer: "Sim. O laudo já vem com prioridades claras e ações recomendadas." },
      { question: "Funciona com Mac e Linux?", answer: "Sim! O CyberShield funciona em Windows, Mac e Linux. Você pode proteger todos os dispositivos da sua empresa, independente do sistema operacional." },
      { question: "E se eu não gostar? Posso cancelar?", answer: "Claro! Você tem 14 dias para testar gratuitamente, sem compromisso. Se não gostar, basta cancelar - não cobramos nada. Sem perguntas, sem burocracia." },
      { question: "Meus dados ficam seguros com vocês?", answer: "Sim. Dados criptografados e acesso controlado." },
      { question: "Vocês são empresa brasileira? Têm CNPJ?", answer: "Sim! Somos uma empresa 100% brasileira, com CNPJ, nota fiscal e suporte totalmente em português. Você pode confiar que terá suporte local e atendimento humano." },
      { question: "Como funciona o período de teste?", answer: "Você tem 14 dias com acesso completo a todos os recursos. Não pedimos cartão de crédito para começar. Se gostar, escolhe um plano. Se não gostar, é só não fazer nada - cancela automaticamente." },
      { question: "Vocês emitem nota fiscal?", answer: "Sim, emitimos nota fiscal para todas as assinaturas. Você pode usar para prestação de contas e compliance da sua empresa." },
      { question: "Ajuda com LGPD?", answer: "Sim! Nossos relatórios ajudam a demonstrar que sua empresa toma medidas de segurança, o que é exigido pela LGPD. Fornecemos documentação e logs de auditoria." }
    ]
  },

  calculator: {
    title: "Qual Plano é Ideal Para Você?",
    label: "Quantos dispositivos sua empresa possui?"
  },

  ctaFinal: {
    title: "Veja como está a segurança da sua empresa",
    cta: "Fazer diagnóstico gratuito",
    subtitle: "Sem cartão de crédito • Resultado em até 48h"
  },

  contact: {
    title: "Fale Conosco"
  }
};

export type LandingContent = typeof LANDING_CONTENT;
