import { useState, useMemo } from "react";

import { Navbar } from "@/components/Navbar";
import { SEOHead } from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Search, BookOpen, Shield, Monitor, Users, Settings, FileText, Zap, HelpCircle, PlayCircle, ChevronRight, Clock, Star } from "lucide-react";
import { motion } from "framer-motion";

interface Tutorial {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedTime: string;
  steps: { title: string; content: string }[];
  tags: string[];
}

interface FAQ {
  question: string;
  answer: string;
  category: string;
}

const tutorials: Tutorial[] = [
  {
    id: "getting-started",
    title: "Primeiros Passos com o CyberShield",
    description: "Aprenda a configurar sua conta, instalar o agente e começar a proteger seus dispositivos em minutos.",
    category: "inicio",
    difficulty: "beginner",
    estimatedTime: "10 min",
    tags: ["onboarding", "instalação", "setup"],
    steps: [
      { title: "Criar sua conta", content: "Acesse a página de cadastro e preencha os dados da sua empresa. Você receberá um e-mail de verificação para confirmar sua conta." },
      { title: "Configurar o Tenant", content: "Após o login, configure o nome da empresa, fuso horário e preferências de notificação no painel de configurações." },
      { title: "Instalar o agente", content: "Acesse o menu 'Instalador' no painel lateral. Baixe o instalador Windows (.exe) e execute como Administrador nos endpoints que deseja proteger." },
      { title: "Verificar conexão", content: "Após a instalação, volte ao dashboard e verifique se o agente aparece como 'Online' na lista de agentes. A primeira sincronização pode levar até 5 minutos." },
    ],
  },
  {
    id: "dashboard-overview",
    title: "Navegando pelo Dashboard",
    description: "Entenda todos os KPIs, gráficos e métricas disponíveis no dashboard principal do CyberShield.",
    category: "dashboard",
    difficulty: "beginner",
    estimatedTime: "8 min",
    tags: ["dashboard", "métricas", "KPIs"],
    steps: [
      { title: "Visão geral dos KPIs", content: "O dashboard exibe 4 cards principais: Total de Agentes, Taxa de Sucesso, Ameaças Detectadas e Jobs Ativos. Cada card mostra a variação das últimas 24h." },
      { title: "Gráficos de tendência", content: "Os gráficos mostram a evolução temporal das instalações, detecções de vírus e tipos de ameaça. Use os filtros para ajustar o período de análise." },
      { title: "Timeline de segurança", content: "A timeline humanizada mostra eventos recentes em ordem cronológica com ícones de severidade coloridos." },
      { title: "Customizar o layout", content: "Clique no ícone de cadeado para desbloquear o modo de edição. Arraste e redimensione os widgets conforme sua preferência. O layout é salvo automaticamente." },
    ],
  },
  {
    id: "agent-management",
    title: "Gerenciamento de Agentes",
    description: "Aprenda a instalar, monitorar, agrupar e gerenciar os agentes de segurança nos endpoints da sua rede.",
    category: "agentes",
    difficulty: "intermediate",
    estimatedTime: "15 min",
    tags: ["agentes", "instalação", "monitoramento", "grupos"],
    steps: [
      { title: "Listar agentes", content: "Na aba 'Agentes' do dashboard, visualize todos os endpoints com status em tempo real (online/offline), versão do agente e último heartbeat." },
      { title: "Criar grupos de agentes", content: "Agrupe agentes por departamento, localização ou função. Vá em 'Gerenciamento de Agentes' → 'Grupos' e crie categorias para facilitar a gestão." },
      { title: "Aplicar políticas de segurança", content: "Associe políticas de segurança a grupos específicos. Políticas definem quais scans executar, horários de execução e ações automáticas." },
      { title: "Monitoramento avançado", content: "Na página de monitoramento avançado, acompanhe métricas de disco, certificados SSL, integridade de arquivos e baseline comportamental de cada agente." },
    ],
  },
  {
    id: "virus-scans",
    title: "Scans de Vírus e Quarentena",
    description: "Configure e execute scans de vírus, gerencie detecções e administre a quarentena de ameaças.",
    category: "seguranca",
    difficulty: "intermediate",
    estimatedTime: "12 min",
    tags: ["vírus", "scan", "quarentena", "ameaças"],
    steps: [
      { title: "Executar scan manual", content: "Na página 'Virus Scans', selecione os agentes-alvo e inicie um scan completo ou rápido. O progresso é exibido em tempo real." },
      { title: "Configurar scans agendados", content: "Use o 'Criador de Jobs' para agendar scans recorrentes. Defina frequência (diário, semanal), horário e escopo do scan." },
      { title: "Gerenciar quarentena", content: "Ameaças detectadas são automaticamente isoladas na quarentena. Revise cada item e decida entre remover permanentemente ou restaurar (falso positivo)." },
      { title: "Análise de ameaças", content: "Cada detecção inclui detalhes como hash do arquivo, tipo de malware, severidade e caminho do arquivo. Use essas informações para avaliar o impacto." },
    ],
  },
  {
    id: "jobs-automation",
    title: "Jobs e Automação de Tarefas",
    description: "Crie, agende e monitore jobs de segurança automatizados em toda sua infraestrutura.",
    category: "automacao",
    difficulty: "intermediate",
    estimatedTime: "10 min",
    tags: ["jobs", "automação", "agendamento"],
    steps: [
      { title: "Criar um job", content: "No 'Criador de Jobs', selecione o tipo de tarefa (scan, coleta de dados, verificação de integridade), os agentes-alvo e o cronograma." },
      { title: "Monitorar execução", content: "A aba 'Jobs' no dashboard mostra o status de cada job em tempo real: pending, running, completed ou failed." },
      { title: "Configurar auto-remediação", content: "Para jobs de scan, configure ações automáticas: quarentena imediata, notificação ao admin ou apenas log do evento." },
      { title: "Exportar resultados", content: "Exporte os resultados de jobs via CSV usando o botão de exportação disponível em cada tab do dashboard." },
    ],
  },
  {
    id: "admin-panel",
    title: "Painel Administrativo",
    description: "Domine o painel admin: gerenciamento de membros, planos, integrações e configurações avançadas.",
    category: "admin",
    difficulty: "advanced",
    estimatedTime: "20 min",
    tags: ["admin", "configurações", "membros", "planos"],
    steps: [
      { title: "Action Center", content: "O Action Center é seu ponto central de operações. Visualize alertas pendentes, ações sugeridas pela IA e aprovações necessárias." },
      { title: "Gerenciar membros", content: "Adicione ou remova membros da equipe, defina roles (admin, operador, viewer) e configure permissões granulares por funcionalidade." },
      { title: "Configurar integrações", content: "Conecte o CyberShield com ferramentas externas: SIEM, ITSM, canais de notificação (email, Slack) e sistemas de ticketing." },
      { title: "Relatórios e compliance", content: "Gere relatórios executivos em PDF, exporte dados para auditoria e acompanhe métricas de compliance LGPD em tempo real." },
    ],
  },
  {
    id: "security-policies",
    title: "Políticas de Segurança",
    description: "Crie e aplique políticas de segurança personalizadas para proteger sua infraestrutura de forma proativa.",
    category: "seguranca",
    difficulty: "advanced",
    estimatedTime: "15 min",
    tags: ["políticas", "segurança", "compliance", "LGPD"],
    steps: [
      { title: "Criar uma política", content: "Defina regras de segurança como: frequência mínima de scans, requisitos de senha, bloqueio de USB, controle de aplicações e whitelist de IPs." },
      { title: "Aplicar a grupos", content: "Associe políticas a grupos de agentes. Diferentes departamentos podem ter políticas distintas (ex: financeiro mais restritivo)." },
      { title: "Monitorar compliance", content: "O dashboard de compliance mostra a taxa de conformidade de cada política, agentes em violação e ações pendentes." },
      { title: "Enforcement automático", content: "Configure ações automáticas para quando uma política é violada: alerta, quarentena do agente ou bloqueio de funcionalidades." },
    ],
  },
  {
    id: "reports-export",
    title: "Relatórios e Exportação de Dados",
    description: "Gere relatórios executivos, exporte dados em CSV/PDF e automatize entregas de relatórios.",
    category: "relatorios",
    difficulty: "intermediate",
    estimatedTime: "8 min",
    tags: ["relatórios", "PDF", "CSV", "exportação"],
    steps: [
      { title: "Relatório executivo PDF", content: "No dashboard, clique em 'Gerar Relatório PDF' para criar um relatório executivo com KPIs, gráficos de tendência e recomendações automáticas." },
      { title: "Exportar dados CSV", content: "Cada tab do dashboard (agentes, jobs, relatórios) possui um botão de exportação CSV para análise detalhada em planilhas." },
      { title: "Relatórios de compliance", content: "Gere relatórios específicos de compliance LGPD com evidências coletadas, status de conformidade e plano de ação." },
      { title: "Laudos verificáveis", content: "Cada relatório gera um laudo com hash criptográfico verificável publicamente através do link /verificar-laudo." },
    ],
  },
  {
    id: "threat-intelligence",
    title: "Inteligência de Ameaças e IA",
    description: "Utilize recursos de IA para detectar ameaças, obter insights e automatizar respostas a incidentes.",
    category: "seguranca",
    difficulty: "advanced",
    estimatedTime: "12 min",
    tags: ["IA", "ameaças", "inteligência", "automação"],
    steps: [
      { title: "AI Insights", content: "A IA analisa continuamente seus dados de segurança e gera insights acionáveis: padrões suspeitos, anomalias comportamentais e previsões de risco." },
      { title: "Detecção de Shadow IT", content: "O módulo de Shadow IT descobre automaticamente aplicações e serviços não autorizados na sua rede." },
      { title: "Simulação de ataques", content: "Execute simulações controladas de ataque (Red Team) para testar a postura de segurança e resiliência dos seus endpoints." },
      { title: "Resposta a ransomware", content: "O módulo de resposta a ransomware oferece playbooks automatizados para isolar, conter e remediar incidentes de ransomware." },
    ],
  },
  {
    id: "multi-tenant",
    title: "Gestão Multi-Tenant (Super Admin)",
    description: "Gerencie múltiplas empresas de um único painel com visão consolidada e configurações independentes.",
    category: "admin",
    difficulty: "advanced",
    estimatedTime: "15 min",
    tags: ["multi-tenant", "super admin", "empresas"],
    steps: [
      { title: "Visão geral multi-tenant", content: "O painel super admin exibe métricas consolidadas de todos os tenants: total de agentes, ameaças globais e saúde do sistema." },
      { title: "Criar novo tenant", content: "Adicione uma nova empresa ao sistema definindo nome, plano, limites de agentes e administradores responsáveis." },
      { title: "Configurações por tenant", content: "Cada tenant possui configurações independentes: políticas, integrações, membros e preferências. Alterações não afetam outros tenants." },
      { title: "Benchmark entre tenants", content: "Compare métricas de segurança entre tenants para identificar melhores práticas e áreas que precisam de atenção." },
    ],
  },
];

