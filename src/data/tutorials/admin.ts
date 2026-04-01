import type { Tutorial } from './types';

/** Tutoriais: admin */
export const tutorials_admin: Tutorial[] = [
  {
    id: "user-management",
    title: "Gerenciamento de Usuários, Roles e MFA",
    description: "Convide membros com permissões granulares, configure MFA obrigatório, gerencie sessões ativas e whitelist de IPs.",
    category: "admin",
    difficulty: "intermediate",
    estimatedTime: "15 min",
    tags: ["usuários", "permissões", "roles", "MFA", "convites", "sessões"],
    steps: [
      {
        title: "Sistema de Roles detalhado",
        content: "3 roles com permissões específicas:\n\nAdmin: Tudo — gerenciar membros/roles, configurar tenant, criar/deletar políticas, acessar audit trail, gerenciar plano/billing, exportar todos os dados, aprovar ações de alto risco.\n\nOperador: Operações — criar/executar jobs, gerenciar agentes/grupos, ver e exportar relatórios, gerenciar quarentena, criar exclusões de scan. NÃO pode: gerenciar membros, alterar configurações do tenant, ver dados financeiros.\n\nVisualizador: Somente leitura — ver dashboard, agentes, relatórios e jobs. NÃO pode: executar ações, criar jobs, gerenciar quarentena, exportar dados sensíveis.",
      },
      {
        title: "Convidar membros e convite em lote",
        content: "Admin → Membros → 'Convidar'. Individual: e-mail + role + mensagem opcional. Em lote: upload de CSV com colunas (email, role, grupo). O convite expira em 7 dias (configurável). Se expirar, reenvie pelo painel. Limites: Starter (3 membros), Professional (10), Enterprise (ilimitado).",
        code: "# CSV para convite em lote:\nemail,role,grupo\nmaria@empresa.com,operator,TI\njoao@empresa.com,viewer,Financeiro\nana@empresa.com,admin,\ncarlos@empresa.com,operator,SOC",
      },
      {
        title: "Configurar MFA obrigatório",
        content: "Admin → Configurações → Segurança → 'Exigir MFA para Administradores'. Quando ativo: admins sem MFA são redirecionados para setup no próximo login. Métodos: TOTP (Google Authenticator, Authy, Microsoft Authenticator) + 10 backup codes de uso único. Recomendação: exigir MFA para TODOS os roles, não apenas admins.",
        warning: "Comunique a equipe 48h ANTES de ativar MFA obrigatório. Forneça instruções de como instalar o app autenticador. Garanta que todos têm acesso a smartphone ou desktop com app TOTP.",
      },
      {
        title: "Gerenciar sessões e forçar logout",
        content: "Admin → Segurança → Sessões Ativas: lista todas as sessões com usuário, IP, device (Chrome/Windows), último acesso e localização aproximada. Ações: terminar sessão individual (suspeita) ou forçar logout global (todos os usuários relogam). Útil em caso de comprometimento de credenciais.",
      },
      {
        title: "Whitelist de IPs administrativos",
        content: "Restrinja acesso admin a IPs confiáveis: Admin → Segurança → IP Whitelist. Adicione IPs fixos do escritório, VPN e IPs de admins remotos. IPs não-listados recebem erro 403. Suporta IPs individuais e ranges CIDR (ex: 10.0.0.0/24).",
        warning: "Antes de ativar a whitelist: 1) Adicione TODOS os IPs de admin conhecidos. 2) Teste com um admin em IP whitelisted. 3) Mantenha um admin de emergência sem whitelist (com MFA e senha forte) para casos de lockout.",
      },
    ],
    troubleshooting: [
      {
        problem: "Usuário não recebe e-mail de convite",
        cause: "E-mail caiu no spam, servidor de e-mail rejeitou ou e-mail digitado incorretamente.",
        solution: "1) Verifique spam/lixo eletrônico. 2) Peça para adicionar noreply@cybershield.com.br como contato. 3) Reenvie o convite pelo painel. 4) Se persistir, verifique se o domínio do destinatário não bloqueia e-mails transacionais.",
      },
    ],
  },
  {
    id: "admin-panel",
    title: "Painel Admin — Guia Completo",
    description: "Action Center, integrações SIEM/ITSM, white-label, gerenciamento de planos, audit trail e configurações avançadas.",
    category: "admin",
    difficulty: "advanced",
    estimatedTime: "28 min",
    tags: ["admin", "action center", "integrações", "white-label", "audit trail", "planos"],
    prerequisites: ["getting-started", "user-management"],
    videoId: "admin-panel",
    steps: [
      {
        title: "Action Center — Hub de operações diárias",
        content: "O Action Center é a página de entrada do admin com 4 seções: (1) Alertas Pendentes — ameaças não-resolvidas, agentes críticos, jobs falhos, ordenados por severidade. (2) Aprovações — jobs de alto impacto aguardando autorização de segundo admin. (3) Recomendações da IA — sugestões de melhoria com impacto estimado (ex: 'Ativar scan diário nos 15 agentes sem scan nas últimas 72h — impacto: +12% no compliance score'). (4) Saúde do Sistema — status dos componentes internos.",
        scenario: "Exemplo de manhã típica do admin: Abrir Action Center → 2 alertas pendentes (1 agente offline, 1 scan com detecção) + 1 aprovação (job de scan em 200 agentes) + 3 recomendações da IA. Tempo médio para processar: 10 minutos.",
      },
      {
        title: "Integrações SIEM (Splunk, QRadar, Elastic)",
        content: "Admin → Integrações → SIEM. Configure: protocolo (Syslog TCP/UDP ou API REST), endpoint (IP:porta do SIEM), formato (CEF, LEEF ou JSON), filtro (quais eventos enviar — recomendação: apenas severidade média+ para não sobrecarregar o SIEM). Teste com o botão 'Enviar Evento de Teste'.",
        code: "# Exemplo de evento CEF enviado ao SIEM:\nCEF:0|CyberShield|Agent|2.5.1|100|Malware Detected|9|\n  src=10.0.1.15 \n  dhost=DESKTOP-001 \n  fname=trojan.exe \n  fhash=a1b2c3d4e5f6... \n  cat=malware \n  severity=Critical\n  act=Quarantined\n  msg=Trojan.GenericKD.12345 detected and quarantined\n\n# Exemplo JSON:\n{\n  \"timestamp\": \"2026-03-13T14:32:00-03:00\",\n  \"event_type\": \"malware_detected\",\n  \"agent\": \"DESKTOP-001\",\n  \"threat\": \"Trojan.GenericKD.12345\",\n  \"severity\": \"critical\",\n  \"action\": \"quarantined\",\n  \"file_hash\": \"a1b2c3d4e5f6...\"\n}",
      },
      {
        title: "Integrações ITSM (ServiceNow, Jira)",
        content: "Crie tickets automaticamente para incidentes: configure API key do ServiceNow/Jira, mapeie severidades do CyberShield para prioridades do ITSM (Crítica → P1, Alta → P2, etc.), defina template do ticket (título, descrição, assignee, categoria). Tickets são criados automaticamente quando ameaças de alta severidade são detectadas.",
      },
      {
        title: "White-Label completo",
        content: "Personalize 100% da interface: logotipo (painel, login, e-mails, relatórios PDF), paleta de cores (primária, secundária, accent), domínio personalizado (security.suaempresa.com via CNAME), favicon, templates de e-mail (header, footer, assinatura), footer de relatórios PDF e tela de login customizada.",
        tip: "Para MSPs: cada tenant pode ter white-label independente. Seu cliente verá a marca DELE, não a sua. Útil para provedores de segurança que revendem a solução.",
      },
      {
        title: "Audit Trail imutável",
        content: "TODA ação administrativa é registrada de forma imutável: quem fez (user_id + nome), o quê (ação detalhada), quando (timestamp UTC + timezone do admin), de onde (IP + geolocalização), resultado (sucesso/falha) e hash de integridade (SHA-256 do log entry). Filtros: por usuário, tipo de ação, período. Exportável em CSV para auditoria externa.",
        code: "# Exemplo de entry no Audit Trail:\n{\n  \"id\": \"evt_abc123\",\n  \"timestamp\": \"2026-03-13T14:32:00Z\",\n  \"user\": { \"id\": \"usr_xyz\", \"name\": \"Maria Silva\", \"role\": \"admin\" },\n  \"action\": \"quarantine.restore\",\n  \"details\": {\n    \"threat_id\": \"det_123\",\n    \"file\": \"C:\\\\app\\\\update.exe\",\n    \"reason\": \"Falso positivo confirmado via VirusTotal (0/70)\"\n  },\n  \"ip\": \"189.40.xxx.xxx\",\n  \"location\": \"São Paulo, BR\",\n  \"result\": \"success\",\n  \"integrity_hash\": \"sha256:e4f5a6b7c8d9...\"\n}",
      },
      {
        title: "Gerenciamento de planos e billing",
        content: "Admin → Plano: veja plano atual, uso de recursos (agentes, armazenamento, membros), data de renovação e histórico de faturas. Para upgrade: 'Alterar Plano' → compare features e preços → confirme. Downgrade: apenas no final do período de billing. Excedente de agentes: cobrado pro-rata no ciclo atual.",
      },
    ],
  },
  {
    id: "multi-tenant",
    title: "Gestão Multi-Tenant para MSP/MSSP",
    description: "Gerencie múltiplos clientes de um único painel: onboarding, isolamento, benchmark, faturamento e operações consolidadas.",
    category: "admin",
    difficulty: "expert",
    estimatedTime: "22 min",
    tags: ["multi-tenant", "MSP", "MSSP", "benchmark", "faturamento", "isolamento"],
    prerequisites: ["admin-panel"],
    steps: [
      {
        title: "Arquitetura multi-tenant e isolamento",
        content: "Cada tenant (empresa cliente) é completamente isolado: banco de dados separado por tenant, RLS (Row Level Security) em todas as tabelas, chaves de criptografia independentes, configurações independentes (políticas, integrações, branding). Nenhum dado de um tenant é acessível por outro, nem pelo super admin (exceto métricas agregadas).",
        code: "# Isolamento técnico por tenant:\n\n# RLS (Row Level Security) em TODAS as tabelas:\nCREATE POLICY tenant_isolation ON agents\n  USING (tenant_id = current_tenant_id());\n\n# Chaves de criptografia independentes:\n# Cada tenant tem sua própria HMAC key para agentes\n# Rotação automática a cada 90 dias\n\n# Limites por plano:\n# Starter:     25 agentes, 3 membros, 30 dias retenção\n# Professional: 100 agentes, 10 membros, 90 dias retenção  \n# Enterprise:  ilimitado, ilimitado, 365 dias retenção",
      },
      {
        title: "Onboarding de novo tenant (cliente)",
        content: "Super Admin → Tenants → 'Novo Tenant'. Preencha: nome da empresa, plano contratado, limite de agentes, admin inicial (e-mail) e configurações de branding (opcional). O sistema cria automaticamente: esquema isolado, enrollment keys iniciais, convite ao admin e página de onboarding personalizada.",
        scenario: "Exemplo: MSP onboarding novo cliente 'Advocacia Silva'. Cria tenant com plano Professional (100 agentes), configura logo do escritório como white-label e envia convite ao admin Dr. Silva. Em 30 minutos, o escritório já tem acesso ao painel com sua marca.",
      },
      {
        title: "Dashboard consolidado vs. drill-down",
        content: "Visão consolidada: métricas agregadas de TODOS os tenants — total de agentes online/offline, ameaças globais, compliance médio, receita total. Drill-down: clique em qualquer tenant para ver seus dados individuais como se fosse o admin local. Heatmap de saúde: visualização rápida com cores (verde = OK, amarelo = atenção, vermelho = crítico).",
      },
      {
        title: "Benchmark entre tenants",
        content: "Compare métricas entre clientes: taxa de detecção (quem tem mais ameaças?), tempo médio de remediação (quem resolve mais rápido?), compliance score (quem está mais protegido?), cobertura de agentes (% de endpoints protegidos). Use para: identificar clientes que precisam de atenção extra, compartilhar best practices e justificar upgrades de plano.",
      },
      {
        title: "Unit Economics e faturamento",
        content: "Dashboard financeiro: receita mensal por tenant, custo operacional por agente, margem por cliente, LTV estimado e churn prediction. Identifique: clientes mais lucrativos, clientes em risco de cancelamento (queda de uso) e oportunidades de upsell (excedendo limites do plano atual).",
      },
      {
        title: "Suspensão e migração de tenants",
        content: "Suspender tenant (inadimplência): mantém todos os dados, bloqueia acesso ao painel, agentes continuam coletando dados (por 30 dias). Reativar: desbloqueia acesso imediatamente, dados do período de suspensão ficam disponíveis. Migrar plano: upgrade é imediato, downgrade no final do ciclo. Deletar tenant: exige confirmação dupla do super admin, dados são removidos após 90 dias de quarentena.",
      },
    ],
  },

];
