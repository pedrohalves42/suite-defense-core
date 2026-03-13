import { useState, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { SEOHead } from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Search, BookOpen, Shield, Monitor, Users, Settings, FileText,
  Zap, HelpCircle, PlayCircle, ChevronRight, Clock, Star,
  AlertTriangle, Info, CheckCircle2, Terminal, Download,
  Lock, Eye, BarChart3, Bell, Globe, Server, Cpu,
  Database, Key, Wifi, RefreshCw, ArrowRight, Lightbulb
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───────────────────────────────────────────────
interface TutorialStep {
  title: string;
  content: string;
  tip?: string;
  warning?: string;
  code?: string;
}

interface Tutorial {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedTime: string;
  steps: TutorialStep[];
  tags: string[];
  prerequisites?: string[];
  videoPlaceholder?: boolean;
}

interface FAQ {
  question: string;
  answer: string;
  category: string;
}

// ─── Tutorial Data (expanded & detailed) ─────────────────
const tutorials: Tutorial[] = [
  {
    id: "getting-started",
    title: "Primeiros Passos com o CyberShield",
    description: "Guia completo para configurar sua conta, instalar o primeiro agente e começar a proteger seus dispositivos em poucos minutos.",
    category: "inicio",
    difficulty: "beginner",
    estimatedTime: "15 min",
    tags: ["onboarding", "instalação", "setup", "primeiro acesso"],
    videoPlaceholder: true,
    steps: [
      {
        title: "Criar sua conta",
        content: "Acesse a página de cadastro e preencha os dados da sua empresa: nome, CNPJ, e-mail corporativo e senha segura. Você receberá um e-mail de verificação — clique no link para ativar sua conta. O link expira em 24 horas.",
        tip: "Use um e-mail corporativo (não Gmail/Hotmail) para facilitar o gerenciamento futuro de múltiplos usuários da mesma empresa.",
      },
      {
        title: "Fazer login e explorar o dashboard",
        content: "Após verificar seu e-mail, faça login com suas credenciais. Você será redirecionado ao dashboard principal. Reserve um momento para familiarizar-se com o menu lateral (navegação), a barra superior (notificações e perfil) e os cards de KPI centrais.",
        tip: "Ative a autenticação de dois fatores (MFA) imediatamente em Perfil → Segurança para proteger sua conta administrativa.",
      },
      {
        title: "Configurar o Tenant (empresa)",
        content: "Acesse Admin → Configurações e defina: nome da empresa (exibido em relatórios), fuso horário (afeta agendamentos de jobs), logotipo (para white-label) e preferências de notificação (quais alertas receber por e-mail).",
        warning: "O fuso horário configurado aqui afeta todos os agendamentos de scans e jobs. Certifique-se de selecionar o fuso correto antes de criar jobs agendados.",
      },
      {
        title: "Baixar e instalar o agente",
        content: "Vá em 'Instalador de Agentes' no menu lateral. Selecione o sistema operacional (Windows ou Linux), clique em 'Gerar Instalador' e baixe o arquivo. No endpoint-alvo, execute o instalador como Administrador (Windows) ou com sudo (Linux). O agente se registrará automaticamente no seu tenant.",
        code: "# Linux (exemplo)\nsudo chmod +x cybershield-agent.sh\nsudo ./cybershield-agent.sh --tenant-id SEU_ID",
        tip: "Para instalação em massa (100+ endpoints), use o GPO no Windows ou scripts Ansible/Puppet no Linux. Consulte o tutorial 'Instalação em Massa'.",
      },
      {
        title: "Verificar status do agente",
        content: "Volte ao dashboard e aguarde até 5 minutos. O novo agente aparecerá na lista com status 'Online' (ícone verde). Clique no nome do agente para ver detalhes: versão do agente, sistema operacional, IP, último heartbeat e métricas de hardware.",
        tip: "Se o agente não aparecer após 10 minutos, verifique se a porta 443 (HTTPS) está liberada no firewall do endpoint.",
      },
      {
        title: "Executar seu primeiro scan",
        content: "Com o agente online, vá em 'Virus Scans' e clique em 'Novo Scan'. Selecione o agente, escolha 'Scan Rápido' (mais veloz) ou 'Scan Completo' (mais abrangente) e clique em 'Iniciar'. Acompanhe o progresso em tempo real na mesma página.",
      },
    ],
  },
  {
    id: "dashboard-overview",
    title: "Navegando pelo Dashboard Completo",
    description: "Domine todos os KPIs, gráficos interativos, timeline de segurança e widgets customizáveis do dashboard principal.",
    category: "dashboard",
    difficulty: "beginner",
    estimatedTime: "12 min",
    tags: ["dashboard", "métricas", "KPIs", "gráficos", "widgets"],
    videoPlaceholder: true,
    steps: [
      {
        title: "Cards de KPI principais",
        content: "O topo do dashboard exibe 4 cards: Total de Agentes (com % online/offline), Taxa de Sucesso de Jobs (últimas 24h), Ameaças Detectadas (com severidade) e Jobs Ativos (em execução agora). Cada card mostra a variação em relação ao período anterior com seta indicadora.",
        tip: "Clique em qualquer card de KPI para ir diretamente à página detalhada daquele indicador.",
      },
      {
        title: "Gráficos de tendência temporal",
        content: "Os gráficos de linha mostram evolução de: instalações de agentes, detecções de malware por tipo e volume de jobs executados. Use o seletor de período (7d, 30d, 90d) para ajustar a janela temporal. Passe o mouse sobre os pontos para ver valores exatos.",
      },
      {
        title: "Timeline humanizada de eventos",
        content: "A timeline lateral mostra os últimos eventos em linguagem natural: 'Agente DESKTOP-001 detectou 2 ameaças há 15 min', 'Job de scan completo finalizado com sucesso'. Eventos críticos aparecem com borda vermelha e ícone de alerta.",
      },
      {
        title: "Tabs especializadas",
        content: "Abaixo dos gráficos, encontre tabs para: Agentes (lista completa com filtros), Jobs (histórico e status), Relatórios (PDFs gerados), Evidências (logs de auditoria) e Segurança (ameaças ativas). Cada tab possui seus próprios filtros e opções de exportação.",
      },
      {
        title: "Customizar layout com drag-and-drop",
        content: "Clique no ícone de cadeado (canto superior direito) para entrar no modo de edição. Arraste widgets para reorganizar, redimensione puxando as bordas e remova/adicione widgets conforme sua necessidade. O layout personalizado é salvo automaticamente no seu perfil.",
        tip: "Cada usuário pode ter seu próprio layout personalizado — as mudanças não afetam outros membros da equipe.",
      },
      {
        title: "Filtros compartilháveis via URL",
        content: "Todos os filtros aplicados (tab, busca, status, período) são sincronizados com a URL do navegador. Copie a URL para compartilhar uma visão filtrada específica com colegas, sem que eles precisem reaplicar os mesmos filtros.",
        tip: "Use isso para criar bookmarks de visões frequentes: ex. 'Dashboard → Ameaças Críticas dos últimos 7 dias'.",
      },
    ],
  },
  {
    id: "agent-installation-mass",
    title: "Instalação em Massa de Agentes",
    description: "Aprenda a distribuir o agente CyberShield para centenas de endpoints simultaneamente usando GPO, scripts e ferramentas de automação.",
    category: "agentes",
    difficulty: "advanced",
    estimatedTime: "20 min",
    tags: ["agentes", "instalação em massa", "GPO", "Ansible", "deploy"],
    prerequisites: ["getting-started"],
    steps: [
      {
        title: "Gerar instalador com Enrollment Key",
        content: "Em 'Instalador de Agentes', clique em 'Gerar Nova Chave de Enrollment'. Essa chave vincula automaticamente os agentes instalados ao seu tenant. Defina um nome descritivo (ex: 'Deploy TI - Mar/2026') e opcionalmente um limite de usos.",
        warning: "Chaves de enrollment são sensíveis — não as compartilhe por canais inseguros. Use cofre de senhas ou variáveis de ambiente.",
      },
      {
        title: "Deploy via GPO (Windows)",
        content: "No Active Directory, crie uma nova GPO de Software: Computer Configuration → Policies → Software Settings → Software Installation. Aponte para o MSI do CyberShield no compartilhamento de rede. Defina parâmetros: ENROLLMENT_KEY=sua_chave, TENANT_ID=seu_id.",
        code: "msiexec /i \\\\servidor\\share\\cybershield-agent.msi /qn ENROLLMENT_KEY=ek_abc123 TENANT_ID=***REMOVED***",
        tip: "Teste o deploy em uma OU pequena (5-10 máquinas) antes de aplicar em toda a organização.",
      },
      {
        title: "Deploy via script PowerShell",
        content: "Para ambientes sem GPO ou para deploy mais controlado, use o script PowerShell fornecido. Ele baixa o instalador, verifica o hash SHA-256, instala silenciosamente e reporta sucesso/falha.",
        code: "# PowerShell (executar como Admin)\n$EnrollKey = 'ek_abc123'\nInvoke-WebRequest -Uri 'https://api.cybershield.com/installer/latest' -OutFile agent.msi\nStart-Process msiexec -ArgumentList \"/i agent.msi /qn ENROLLMENT_KEY=$EnrollKey\" -Wait",
      },
      {
        title: "Deploy via Ansible (Linux)",
        content: "Para servidores Linux, use o playbook Ansible fornecido na documentação. Ele suporta Ubuntu 20.04+, CentOS 7+ e Amazon Linux 2. O playbook instala dependências, copia o agente e configura o serviço systemd.",
        code: "# ansible-playbook\n- hosts: servidores_linux\n  become: yes\n  roles:\n    - cybershield-agent\n  vars:\n    enrollment_key: 'ek_abc123'",
      },
      {
        title: "Monitorar progresso do deploy",
        content: "No dashboard, acompanhe o progresso em tempo real: agentes aparecendo online, erros de enrollment e status de verificação. Use o filtro 'Recém-instalados (últimas 24h)' para focar nos novos agentes.",
      },
      {
        title: "Validar integridade do deploy",
        content: "Após o deploy, execute um Job de 'Verificação de Integridade' em todos os novos agentes. Isso confirma que o agente está funcional, comunicando corretamente e com a versão esperada. Agentes com problemas serão sinalizados automaticamente.",
      },
    ],
  },
  {
    id: "agent-management",
    title: "Gerenciamento Avançado de Agentes",
    description: "Domine a gestão completa de agentes: monitoramento em tempo real, grupos, políticas, arquivamento e troubleshooting.",
    category: "agentes",
    difficulty: "intermediate",
    estimatedTime: "18 min",
    tags: ["agentes", "monitoramento", "grupos", "políticas", "troubleshooting"],
    steps: [
      {
        title: "Visão geral da lista de agentes",
        content: "Na página 'Agentes', visualize todos os endpoints em uma tabela paginada com colunas: Nome, IP, SO, Versão do Agente, Status (online/offline), Último Heartbeat e Grupo. Use os filtros no topo para buscar por nome, filtrar por status ou grupo.",
      },
      {
        title: "Detalhes de um agente específico",
        content: "Clique em qualquer agente para abrir o painel de detalhes: informações de hardware (CPU, RAM, disco), certificados SSL instalados, processos em execução, portas abertas, status do Windows Defender e histórico de scans executados.",
        tip: "O gráfico de métricas de disco mostra tendência de uso — configure alertas para quando o disco atingir 85% para evitar problemas.",
      },
      {
        title: "Criar e gerenciar grupos",
        content: "Agrupe agentes por critério lógico: departamento (TI, Financeiro, RH), localização (Sede, Filial SP) ou função (Servidores, Estações). Vá em Gerenciamento → Grupos, clique em 'Novo Grupo', defina nome e descrição, depois arraste agentes para o grupo.",
        tip: "Grupos facilitam a aplicação de políticas de segurança diferentes por área. Ex: servidores com scan diário, estações com scan semanal.",
      },
      {
        title: "Monitoramento de saúde contínuo",
        content: "A página 'Monitoramento Avançado' exibe métricas em tempo real: uso de CPU/RAM/disco, certificados expirando, integridade de arquivos críticos do sistema e baseline comportamental. Anomalias são automaticamente sinalizadas com alertas.",
        warning: "Agentes offline por mais de 24h são automaticamente marcados como 'críticos'. Configure o tempo de tolerância em Admin → Configurações.",
      },
      {
        title: "Arquivar agentes inativos",
        content: "Agentes de máquinas desativadas podem ser arquivados (não deletados). O histórico de scans e detecções é preservado para auditoria. Vá no agente → Ações → Arquivar. Agentes arquivados não contam no limite do plano.",
      },
      {
        title: "Troubleshooting de conexão",
        content: "Se um agente aparece offline: 1) Verifique se o serviço 'CyberShield Agent' está rodando no endpoint (services.msc no Windows). 2) Teste conectividade com ping/telnet à porta 443 do servidor. 3) Verifique se há proxy ou firewall bloqueando. 4) Consulte os logs locais em C:\\ProgramData\\CyberShield\\logs\\.",
        code: "# Windows: verificar serviço\nGet-Service CyberShieldAgent | Format-List Status, StartType\n\n# Linux: verificar serviço\nsystemctl status cybershield-agent",
      },
    ],
  },
  {
    id: "virus-scans",
    title: "Scans de Vírus Completos",
    description: "Configure, execute e interprete scans de vírus: rápido, completo, customizado. Gerencie quarentena e responda a ameaças.",
    category: "seguranca",
    difficulty: "intermediate",
    estimatedTime: "15 min",
    tags: ["vírus", "scan", "quarentena", "ameaças", "malware"],
    videoPlaceholder: true,
    steps: [
      {
        title: "Tipos de scan disponíveis",
        content: "O CyberShield oferece 3 tipos de scan: Rápido (verifica processos em memória, startup items e locais comuns de malware — ~5 min), Completo (varre todos os arquivos do disco — 30-60 min) e Customizado (você define quais pastas/extensões escanear).",
        tip: "Para primeira verificação de um endpoint, sempre execute um Scan Completo. Depois, scans rápidos diários são suficientes para manutenção.",
      },
      {
        title: "Executar scan manual",
        content: "Em 'Virus Scans', clique em 'Novo Scan'. Selecione um ou mais agentes (use Ctrl+Click para multi-seleção), escolha o tipo de scan e clique em 'Iniciar'. O progresso é exibido em tempo real com barra de percentual e contagem de arquivos analisados.",
      },
      {
        title: "Agendar scans recorrentes",
        content: "Use o 'Criador de Jobs' para automatizar scans. Defina: tipo de scan, agentes-alvo (individual ou por grupo), frequência (diário, semanal, mensal), horário de execução e ação automática para ameaças encontradas (quarentena imediata ou apenas log).",
        tip: "Agende scans completos para horários de baixa utilização (ex: 2h da manhã nos dias úteis) para minimizar impacto na produtividade dos usuários.",
      },
      {
        title: "Interpretar resultados",
        content: "Cada detecção mostra: nome da ameaça (ex: Trojan.GenericKD.12345), severidade (baixa/média/alta/crítica), caminho do arquivo, hash SHA-256, data de detecção e engine que detectou. Use essas informações para avaliar impacto e decidir a ação.",
        warning: "Ameaças de severidade 'crítica' podem indicar comprometimento ativo do sistema. Isole o endpoint da rede imediatamente e investigue.",
      },
      {
        title: "Gerenciar quarentena",
        content: "Arquivos detectados são movidos para uma sandbox isolada onde não podem executar. Na página 'Quarentena', revise cada item: veja detalhes da ameaça, consulte bases de inteligência e decida entre 'Remover Permanentemente' (confirmar que é malware) ou 'Restaurar' (falso positivo).",
        tip: "Antes de restaurar um arquivo da quarentena, submeta o hash SHA-256 em sites como VirusTotal para confirmar que é realmente um falso positivo.",
      },
      {
        title: "Exclusões e whitelist",
        content: "Para evitar falsos positivos recorrentes (ex: software interno legítimo), adicione exclusões: por caminho de arquivo, hash SHA-256 ou nome do processo. Exclusões são aplicadas por tenant e valem para todos os agentes. Acesse via Admin → Políticas → Exclusões de Scan.",
        warning: "Cuidado ao adicionar exclusões amplas (ex: pasta inteira do C:\\). Isso pode criar pontos cegos na proteção.",
      },
    ],
  },
  {
    id: "jobs-automation",
    title: "Jobs e Automação Avançada",
    description: "Crie, agende e monitore jobs complexos: scans, coleta de inventário, verificações de compliance e remediação automática.",
    category: "automacao",
    difficulty: "intermediate",
    estimatedTime: "14 min",
    tags: ["jobs", "automação", "agendamento", "remediação"],
    steps: [
      {
        title: "Entendendo os tipos de job",
        content: "Jobs disponíveis: Scan de Vírus (rápido/completo), Coleta de Inventário (software instalado, hardware), Verificação de Integridade (checksums de arquivos do sistema), Coleta de Certificados (SSL/TLS), Análise de Rede (portas abertas, conexões ativas) e Verificação de Compliance (políticas de senha, atualizações).",
      },
      {
        title: "Criar um job no Criador de Jobs",
        content: "No 'Criador de Jobs': 1) Selecione o tipo de job. 2) Escolha os agentes-alvo (individual, por grupo ou 'todos'). 3) Defina se é execução única ou recorrente. 4) Configure parâmetros específicos (ex: para scan, quais pastas incluir). 5) Defina ação pós-execução (notificar, auto-remediar).",
      },
      {
        title: "Monitorar jobs em tempo real",
        content: "A aba 'Jobs' do dashboard exibe: jobs pendentes (aguardando horário agendado), em execução (com progresso %), concluídos (com resultado success/failed) e falhos (com mensagem de erro). Clique em qualquer job para ver logs detalhados de execução.",
        tip: "Use o filtro 'Falhos' para identificar rapidamente problemas que precisam de atenção.",
      },
      {
        title: "Configurar auto-remediação",
        content: "Para cada tipo de ameaça detectada, configure ações automáticas: Severidade Baixa → apenas log; Média → quarentena + notificação ao operador; Alta → quarentena + notificação ao admin; Crítica → isolamento do endpoint + notificação imediata via WhatsApp/e-mail.",
      },
      {
        title: "Blast Radius adaptativo",
        content: "O sistema possui controle de 'blast radius' que limita quantos agentes podem ser afetados por uma ação automática simultaneamente. Em horário comercial, o limite é menor (evitar impacto); fora do horário, ações mais agressivas são permitidas.",
        tip: "Configure o blast radius em Admin → Políticas → Controle de Impacto. Valores recomendados: 10% em horário comercial, 50% fora.",
      },
      {
        title: "Exportar e auditar resultados",
        content: "Todos os resultados de jobs são exportáveis em CSV ou PDF. Relatórios incluem: timestamp de início/fim, agentes processados, detecções encontradas, ações tomadas e hash criptográfico para verificação de integridade do relatório.",
      },
    ],
  },
  {
    id: "user-management",
    title: "Gerenciamento de Usuários e Permissões",
    description: "Convide membros, defina roles granulares, configure MFA obrigatório e gerencie o ciclo de vida de acessos.",
    category: "admin",
    difficulty: "intermediate",
    estimatedTime: "12 min",
    tags: ["usuários", "permissões", "roles", "MFA", "convites"],
    steps: [
      {
        title: "Roles disponíveis",
        content: "O CyberShield possui 3 roles: Admin (controle total — criar/editar tudo, gerenciar membros, ver dados financeiros), Operador (criar e executar jobs, gerenciar agentes, ver relatórios — sem acesso a configurações sensíveis) e Visualizador (somente leitura — ver dashboard, agentes e relatórios, sem poder executar ações).",
      },
      {
        title: "Convidar novos membros",
        content: "Em Admin → Membros, clique em 'Convidar'. Informe o e-mail, selecione o role e opcionalmente adicione uma mensagem personalizada. O convidado receberá um e-mail com link de ativação que expira em 7 dias.",
        tip: "Para equipes grandes, use a função 'Convite em Lote' para enviar múltiplos convites de uma vez via CSV.",
      },
      {
        title: "Configurar MFA obrigatório",
        content: "Para máxima segurança, force todos os admins a usar MFA: Admin → Configurações → Segurança → 'Exigir MFA para administradores'. Métodos suportados: TOTP (Google Authenticator, Authy) e backup codes.",
        warning: "Ao ativar MFA obrigatório, admins sem MFA configurado serão redirecionados para a tela de setup no próximo login. Comunique sua equipe com antecedência.",
      },
      {
        title: "Gerenciar sessões ativas",
        content: "Em Admin → Segurança → Sessões Ativas, visualize todas as sessões abertas: usuário, IP, dispositivo, última atividade. Termine sessões suspeitas individualmente ou force logout global de todos os usuários.",
      },
      {
        title: "Whitelist de IPs administrativos",
        content: "Restrinja o acesso administrativo a IPs conhecidos: Admin → Segurança → Whitelist de IPs. Adicione os IPs fixos do escritório/VPN. Acessos de IPs não listados serão bloqueados com erro 403.",
        warning: "Cuidado ao ativar whitelist de IPs — certifique-se de incluir seu IP atual para não ficar trancado fora do sistema.",
      },
    ],
  },
  {
    id: "admin-panel",
    title: "Painel Administrativo Completo",
    description: "Domine todas as funcionalidades do painel admin: Action Center, integrações, white-label, planos e configurações avançadas.",
    category: "admin",
    difficulty: "advanced",
    estimatedTime: "25 min",
    tags: ["admin", "action center", "integrações", "white-label", "configurações"],
    prerequisites: ["getting-started", "user-management"],
    videoPlaceholder: true,
    steps: [
      {
        title: "Action Center — Hub de operações",
        content: "O Action Center é seu painel de controle central. Exibe: alertas pendentes (ameaças não resolvidas), aprovações necessárias (jobs aguardando autorização), recomendações da IA (melhorias sugeridas) e métricas de saúde do sistema. Priorize itens por severidade (crítico → alto → médio → baixo).",
      },
      {
        title: "Configurar integrações (SIEM, ITSM)",
        content: "Conecte o CyberShield com seu ecossistema: SIEM (Splunk, QRadar, Elastic — via syslog/API), ITSM (ServiceNow, Jira — tickets automáticos para incidentes), Notificações (Slack, Teams, WhatsApp — alertas em tempo real) e E-mail (SMTP personalizado para relatórios).",
        tip: "Comece integrando apenas notificações por e-mail. Adicione SIEM e ITSM gradualmente conforme a maturidade do SOC.",
      },
      {
        title: "White-Label e branding",
        content: "Personalize a plataforma com sua marca: faça upload do logotipo (recomendado: PNG transparente, 200x60px), defina cores primárias, configure domínio personalizado (ex: security.suaempresa.com) e customize templates de e-mail com seu header/footer.",
      },
      {
        title: "Gerenciar planos e limites",
        content: "Visualize seu plano atual e limites: número de agentes, volume de scans/mês, espaço de armazenamento de evidências e funcionalidades habilitadas. Para upgrade, acesse Admin → Plano → 'Alterar Plano' ou entre em contato com o time comercial.",
      },
      {
        title: "Audit trail completo",
        content: "Toda ação administrativa é registrada: quem fez, o quê, quando e de qual IP. Acesse Admin → Evidências → 'Log de Auditoria'. Filtre por usuário, tipo de ação ou período. Logs são imutáveis e incluem hash para verificação de integridade.",
      },
      {
        title: "Configurações de retenção de dados",
        content: "Defina por quanto tempo dados são mantidos: logs de auditoria (padrão: 365 dias), resultados de scan (90 dias), métricas de agente (30 dias). Dados expirados são automaticamente removidos conforme LGPD. Ajuste em Admin → Configurações → Retenção.",
      },
    ],
  },
  {
    id: "security-policies",
    title: "Políticas de Segurança e Compliance",
    description: "Crie políticas de segurança personalizadas, monitore compliance LGPD e automatize enforcement de regras.",
    category: "seguranca",
    difficulty: "advanced",
    estimatedTime: "18 min",
    tags: ["políticas", "segurança", "compliance", "LGPD", "enforcement"],
    prerequisites: ["agent-management"],
    steps: [
      {
        title: "Tipos de política disponíveis",
        content: "Políticas configuráveis: Frequência de Scan (mínimo de scans por semana), Requisitos de Senha (complexidade, expiração), Controle de USB (bloquear/permitir dispositivos), Whitelist de Aplicações (apenas software autorizado), Configurações de Firewall (regras obrigatórias) e Atualizações (patches obrigatórios).",
      },
      {
        title: "Criar uma nova política",
        content: "Em Admin → Políticas → 'Nova Política': defina nome, descrição, nível de criticidade e as regras específicas. Para cada regra, defina o valor esperado (ex: 'Scan completo mínimo: 1 por semana') e a ação em caso de violação (alerta, bloqueio ou quarentena).",
      },
      {
        title: "Aplicar políticas a grupos de agentes",
        content: "Associe políticas a grupos: arraste a política para o grupo desejado ou use 'Atribuir Grupo' no painel da política. Um grupo pode ter múltiplas políticas (são cumulativas). Em caso de conflito, a regra mais restritiva prevalece.",
        tip: "Crie uma política 'Base' aplicada a todos os grupos e políticas adicionais para grupos específicos (ex: 'Servidores - Alta Segurança').",
      },
      {
        title: "Dashboard de compliance",
        content: "O dashboard de compliance mostra em tempo real: taxa de conformidade geral (%), agentes em violação (com detalhes de qual regra violam), tendência histórica de compliance e score de risco por grupo/departamento.",
      },
      {
        title: "Relatórios LGPD automatizados",
        content: "Gere relatórios de compliance LGPD com: inventário de dados pessoais encontrados, status de criptografia, controles de acesso implementados, evidências de conformidade e recomendações de melhoria. Exportável em PDF para apresentação à DPO/diretoria.",
      },
      {
        title: "Enforcement automático",
        content: "Configure ações automáticas para violações: 1° violação → alerta ao operador; 2° violação → notificação ao admin; 3° violação → quarentena do agente (bloqueio de operações não-essenciais). Todos os enforcement são logados no audit trail.",
        warning: "Quarentena automática de agentes pode impactar operações. Teste extensivamente em grupo piloto antes de ativar em produção.",
      },
    ],
  },
  {
    id: "reports-export",
    title: "Relatórios, Laudos e Exportação",
    description: "Gere relatórios executivos em PDF, exporte dados CSV, crie laudos verificáveis e automatize entregas periódicas.",
    category: "relatorios",
    difficulty: "intermediate",
    estimatedTime: "10 min",
    tags: ["relatórios", "PDF", "CSV", "laudos", "exportação", "auditoria"],
    steps: [
      {
        title: "Relatório Executivo em PDF",
        content: "No dashboard, clique em 'Gerar Relatório PDF'. O relatório inclui: resumo executivo com KPIs, gráficos de tendência (30 dias), top 10 ameaças detectadas, status de compliance, agentes problemáticos e recomendações automáticas geradas por IA. Ideal para apresentações à diretoria.",
      },
      {
        title: "Exportação CSV granular",
        content: "Cada tab do dashboard possui botão 'Exportar CSV': lista de agentes com metadados, histórico de jobs com resultados, detecções de ameaças com detalhes técnicos e logs de auditoria. CSVs são UTF-8 e compatíveis com Excel, Google Sheets e ferramentas de BI.",
      },
      {
        title: "Laudos com hash verificável",
        content: "Cada relatório gera um laudo com hash criptográfico SHA-256 único. Qualquer pessoa pode verificar a autenticidade acessando /verificar-laudo e inserindo o código do laudo. Isso garante que o relatório não foi adulterado — essencial para auditoria e processos legais.",
        tip: "Inclua o link de verificação do laudo ao enviar relatórios para auditores externos ou órgãos reguladores.",
      },
      {
        title: "Relatórios de compliance LGPD",
        content: "Gere relatórios específicos de compliance: Relatório de Impacto à Proteção de Dados (RIPD), inventário de dados pessoais, status de controles de segurança e evidências de conformidade. Disponíveis em Admin → Compliance → 'Gerar Relatório LGPD'.",
      },
      {
        title: "Exportação Excel avançada (ExcelJS)",
        content: "Para análises mais complexas, exporte em formato Excel (.xlsx) com múltiplas abas, gráficos embutidos e formatação profissional. Ideal para equipes que precisam manipular dados extensivamente em planilhas.",
      },
    ],
  },
  {
    id: "threat-intelligence",
    title: "Inteligência de Ameaças e IA",
    description: "Use recursos de IA para detectar anomalias, obter insights preditivos, simular ataques e automatizar resposta a incidentes.",
    category: "seguranca",
    difficulty: "advanced",
    estimatedTime: "20 min",
    tags: ["IA", "ameaças", "inteligência", "automação", "red team", "ransomware"],
    prerequisites: ["virus-scans", "security-policies"],
    videoPlaceholder: true,
    steps: [
      {
        title: "AI Insights e recomendações",
        content: "A IA analisa continuamente seus dados e gera insights acionáveis: padrões suspeitos de comportamento (ex: aumento anômalo de acessos à rede), configurações sub-ótimas de segurança, agentes com comportamento fora do baseline e previsões de risco baseadas em tendências.",
      },
      {
        title: "Baseline comportamental",
        content: "O sistema estabelece automaticamente um baseline comportamental para cada agente: padrões normais de uso de CPU, disco, rede e processos. Desvios significativos geram alertas de anomalia. O baseline é recalculado periodicamente para se adaptar a mudanças legítimas.",
      },
      {
        title: "Detecção de Shadow IT",
        content: "O módulo Shadow IT descobre automaticamente software e serviços não-autorizados: aplicações SaaS usadas sem aprovação, servidores web não-documentados, VPNs pessoais e ferramentas de compartilhamento de arquivos. Cada descoberta é categorizada por risco.",
      },
      {
        title: "Simulação de ataques (Red Team)",
        content: "Execute simulações controladas: phishing simulado, tentativa de escalação de privilégios, varredura de portas e teste de detecção de malware inofensivo. Resultados mostram lacunas na postura de segurança e geram recomendações de melhoria.",
        warning: "Simulações podem gerar alertas nos sistemas de segurança existentes. Comunique a equipe de SOC antes de executar.",
      },
      {
        title: "Resposta automatizada a ransomware",
        content: "O playbook de ransomware automatiza: 1) Detecção de criptografia anômala de arquivos. 2) Isolamento imediato do endpoint da rede. 3) Snapshot de evidências forenses. 4) Notificação imediata ao admin via todos os canais. 5) Verificação de outros endpoints para propagação lateral.",
      },
      {
        title: "Security Graph e relações",
        content: "O Security Graph visualiza relações entre entidades: agentes, usuários, ameaças e incidentes. Identifique rapidamente como um comprometimento pode se propagar, quais agentes compartilham vulnerabilidades e onde concentrar esforços de remediação.",
      },
    ],
  },
  {
    id: "multi-tenant",
    title: "Gestão Multi-Tenant (MSP/MSSP)",
    description: "Gerencie múltiplas empresas clientes de um único painel super admin com isolamento total e benchmarks.",
    category: "admin",
    difficulty: "advanced",
    estimatedTime: "18 min",
    tags: ["multi-tenant", "super admin", "MSP", "MSSP", "benchmark"],
    prerequisites: ["admin-panel"],
    steps: [
      {
        title: "Visão geral do Super Admin",
        content: "O painel super admin é projetado para provedores de serviços gerenciados (MSP/MSSP). Exibe: total de tenants gerenciados, soma de agentes, ameaças globais, saúde agregada do sistema e alertas críticos de qualquer tenant.",
      },
      {
        title: "Criar e configurar tenants",
        content: "Adicione empresas clientes: defina nome, plano contratado, limites de agentes, administradores locais e preferências de branding (white-label por tenant). Cada tenant é totalmente isolado — dados nunca se misturam entre empresas.",
      },
      {
        title: "Dashboard consolidado vs. individual",
        content: "Alterne entre visão consolidada (métricas de todos os tenants) e visão individual (mergulhar nos dados de um tenant específico). Na visão consolidada, identifique rapidamente tenants com problemas: muitas ameaças, agentes offline ou compliance baixo.",
      },
      {
        title: "Benchmark entre tenants",
        content: "Compare métricas entre seus clientes: taxa de detecção, tempo médio de resposta, compliance score e saúde dos agentes. Identifique best practices de tenants com melhores métricas e aplique nos demais.",
      },
      {
        title: "Faturamento e unit economics",
        content: "Acompanhe métricas financeiras: receita por tenant, custo por agente, margem por cliente e projeções de crescimento. Use essas informações para otimizar precificação e identificar contas que precisam de upsell.",
      },
      {
        title: "Suspensão e migração de tenants",
        content: "Suspenda tenants inadimplentes (mantém dados, bloqueia acesso) ou migre tenants entre planos. A suspensão é reversível e todos os dados são preservados por 90 dias após suspensão, conforme política de retenção.",
      },
    ],
  },
  {
    id: "notifications-alerts",
    title: "Notificações e Alertas em Tempo Real",
    description: "Configure alertas personalizados, canais de notificação e escalonamento automático para nunca perder um evento crítico.",
    category: "automacao",
    difficulty: "beginner",
    estimatedTime: "8 min",
    tags: ["notificações", "alertas", "e-mail", "push", "escalation"],
    steps: [
      {
        title: "Canais de notificação",
        content: "O CyberShield suporta 4 canais: In-App (sino no painel — sempre ativo), Push Browser (notificações no navegador), E-mail (para alertas importantes) e Integrações (Slack, Teams, WhatsApp para alertas críticos). Configure cada canal em Admin → Notificações.",
      },
      {
        title: "Regras de alerta personalizadas",
        content: "Crie regras específicas: 'Se ameaça de severidade crítica → notificar Admin + Operador via e-mail e Slack imediatamente', 'Se agente offline > 2h → notificar Operador via in-app', 'Se taxa de falha de jobs > 20% → notificar Admin via e-mail'.",
      },
      {
        title: "Escalonamento automático",
        content: "Configure escalonamento: se um alerta crítico não for reconhecido em 15 minutos, escalona para o próximo nível (Operador → Admin → Super Admin). Isso garante que nenhum evento crítico fique sem resposta.",
        tip: "Defina um rodízio de plantão para que alertas fora do horário comercial cheguem à pessoa certa.",
      },
      {
        title: "Gerenciar ruído de alertas",
        content: "Evite 'alert fatigue' agrupando notificações similares: múltiplas detecções do mesmo tipo são consolidadas em um único alerta com contagem. Configure 'quiet hours' para alertas não-críticos fora do horário comercial.",
      },
    ],
  },
  {
    id: "mfa-security",
    title: "Autenticação Multi-Fator (MFA)",
    description: "Configure MFA para todos os usuários, gerencie backup codes e entenda o fluxo de recuperação de acesso.",
    category: "seguranca",
    difficulty: "beginner",
    estimatedTime: "8 min",
    tags: ["MFA", "2FA", "autenticação", "TOTP", "segurança"],
    steps: [
      {
        title: "Ativar MFA no seu perfil",
        content: "Acesse Perfil → Segurança → 'Ativar Autenticação em Dois Fatores'. Escaneie o QR code com um app autenticador (Google Authenticator, Authy, Microsoft Authenticator) e insira o código de 6 dígitos para confirmar.",
      },
      {
        title: "Salvar backup codes",
        content: "Após ativar MFA, o sistema gera 10 códigos de backup únicos. Salve-os em local seguro (gerenciador de senhas ou impresso em cofre). Cada código pode ser usado uma única vez caso você perca acesso ao app autenticador.",
        warning: "Sem backup codes e sem acesso ao app autenticador, a recuperação de acesso requer contato com o super admin e verificação de identidade.",
      },
      {
        title: "Forçar MFA para todos os admins",
        content: "Como admin, ative a obrigatoriedade em Admin → Configurações → Segurança → 'Exigir MFA para Administradores'. No próximo login, admins sem MFA serão redirecionados para a tela de configuração obrigatória.",
      },
      {
        title: "Reset de MFA de um usuário",
        content: "Se um membro perdeu acesso ao autenticador: Admin → Membros → selecione o usuário → 'Resetar MFA'. O usuário precisará configurar MFA novamente no próximo login. Esta ação é registrada no audit trail.",
      },
    ],
  },
];

// ─── FAQ Data (expanded) ─────────────────────────────────
const faqs: FAQ[] = [
  { question: "O CyberShield funciona em quais sistemas operacionais?", answer: "O agente CyberShield é compatível com Windows 10/11 e Windows Server 2016+. Suporte experimental para Ubuntu 20.04+, CentOS 7+ e Amazon Linux 2. O painel de gerenciamento é acessível via qualquer navegador moderno (Chrome, Firefox, Edge, Safari) em desktop e mobile.", category: "geral" },
  { question: "Quantos agentes posso instalar?", answer: "Depende do seu plano: Starter (até 25 agentes), Professional (até 100), Enterprise (ilimitado). Agentes arquivados não contam no limite. Você pode verificar uso atual e upgrade em Admin → Plano. Para necessidades acima de 500 agentes, entre em contato para pricing personalizado.", category: "planos" },
  { question: "Como funciona a detecção de ameaças?", answer: "Múltiplas camadas: análise de assinaturas (base atualizada diariamente), heurística comportamental (detecta malware desconhecido por padrão de comportamento), IA de detecção de anomalias (baseline por agente) e threat intelligence em tempo real (feeds globais de indicadores de comprometimento). Ameaças são automaticamente isoladas na quarentena.", category: "seguranca" },
  { question: "Os dados são criptografados?", answer: "Sim. Dados em trânsito: TLS 1.3 em todas as comunicações. Dados em repouso: AES-256 no banco de dados. Chaves HMAC dos agentes: armazenadas em vault isolado com rotação automática. Backups: criptografados e armazenados em região geográfica distinta. Certificados: gerenciados automaticamente com renovação automática.", category: "seguranca" },
  { question: "Como exportar relatórios para auditoria?", answer: "Três formatos: CSV (dados granulares para BI), PDF (relatório executivo com gráficos e recomendações) e Excel (múltiplas abas com formatação). Todos os relatórios incluem hash SHA-256 verificável publicamente em /verificar-laudo, garantindo integridade para auditoria e processos legais.", category: "relatorios" },
  { question: "O sistema é compatível com LGPD?", answer: "Sim. Módulos específicos: mapeamento de dados pessoais em endpoints, Relatório de Impacto (RIPD), controle de retenção de dados com exclusão automática, logs de auditoria imutáveis, controle de acesso baseado em roles e consentimento de cookies na landing page. Relatórios LGPD exportáveis em PDF.", category: "compliance" },
  { question: "Como funciona o suporte técnico?", answer: "Canais: chat in-app (horário comercial), e-mail support@cybershield.com (SLA 24h para Professional, 4h para Enterprise), WhatsApp para emergências (Enterprise) e base de conhecimento 24/7. Plano Enterprise inclui Customer Success Manager dedicado e onboarding assistido.", category: "suporte" },
  { question: "Posso personalizar o painel com minha marca (White Label)?", answer: "Sim! Disponível nos planos Professional e Enterprise. Customize: logotipo (painel + e-mails), paleta de cores, domínio personalizado (CNAME), favicon, templates de e-mail e footer de relatórios. Cada tenant pode ter branding independente em ambientes multi-tenant.", category: "admin" },
  { question: "O que acontece se um agente ficar offline?", answer: "1) Após 5 min: status muda para 'Sem contato'. 2) Após 1h: alerta ao operador responsável. 3) Após 24h: status 'Crítico' + alerta ao admin. Tempos configuráveis em Admin → Configurações. Quando o agente volta online, sincroniza automaticamente dados coletados durante o período offline.", category: "agentes" },
  { question: "Como funciona o sistema de notificações?", answer: "4 canais: sino in-app (todos os alertas), push notification no navegador (alertas importantes), e-mail (alertas configuráveis) e integrações (Slack/Teams/WhatsApp para alertas críticos). Regras de escalonamento automático garantem que alertas críticos não fiquem sem resposta. Agrupamento inteligente evita alert fatigue.", category: "geral" },
  { question: "Posso integrar com SIEM externo?", answer: "Sim. Integrações nativas com Splunk, QRadar, Elastic SIEM e Microsoft Sentinel via syslog (TCP/UDP) ou API REST. Eventos são enviados em formato CEF ou JSON. Configure em Admin → Integrações → SIEM. Para SIEMs não listados, use a API REST genérica com webhooks.", category: "integracoes" },
  { question: "Como funciona a quarentena de ameaças?", answer: "Arquivos maliciosos são movidos para sandbox criptografada isolada do sistema de arquivos, impedindo qualquer execução. Administradores podem: ver detalhes da ameaça (hash, tipo, engine), consultar bases externas (VirusTotal), remover permanentemente ou restaurar (falso positivo). Itens em quarentena são mantidos por 90 dias antes da exclusão automática.", category: "seguranca" },
  { question: "É possível fazer rollback de uma atualização do agente?", answer: "Sim. O sistema de rollout progressivo permite reverter atualizações: Admin → Políticas de Rollout → 'Reverter Versão'. O rollback é aplicado gradualmente (blast radius configurável) e monitorado para detectar problemas. Versões anteriores são mantidas por 30 dias.", category: "agentes" },
  { question: "Como funciona o controle de blast radius?", answer: "O blast radius limita o impacto de ações automáticas. Em horário comercial: máximo 10% dos agentes afetados simultaneamente. Fora do horário: até 50%. Para ações manuais (ex: atualização forçada), o admin define o percentual. Isso previne que uma ação incorreta afete toda a infraestrutura de uma vez.", category: "seguranca" },
  { question: "Qual o tamanho máximo de arquivo para scan?", answer: "Por padrão, arquivos acima de 500MB são ignorados pelo scan (configurável). Arquivos compactados (ZIP, RAR) são descompactados até 3 níveis de profundidade. Para alterar os limites, acesse Admin → Políticas → Configurações de Scan.", category: "seguranca" },
];

// ─── Categories & Config ─────────────────────────────────
const categories = [
  { id: "all", label: "Todos", icon: BookOpen },
  { id: "inicio", label: "Início Rápido", icon: Zap },
  { id: "dashboard", label: "Dashboard", icon: Monitor },
  { id: "agentes", label: "Agentes", icon: Server },
  { id: "seguranca", label: "Segurança", icon: Shield },
  { id: "automacao", label: "Automação", icon: RefreshCw },
  { id: "admin", label: "Administração", icon: Users },
  { id: "relatorios", label: "Relatórios", icon: FileText },
];

const difficultyConfig = {
  beginner: { label: "Iniciante", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  intermediate: { label: "Intermediário", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  advanced: { label: "Avançado", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

// ─── Quick Start Cards ───────────────────────────────────
const quickStartCards = [
  { icon: Download, title: "Instalar Agente", desc: "Configure seu primeiro endpoint em 5 minutos", tutorialId: "getting-started" },
  { icon: Shield, title: "Primeiro Scan", desc: "Execute uma verificação de segurança completa", tutorialId: "virus-scans" },
  { icon: Users, title: "Convidar Equipe", desc: "Adicione membros com diferentes permissões", tutorialId: "user-management" },
  { icon: BarChart3, title: "Gerar Relatório", desc: "Crie um relatório executivo em PDF", tutorialId: "reports-export" },
];

// ─── Component ───────────────────────────────────────────
const Tutorials = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [expandedTutorial, setExpandedTutorial] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<string, number[]>>({});

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

  const toggleStep = (tutorialId: string, stepIndex: number) => {
    setCompletedSteps(prev => {
      const current = prev[tutorialId] || [];
      return {
        ...prev,
        [tutorialId]: current.includes(stepIndex)
          ? current.filter(i => i !== stepIndex)
          : [...current, stepIndex],
      };
    });
  };

  const getProgress = (tutorialId: string, totalSteps: number) => {
    const done = (completedSteps[tutorialId] || []).length;
    return Math.round((done / totalSteps) * 100);
  };

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
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent mb-6">
                <BookOpen className="h-4 w-4" />
                <span className="text-sm font-medium">Central de Aprendizado</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
                Tutoriais & Base de Conhecimento
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
                {tutorials.length} guias detalhados, {faqs.length} perguntas frequentes e dicas práticas para dominar o CyberShield.
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

          {/* Quick Start Cards */}
          {!searchQuery && activeCategory === "all" && (
            <section className="max-w-6xl mx-auto px-4 sm:px-6 mb-12">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-accent" />
                Início Rápido
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {quickStartCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <motion.button
                      key={card.tutorialId}
                      onClick={() => {
                        setExpandedTutorial(card.tutorialId);
                        document.getElementById(`tutorial-${card.tutorialId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      className="bg-card border border-border rounded-xl p-5 text-left hover:border-accent/40 hover:bg-accent/5 transition-all group"
                      whileHover={{ y: -2 }}
                    >
                      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-3 group-hover:bg-accent/20 transition-colors">
                        <Icon className="h-5 w-5 text-accent" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground mb-1">{card.title}</h3>
                      <p className="text-xs text-muted-foreground">{card.desc}</p>
                      <div className="flex items-center gap-1 mt-3 text-xs text-accent font-medium">
                        Ver tutorial <ArrowRight className="h-3 w-3" />
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Tabs: Tutoriais / FAQ */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6">
            <Tabs defaultValue="tutorials" className="w-full">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
                <TabsTrigger value="tutorials" className="gap-2">
                  <PlayCircle className="h-4 w-4" />
                  Tutoriais ({tutorials.length})
                </TabsTrigger>
                <TabsTrigger value="faq" className="gap-2">
                  <HelpCircle className="h-4 w-4" />
                  FAQ ({faqs.length})
                </TabsTrigger>
              </TabsList>

              {/* Tutorials Tab */}
              <TabsContent value="tutorials">
                {/* Category Filter */}
                <div className="flex flex-wrap gap-2 mb-8 justify-center">
                  {categories.map((cat) => {
                    const Icon = cat.icon;
                    const count = cat.id === "all" ? tutorials.length : tutorials.filter(t => t.category === cat.id).length;
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
                        <span className="text-xs opacity-60">({count})</span>
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
                    {filteredTutorials.map((tutorial, index) => {
                      const isExpanded = expandedTutorial === tutorial.id;
                      const progress = getProgress(tutorial.id, tutorial.steps.length);
                      return (
                        <motion.div
                          key={tutorial.id}
                          id={`tutorial-${tutorial.id}`}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                        >
                          <div className={`bg-card border border-border rounded-xl overflow-hidden transition-all
                            ${isExpanded ? "ring-2 ring-accent/30" : "hover:border-foreground/20"}`}>
                            {/* Header */}
                            <button
                              onClick={() => setExpandedTutorial(isExpanded ? null : tutorial.id)}
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
                                  {tutorial.videoPlaceholder && (
                                    <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/20">
                                      <PlayCircle className="h-3 w-3 mr-1" />
                                      Vídeo
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2">{tutorial.description}</p>
                                <div className="flex items-center gap-4 mt-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {tutorial.estimatedTime}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Star className="h-3 w-3" />
                                    {tutorial.steps.length} etapas
                                  </span>
                                  {progress > 0 && (
                                    <span className="inline-flex items-center gap-1 text-xs text-accent font-medium">
                                      <CheckCircle2 className="h-3 w-3" />
                                      {progress}% concluído
                                    </span>
                                  )}
                                </div>
                                {tutorial.prerequisites && tutorial.prerequisites.length > 0 && (
                                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground/70">
                                    <Lock className="h-3 w-3" />
                                    Pré-requisitos: {tutorial.prerequisites.map(p => tutorials.find(t => t.id === p)?.title || p).join(", ")}
                                  </div>
                                )}
                              </div>
                              <ChevronRight
                                className={`h-5 w-5 text-muted-foreground flex-shrink-0 mt-2 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              />
                            </button>

                            {/* Expanded Steps */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.3 }}
                                  className="border-t border-border overflow-hidden"
                                >
                                  {/* Video placeholder */}
                                  {tutorial.videoPlaceholder && (
                                    <div className="mx-5 mt-5 rounded-lg bg-muted/30 border border-border flex items-center justify-center h-48 gap-3">
                                      <PlayCircle className="h-10 w-10 text-muted-foreground/40" />
                                      <div className="text-center">
                                        <p className="text-sm font-medium text-muted-foreground">Vídeo tutorial em breve</p>
                                        <p className="text-xs text-muted-foreground/60">Siga os passos abaixo enquanto isso</p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Progress bar */}
                                  <div className="mx-5 mt-4 flex items-center gap-3">
                                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-accent transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-muted-foreground font-medium">{progress}%</span>
                                  </div>

                                  <div className="p-5 space-y-5">
                                    {tutorial.steps.map((step, stepIndex) => {
                                      const isChecked = (completedSteps[tutorial.id] || []).includes(stepIndex);
                                      return (
                                        <div key={stepIndex} className="flex gap-4">
                                          <button
                                            onClick={() => toggleStep(tutorial.id, stepIndex)}
                                            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                                              ${isChecked
                                                ? "bg-accent text-accent-foreground"
                                                : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                                              }`}
                                          >
                                            {isChecked ? <CheckCircle2 className="h-4 w-4" /> : stepIndex + 1}
                                          </button>
                                          <div className="flex-1 min-w-0">
                                            <h4 className={`text-sm font-semibold mb-1 ${isChecked ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                              {step.title}
                                            </h4>
                                            <p className="text-sm text-muted-foreground leading-relaxed">{step.content}</p>

                                            {/* Tip */}
                                            {step.tip && (
                                              <div className="mt-3 flex gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20">
                                                <Lightbulb className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                                                <p className="text-xs text-accent leading-relaxed"><strong>Dica:</strong> {step.tip}</p>
                                              </div>
                                            )}

                                            {/* Warning */}
                                            {step.warning && (
                                              <div className="mt-3 flex gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                                                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                                                <p className="text-xs text-destructive leading-relaxed"><strong>Atenção:</strong> {step.warning}</p>
                                              </div>
                                            )}

                                            {/* Code block */}
                                            {step.code && (
                                              <div className="mt-3 rounded-lg bg-muted/50 border border-border overflow-hidden">
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/80 border-b border-border">
                                                  <Terminal className="h-3 w-3 text-muted-foreground" />
                                                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Comando</span>
                                                </div>
                                                <pre className="p-3 text-xs text-foreground/80 overflow-x-auto font-mono leading-relaxed">{step.code}</pre>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      );
                    })}
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