const faqs: FAQ[] = [
  { question: "O CyberShield funciona em quais sistemas operacionais?", answer: "O agente CyberShield é compatível com Windows 10/11 e Windows Server 2016+. O painel de gerenciamento é acessível via qualquer navegador moderno (Chrome, Firefox, Edge, Safari).", category: "geral" },
  { question: "Quantos agentes posso instalar?", answer: "O número de agentes depende do seu plano. O plano Starter permite até 25 agentes, Professional até 100, e Enterprise é ilimitado. Você pode verificar e atualizar seu plano em Admin → Planos.", category: "planos" },
  { question: "Como funciona a detecção de ameaças?", answer: "O CyberShield utiliza múltiplas camadas de detecção: análise de assinaturas, heurística comportamental, IA de detecção de anomalias e threat intelligence em tempo real. Ameaças detectadas são automaticamente isoladas na quarentena.", category: "seguranca" },
  { question: "Os dados são criptografados?", answer: "Sim. Todos os dados em trânsito usam TLS 1.3 e dados em repouso são criptografados com AES-256. As chaves HMAC dos agentes são armazenadas em vault seguro e nunca expostas.", category: "seguranca" },
  { question: "Como exportar relatórios para auditoria?", answer: "Acesse o dashboard e use os botões de exportação CSV em cada tab, ou gere relatórios executivos em PDF com KPIs, gráficos e recomendações. Relatórios incluem hash criptográfico para verificação de integridade.", category: "relatorios" },
  { question: "O sistema é compatível com LGPD?", answer: "Sim. O CyberShield oferece módulos específicos de compliance LGPD: mapeamento de dados pessoais, relatórios de impacto (RIPD), evidências de conformidade e controles de acesso baseados em roles.", category: "compliance" },
  { question: "Como funciona o suporte?", answer: "Oferecemos suporte em português via WhatsApp, e-mail e dentro do próprio sistema. Planos Professional e Enterprise incluem SLA de resposta garantido e suporte 24/7.", category: "suporte" },
  { question: "Posso personalizar o painel com minha marca?", answer: "Sim! O recurso White Label permite customizar logotipo, cores, domínio personalizado e templates de e-mail com a identidade visual da sua empresa.", category: "admin" },
  { question: "O que acontece se um agente ficar offline?", answer: "O sistema detecta automaticamente agentes offline e gera alertas. Você pode configurar o tempo de tolerância e ações automáticas (notificação, escalonamento) em Admin → Configurações.", category: "agentes" },
  { question: "Como funciona o sistema de notificações?", answer: "O CyberShield envia notificações via sino no painel (in-app), push notifications no navegador e e-mail para alertas críticos como malware detectado e jobs falhos.", category: "geral" },
  { question: "Posso integrar com SIEM externo?", answer: "Sim. O módulo SIEM Export permite enviar eventos e alertas para plataformas como Splunk, QRadar e Elastic SIEM via syslog ou API REST.", category: "integracoes" },
  { question: "Como funciona a quarentena?", answer: "Arquivos maliciosos são isolados em uma sandbox segura, impedindo qualquer execução. Administradores podem revisar, remover permanentemente ou restaurar (falso positivo) cada item da quarentena.", category: "seguranca" },
];

const categories = [
  { id: "all", label: "Todos", icon: BookOpen },
  { id: "inicio", label: "Início Rápido", icon: Zap },
  { id: "dashboard", label: "Dashboard", icon: Monitor },
  { id: "agentes", label: "Agentes", icon: Monitor },
  { id: "seguranca", label: "Segurança", icon: Shield },
  { id: "automacao", label: "Automação", icon: Settings },
  { id: "admin", label: "Administração", icon: Users },
  { id: "relatorios", label: "Relatórios", icon: FileText },
];

const difficultyConfig = {
  beginner: { label: "Iniciante", color: "bg-success/10 text-success border-success/20" },
  intermediate: { label: "Intermediário", color: "bg-info/10 text-info border-info/20" },
  advanced: { label: "Avançado", color: "bg-accent/10 text-accent border-accent/20" },
};

const Tutorials = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [expandedTutorial, setExpandedTutorial] = useState<string | null>(null);

  const filteredTutorials = useMemo(() => {
    return tutorials.filter((t) => {
      const matchesCategory = activeCategory === "all" || t.category === activeCategory;
      const matchesSearch =
        !searchQuery ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, activeCategory]);

  const filteredFaqs = useMemo(() => {
    if (!searchQuery) return faqs;
    return faqs.filter(
      (f) =>
        f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.answer.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <>
      <SEOHead
        title="Tutoriais & Base de Conhecimento — CyberShield"
        description="Aprenda a usar todas as funcionalidades do CyberShield: instalação, dashboard, agentes, scans de vírus, políticas de segurança e muito mais."
        keywords="tutoriais cybershield, guia cybershield, base de conhecimento, segurança cibernética"
        canonicalUrl="/tutorials"
      />
      <div className="min-h-screen bg-background">
        <Navbar />

        <main className="pt-24 pb-16">
          {/* Hero */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6 text-center mb-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent mb-6">
                <BookOpen className="h-4 w-4" />
                <span className="text-sm font-medium">Central de Aprendizado</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
                Tutoriais & Base de Conhecimento
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
                Aprenda a dominar todas as funcionalidades do CyberShield com guias passo-a-passo, artigos detalhados e respostas às dúvidas mais comuns.
              </p>

              {/* Search */}
              <div className="relative max-w-xl mx-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar tutoriais, artigos e perguntas..."
                  className="pl-12 h-12 text-base bg-card border-border"
                />
              </div>
            </motion.div>
          </section>

          {/* Tabs: Tutoriais / FAQ */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6">
            <Tabs defaultValue="tutorials" className="w-full">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
                <TabsTrigger value="tutorials" className="gap-2">
                  <PlayCircle className="h-4 w-4" />
                  Tutoriais
                </TabsTrigger>
                <TabsTrigger value="faq" className="gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Perguntas Frequentes
                </TabsTrigger>
              </TabsList>

              {/* Tutorials Tab */}
              <TabsContent value="tutorials">
                {/* Category Filter */}
                <div className="flex flex-wrap gap-2 mb-8 justify-center">
                  {categories.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border
                          ${activeCategory === cat.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
                          }`}
                      >
                        <Icon className="h-4 w-4" />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Tutorial Cards */}
                {filteredTutorials.length === 0 ? (
                  <div className="text-center py-16">
                    <Search className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                    <p className="text-muted-foreground text-lg">Nenhum tutorial encontrado para "{searchQuery}"</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {filteredTutorials.map((tutorial, index) => (
                      <motion.div
                        key={tutorial.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <div
                          className={`bg-card border border-border rounded-xl overflow-hidden transition-all
                            ${expandedTutorial === tutorial.id ? "ring-2 ring-accent/30" : "hover:border-foreground/20"}`}
                        >
                          {/* Header */}
                          <button
                            onClick={() => setExpandedTutorial(expandedTutorial === tutorial.id ? null : tutorial.id)}
                            className="w-full flex items-start gap-4 p-5 text-left"
                          >
                            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mt-0.5">
                              <BookOpen className="h-5 w-5 text-accent" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="text-base font-semibold text-foreground">{tutorial.title}</h3>
                                <Badge variant="outline" className={`text-xs ${difficultyConfig[tutorial.difficulty].color}`}>
                                  {difficultyConfig[tutorial.difficulty].label}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">{tutorial.description}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {tutorial.estimatedTime}
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Star className="h-3 w-3" />
                                  {tutorial.steps.length} etapas
                                </span>
                              </div>
                            </div>
                            <ChevronRight
                              className={`h-5 w-5 text-muted-foreground flex-shrink-0 mt-2 transition-transform ${
                                expandedTutorial === tutorial.id ? "rotate-90" : ""
                              }`}
                            />
                          </button>

                          {/* Expanded Steps */}
                          {expandedTutorial === tutorial.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              transition={{ duration: 0.2 }}
                              className="border-t border-border"
                            >
                              <div className="p-5 space-y-4">
                                {tutorial.steps.map((step, stepIndex) => (
                                  <div key={stepIndex} className="flex gap-4">
                                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                                      {stepIndex + 1}
                                    </div>
                                    <div>
                                      <h4 className="text-sm font-semibold text-foreground mb-1">{step.title}</h4>
                                      <p className="text-sm text-muted-foreground leading-relaxed">{step.content}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* FAQ Tab */}
              <TabsContent value="faq">
                {filteredFaqs.length === 0 ? (
                  <div className="text-center py-16">
                    <HelpCircle className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                    <p className="text-muted-foreground text-lg">Nenhuma pergunta encontrada para "{searchQuery}"</p>
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto">
                    <Accordion type="multiple" className="space-y-3">
                      {filteredFaqs.map((faq, index) => (
                        <AccordionItem
                          key={index}
                          value={`faq-${index}`}
                          className="bg-card border border-border rounded-xl px-5 data-[state=open]:ring-2 data-[state=open]:ring-accent/20"
                        >
                          <AccordionTrigger className="text-left text-sm font-medium text-foreground hover:no-underline py-4">
                            {faq.question}
                          </AccordionTrigger>
                          <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed">
                            {faq.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </section>
        </main>
      </div>
    </>
  );
};

export default Tutorials;
