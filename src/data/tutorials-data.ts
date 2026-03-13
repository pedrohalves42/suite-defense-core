// ─── Types ───────────────────────────────────────────────
export interface TutorialStep {
  title: string;
  content: string;
  tip?: string;
  warning?: string;
  code?: string;
  scenario?: string; // real-world scenario
}

export interface TroubleshootingItem {
  problem: string;
  cause: string;
  solution: string;
  code?: string;
}

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
  estimatedTime: string;
  steps: TutorialStep[];
  tags: string[];
  prerequisites?: string[];
  videoId?: string; // maps to video assets
  troubleshooting?: TroubleshootingItem[];
  realWorldScenarios?: { title: string; description: string }[];
}

export interface FAQ {
  question: string;
  answer: string;
  category: string;
}

// ─── Video mapping ───────────────────────────────────────
export const tutorialVideos: Record<string, string> = {
  "getting-started": "tutorial-dashboard",
  "agent-installation-mass": "tutorial-agent-install",
  "virus-scans": "tutorial-virus-scan",
  "threat-intelligence": "tutorial-ai-threats",
  "security-policies": "tutorial-policies",
  "dashboard-overview": "tutorial-dashboard",
  "admin-panel": "tutorial-dashboard",
  "incident-response": "tutorial-ai-threats",
  "siem-integration": "tutorial-policies",
  "api-integration": "tutorial-agent-install",
};

// ─── Tutorial Data ───────────────────────────────────────
export const tutorials: Tutorial[] = [
  // ═══════════════════════════════════════════════════════
  // INÍCIO RÁPIDO
  // ═══════════════════════════════════════════════════════
  {
    id: "getting-started",
    title: "Primeiros Passos com o CyberShield",
    description: "Guia completo para configurar sua conta, instalar o primeiro agente e começar a proteger seus dispositivos. Inclui cenários reais e troubleshooting.",
    category: "inicio",
    difficulty: "beginner",
    estimatedTime: "20 min",
    tags: ["onboarding", "instalação", "setup", "primeiro acesso"],
    videoId: "getting-started",
    realWorldScenarios: [
      { title: "Empresa com 50 estações Windows", description: "Uma empresa de contabilidade precisa proteger 50 desktops Windows 11. O admin instala o CyberShield em um endpoint piloto, valida que tudo funciona e depois distribui via GPO para o restante." },
      { title: "Startup com equipe remota", description: "Uma startup com 15 desenvolvedores remotos precisa de visibilidade sobre a segurança dos laptops. O CTO instala o agente nos laptops corporativos e monitora remotamente pelo dashboard." },
    ],
    steps: [
      {
        title: "Criar sua conta corporativa",
        content: "Acesse cybershield.com.br/signup e preencha: nome completo, e-mail corporativo (obrigatório — Gmail/Hotmail não são aceitos em planos Enterprise), senha (mínimo 12 caracteres, incluindo maiúscula, número e símbolo) e nome da empresa. Aceite os termos de uso e política de privacidade. Um e-mail de verificação será enviado — o link expira em 24 horas.",
        tip: "Se o e-mail de verificação não chegar em 5 minutos, verifique a pasta de spam. Adicione noreply@cybershield.com.br como contato confiável no seu provedor de e-mail.",
        scenario: "Exemplo real: Maria, diretora de TI, cria a conta usando maria@empresa.com.br. Ela recebe o e-mail, clica no link e é redirecionada ao dashboard pela primeira vez.",
      },
      {
        title: "Primeiro login e visão geral do painel",
        content: "Após verificar o e-mail, faça login. Você verá: o dashboard principal (vazio, pois não há agentes ainda), o menu lateral esquerdo (navegação entre módulos), a barra superior (notificações, perfil, configurações rápidas) e um banner de boas-vindas com link para este tutorial.",
        tip: "Ative MFA imediatamente: clique no seu avatar (canto superior direito) → Perfil → Segurança → Ativar MFA. Use Google Authenticator ou Authy. Salve os 10 backup codes gerados em um gerenciador de senhas.",
        warning: "Nunca compartilhe suas credenciais de admin. Se precisar dar acesso a colegas, use o sistema de convites com roles apropriados (Operador ou Visualizador).",
      },
      {
        title: "Configurar o Tenant (empresa)",
        content: "Acesse Admin → Configurações Gerais. Configure: Nome da Empresa (aparece em relatórios PDF e e-mails), Fuso Horário (afeta agendamento de jobs — São Paulo: America/Sao_Paulo), Logotipo (PNG transparente, 200x60px — usado em relatórios white-label), Idioma (PT-BR padrão) e Preferências de Notificação (quais alertas receber por e-mail).",
        warning: "O fuso horário definido aqui afeta TODOS os agendamentos de scans e jobs. Se sua empresa tem filiais em fusos diferentes, use o fuso da sede principal e documente a diferença.",
        scenario: "Exemplo: João configura o tenant 'Acme Corp', seleciona fuso 'America/Sao_Paulo', faz upload do logo da empresa e ativa notificações por e-mail para ameaças críticas e jobs falhos.",
      },
      {
        title: "Gerar chave de enrollment",
        content: "Antes de instalar agentes, gere uma Enrollment Key: vá em Instalador de Agentes → Chaves de Enrollment → 'Nova Chave'. Defina: nome descritivo (ex: 'Deploy Inicial - Mar/2026'), limite de usos (opcional — 0 = ilimitado) e validade (opcional — padrão: nunca expira). A chave é exibida uma única vez — copie e armazene com segurança.",
        warning: "A Enrollment Key vincula agentes ao seu tenant. Se vazar, qualquer pessoa pode registrar agentes falsos na sua conta. Trate como uma senha: não envie por e-mail em texto plano, use cofre de senhas ou variáveis de ambiente.",
        code: "# Exemplo de Enrollment Key gerada:\n# ***REMOVED***iJ7kL8mN9oP0qR1sT2uV\n# Guarde em local seguro!",
      },
      {
        title: "Baixar e instalar o agente (Windows)",
        content: "Em 'Instalador de Agentes', selecione Windows, clique em 'Baixar Instalador (.exe)'. No endpoint-alvo: clique com botão direito no arquivo → 'Executar como Administrador'. O instalador solicita a Enrollment Key — cole a chave gerada. Aguarde a barra de progresso completar (~2 minutos). Um ícone de escudo aparecerá na bandeja do sistema (system tray) indicando que o agente está ativo.",
        code: "# Instalação silenciosa via linha de comando:\ncybershield-agent-setup.exe /S /ENROLLMENT_KEY=***REMOVED*** /TENANT_ID=***REMOVED***\n\n# Verificar se o serviço está rodando:\nGet-Service CyberShieldAgent\n\n# Saída esperada:\n# Status   Name               DisplayName\n# ------   ----               -----------\n# Running  CyberShieldAgent   CyberShield Security Agent",
        tip: "Para Windows Server, desative temporariamente o Windows Defender SmartScreen durante a instalação se ele bloquear o executável. Reative após a instalação.",
      },
      {
        title: "Instalar o agente (Linux)",
        content: "Para servidores Linux, baixe o script de instalação. Execute com sudo em um terminal. O script detecta automaticamente a distribuição (Ubuntu, CentOS, Amazon Linux) e instala as dependências corretas. O agente roda como serviço systemd e inicia automaticamente no boot.",
        code: "# Download e instalação:\ncurl -sSL https://install.cybershield.com.br/linux | sudo bash -s -- \\\n  --enrollment-key ***REMOVED*** \\\n  --tenant-id ***REMOVED***\n\n# Verificar status:\nsudo systemctl status cybershield-agent\n\n# Ver logs:\nsudo journalctl -u cybershield-agent -f --no-pager -n 50\n\n# Distribuições suportadas:\n# Ubuntu 20.04, 22.04, 24.04\n# CentOS 7, 8, 9 (e Rocky/Alma Linux)\n# Amazon Linux 2, 2023\n# Debian 11, 12",
        tip: "Em servidores com SELinux habilitado (CentOS/RHEL), o instalador configura automaticamente os contextos de segurança necessários. Se encontrar problemas, consulte o troubleshooting abaixo.",
      },
      {
        title: "Verificar status do agente no dashboard",
        content: "Volte ao dashboard e aguarde até 5 minutos. O agente aparecerá na lista com: nome do hostname, IP (interno e externo), sistema operacional e versão, status 'Online' (ícone verde pulsante), versão do agente e timestamp do último heartbeat. Clique no nome para ver detalhes: CPU, RAM, disco, portas abertas e certificados instalados.",
        tip: "Se o agente não aparecer após 10 minutos: 1) Verifique se a porta 443 (HTTPS) está liberada no firewall. 2) Teste com: curl -v https://api.cybershield.com.br/health. 3) Verifique os logs do agente no endpoint.",
      },
      {
        title: "Executar seu primeiro scan de segurança",
        content: "Com o agente online, vá em 'Virus Scans' → 'Novo Scan'. Selecione o agente, escolha 'Scan Rápido' (verifica processos em memória, startup items e locais comuns de malware — ~5 min) e clique em 'Iniciar'. Acompanhe o progresso em tempo real com barra de percentual, contagem de arquivos analisados e tempo estimado de conclusão.",
        scenario: "Exemplo: O scan rápido do desktop DESKTOP-MARIA encontra 0 ameaças em 4 min 32s, analisando 15.847 arquivos. O resultado 'limpo' é registrado no histórico e pode ser usado como evidência de compliance.",
      },
    ],
    troubleshooting: [
      {
        problem: "O agente não aparece no dashboard após a instalação",
        cause: "Geralmente causado por firewall bloqueando a porta 443 ou Enrollment Key incorreta.",
        solution: "1) Verifique o serviço: Get-Service CyberShieldAgent (Windows) ou systemctl status cybershield-agent (Linux). 2) Teste a conectividade: Test-NetConnection api.cybershield.com.br -Port 443. 3) Verifique os logs locais. 4) Confirme que a Enrollment Key está correta e não expirou.",
        code: "# Windows - verificar serviço e logs:\nGet-Service CyberShieldAgent\nGet-Content 'C:\\ProgramData\\CyberShield\\logs\\agent.log' -Tail 50\n\n# Linux - verificar serviço e logs:\nsudo systemctl status cybershield-agent\nsudo tail -50 /var/log/cybershield/agent.log\n\n# Testar conectividade:\ncurl -v https://api.cybershield.com.br/health",
      },
      {
        problem: "Erro 'Enrollment Key inválida' durante a instalação",
        cause: "A chave foi digitada incorretamente, expirou ou atingiu o limite de usos.",
        solution: "Gere uma nova Enrollment Key no painel: Instalador → Chaves de Enrollment → Nova Chave. Copie usando Ctrl+C (não digite manualmente). Verifique que o tenant_id também está correto.",
      },
      {
        problem: "Instalação falha com 'Acesso negado' no Windows",
        cause: "O instalador não está sendo executado como Administrador.",
        solution: "Clique com botão direito no arquivo .exe → 'Executar como administrador'. Em ambientes com UAC restritivo, use um prompt de comando elevado (cmd como admin) e execute o instalador por linha de comando.",
      },
      {
        problem: "Agente aparece como 'Offline' intermitentemente",
        cause: "Instabilidade de rede, proxy interceptando conexões ou antivírus bloqueando o processo do agente.",
        solution: "1) Adicione cybershield-agent.exe às exceções do antivírus/firewall. 2) Se há proxy, configure: Admin → Configurações → Proxy (URL, porta, credenciais). 3) Verifique se o heartbeat interval não está muito baixo (mínimo recomendado: 60s).",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════
  {
    id: "dashboard-overview",
    title: "Dashboard Completo — Guia Avançado",
    description: "Domine todos os KPIs, gráficos interativos, timeline de segurança, widgets customizáveis e filtros compartilháveis do dashboard.",
    category: "dashboard",
    difficulty: "beginner",
    estimatedTime: "15 min",
    tags: ["dashboard", "métricas", "KPIs", "gráficos", "widgets", "filtros"],
    videoId: "dashboard-overview",
    realWorldScenarios: [
      { title: "SOC monitorando 200 agentes", description: "O analista de SOC usa o dashboard customizado com layout 3 colunas: KPIs no topo, gráficos de tendência no meio e timeline de ameaças na lateral. Filtro salvo: 'últimas 24h, apenas severidade alta/crítica'." },
      { title: "CTO preparando relatório mensal", description: "O CTO acessa o dashboard com filtro de 30 dias, exporta os KPIs e gráficos como PDF executivo para apresentar ao board. Usa o link compartilhável para enviar a visão exata aos diretores." },
    ],
    steps: [
      {
        title: "Cards de KPI — Entendendo cada métrica",
        content: "4 cards principais no topo: (1) Total de Agentes — mostra online/offline com %, alerta se >10% offline. (2) Taxa de Sucesso de Jobs — % de jobs concluídos com sucesso nas últimas 24h, seta verde/vermelha indicando tendência. (3) Ameaças Detectadas — total com breakdown por severidade (crítica em vermelho, alta em laranja, média em amarelo, baixa em azul). (4) Jobs Ativos — quantidade em execução neste momento com barra de progresso agregada.",
        tip: "Clique em qualquer card de KPI para navegar diretamente à página detalhada. Ex: clicar em 'Ameaças Detectadas' leva à Quarentena com filtro de ameaças ativas.",
        scenario: "Exemplo: Card 'Ameaças Detectadas' mostra '7 (↑3)' — significa 7 ameaças ativas, 3 a mais que ontem. O vermelho indica que há pelo menos 1 crítica. Clique para investigar.",
      },
      {
        title: "Gráficos de tendência — Análise temporal",
        content: "3 gráficos interativos: (1) Instalações vs. Desinstalações — linha temporal mostrando crescimento líquido de agentes. (2) Detecções por Tipo — barras empilhadas: trojan, ransomware, PUP, adware, rootkit. (3) Volume de Jobs — área mostrando jobs executados com breakdown sucesso/falha. Todos suportam zoom (click+drag), hover para valores exatos e exportação PNG.",
        tip: "Seletores de período: 7d (operacional diário), 30d (relatório mensal), 90d (tendência trimestral), Custom (qualquer range). Para análise de incidentes, use 24h ou Custom com horário específico.",
      },
      {
        title: "Timeline humanizada de eventos",
        content: "A timeline lateral exibe eventos em linguagem natural com contexto: 'DESKTOP-MARIA detectou Trojan.GenericKD.12345 (severidade: CRÍTICA) há 15 min — quarentena automática aplicada', 'Job scan-completo-semanal finalizado: 45 agentes processados, 2 ameaças encontradas'. Cores por severidade: vermelho = crítico, laranja = alto, amarelo = médio, azul = info.",
        scenario: "Exemplo real: Às 14:32, o timeline mostra: '⚠️ SERVIDOR-DB01 — Anomalia comportamental detectada: aumento de 340% em operações de escrita em disco. Investigação recomendada.' O operador clica e vê os detalhes do baseline comportamental.",
      },
      {
        title: "Tabs especializadas com dados granulares",
        content: "5 tabs abaixo dos gráficos: (1) Agentes — tabela paginada com busca, filtro por status/grupo/SO, colunas ordenáveis. (2) Jobs — histórico com filtro por tipo/status/agente. (3) Relatórios — PDFs gerados com download direto. (4) Evidências — log de auditoria imutável com hash. (5) Segurança — ameaças ativas, quarentena e alertas pendentes. Cada tab tem seu próprio botão de exportação CSV.",
      },
      {
        title: "Layout customizável com drag-and-drop",
        content: "Clique no ícone de cadeado (🔒) no canto superior direito para desbloquear edição. Os widgets ganham handles de arraste (cantos) e redimensionamento (bordas). Arraste para reorganizar, redimensione puxando bordas. Widgets disponíveis: KPIs, Gráficos, Timeline, Mapa de Agentes, Top Ameaças, Status de Compliance. O layout é salvo automaticamente por usuário.",
        tip: "Crie layouts diferentes para funções diferentes: SOC Analyst (foco em ameaças), Manager (foco em KPIs e compliance), Engineer (foco em agentes e jobs). Cada usuário salva seu próprio layout.",
      },
      {
        title: "Filtros compartilháveis via URL",
        content: "Todos os filtros são sincronizados com a URL via query parameters: ?tab=seguranca&q=ransomware&status=critico&periodo=7d. Copie a URL para compartilhar uma visão filtrada exata com colegas. Crie bookmarks no navegador para visões que você acessa frequentemente.",
        code: "# Exemplos de URLs com filtros:\n/dashboard?tab=agentes&status=offline\n/dashboard?tab=seguranca&severidade=critica&periodo=24h\n/dashboard?tab=jobs&tipo=scan&status=failed&periodo=7d\n\n# Compartilhe com colegas — eles verão exatamente a mesma visão filtrada",
        tip: "Salve como bookmarks no navegador: 'Dashboard - Ameaças Críticas 24h', 'Dashboard - Agentes Offline', 'Dashboard - Jobs Falhos Semana'.",
      },
    ],
    troubleshooting: [
      {
        problem: "Gráficos não carregam ou mostram dados vazios",
        cause: "Período selecionado sem dados (ex: 7 dias com tenant recém-criado) ou cache do navegador corrompido.",
        solution: "1) Mude o período para '30d' ou 'Todos'. 2) Limpe cache: Ctrl+Shift+Delete → Cache de imagens e arquivos. 3) Tente em aba anônima. Se persistir, verifique se há agentes online reportando dados.",
      },
      {
        problem: "Layout customizado voltou ao padrão",
        cause: "Limpeza de dados do navegador removeu o localStorage ou login com conta diferente.",
        solution: "O layout é salvo por perfil de usuário. Faça login com a conta correta. Se os dados foram limpos, reconfigure o layout — ele será salvo automaticamente novamente.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // AGENTES
  // ═══════════════════════════════════════════════════════
  {
    id: "agent-installation-mass",
    title: "Instalação em Massa de Agentes (GPO, Ansible, SCCM)",
    description: "Distribua o agente para centenas de endpoints simultaneamente usando GPO, Ansible, SCCM ou scripts. Inclui playbooks e troubleshooting.",
    category: "agentes",
    difficulty: "advanced",
    estimatedTime: "25 min",
    tags: ["agentes", "instalação em massa", "GPO", "Ansible", "SCCM", "deploy", "automação"],
    prerequisites: ["getting-started"],
    videoId: "agent-installation-mass",
    realWorldScenarios: [
      { title: "Hospital com 500 estações", description: "Um hospital precisa proteger 500 endpoints (estações médicas, terminais de enfermagem, servidores). O deploy é feito via GPO em 3 fases: 50 máquinas piloto → 150 (ala administrativa) → 300 (áreas clínicas), com 48h de observação entre cada fase." },
      { title: "MSP gerenciando 20 clientes", description: "Um provedor de serviços gerenciados (MSP) instala agentes em 20 empresas clientes diferentes, cada uma com seu próprio tenant e Enrollment Key. Usa Ansible para padronizar o deploy em ambientes Linux heterogêneos." },
    ],
    steps: [
      {
        title: "Planejamento do deploy em massa",
        content: "Antes de iniciar, defina: (1) Escopo — quantos endpoints e quais SO. (2) Fases — divida em waves (piloto 5%, wave 1 30%, wave 2 resto). (3) Rollback — teste a desinstalação silenciosa antes. (4) Comunicação — informe usuários sobre a instalação. (5) Horário — deploy fora do horário comercial para minimizar impacto.",
        tip: "Para deploys >100 endpoints, sempre use o approach de fases. Monitore a fase piloto por 48h antes de prosseguir. Isso evita que um problema no instalador afete toda a infraestrutura.",
        scenario: "Exemplo: Deploy em empresa com 300 estações. Fase piloto: 15 máquinas do TI (equipe que pode reportar problemas). Após 48h sem issues, wave 1: 100 máquinas do administrativo. Wave 2: 185 restantes.",
      },
      {
        title: "Gerar Enrollment Key com escopo controlado",
        content: "Crie Enrollment Keys específicas por fase: 'Piloto-Mar2026' (limite: 20 usos, expira em 7 dias), 'Wave1-Mar2026' (limite: 150, expira em 14 dias), 'Wave2-Abr2026' (limite: 200, expira em 14 dias). Isso permite rastrear de qual fase cada agente veio e limitar registros indesejados.",
        warning: "NUNCA crie uma Enrollment Key sem limite de usos e sem expiração para deploys em massa. Se a chave vazar, agentes não-autorizados poderão se registrar indefinidamente.",
      },
      {
        title: "Deploy via GPO (Active Directory — Windows)",
        content: "No GPMC (Group Policy Management Console): 1) Crie uma nova GPO: 'CyberShield Agent Deploy'. 2) Computer Configuration → Policies → Software Settings → Software Installation → New Package. 3) Aponte para o MSI no compartilhamento de rede (\\\\servidor\\deploy\\cybershield-agent.msi). 4) Em 'Properties → Modifications', adicione o transform file com parâmetros. 5) Vincule a GPO à OU desejada.",
        code: "# Opção 1: MSI via GPO com transform file\nmsiexec /i \\\\fileserver\\deploy\\cybershield-agent.msi /qn \\\n  ENROLLMENT_KEY=***REMOVED*** \\\n  TENANT_ID=***REMOVED*** \\\n  TRANSFORMS=\\\\fileserver\\deploy\\config.mst\n\n# Opção 2: Script de startup via GPO\n# Crie um .bat em Computer Configuration → Windows Settings → Scripts → Startup:\n@echo off\nif exist \"C:\\Program Files\\CyberShield\\agent.exe\" exit /b 0\nmsiexec /i \\\\fileserver\\deploy\\cybershield-agent.msi /qn ENROLLMENT_KEY=ek_cs_abc123\n\n# Opção 3: PowerShell DSC\nConfiguration CyberShieldAgent {\n  Node $AllNodes.NodeName {\n    Package CyberShield {\n      Name = 'CyberShield Agent'\n      Path = '\\\\fileserver\\deploy\\cybershield-agent.msi'\n      ProductId = '{GUID-DO-PRODUTO}'\n      Arguments = '/qn ENROLLMENT_KEY=ek_cs_abc123'\n    }\n  }\n}",
        tip: "O script de startup (opção 2) é o método mais resiliente — se a máquina não estava ligada durante a aplicação da GPO, o agente será instalado automaticamente no próximo boot.",
      },
      {
        title: "Deploy via SCCM/Intune (Microsoft Endpoint Manager)",
        content: "Para ambientes com SCCM/MEM: 1) Crie um novo Application: Software Library → Applications → Create Application. 2) Tipo: MSI. 3) Install command: msiexec /i cybershield-agent.msi /qn ENROLLMENT_KEY=xxx. 4) Detection method: File exists C:\\Program Files\\CyberShield\\agent.exe. 5) Deploy para Collection desejada com deadline.",
        code: "# Detection Script (PowerShell) para Intune:\nif (Test-Path 'C:\\Program Files\\CyberShield\\agent.exe') {\n  $version = (Get-Item 'C:\\Program Files\\CyberShield\\agent.exe').VersionInfo.FileVersion\n  Write-Output \"Installed: $version\"\n  exit 0\n} else {\n  exit 1\n}",
      },
      {
        title: "Deploy via Ansible (Linux)",
        content: "Para servidores Linux, use o role Ansible fornecido. Ele suporta Ubuntu 20.04+, CentOS 7+, Debian 11+ e Amazon Linux 2. O playbook: instala dependências (curl, ca-certificates), baixa e verifica hash do instalador, executa instalação, configura systemd e valida conectividade.",
        code: "# inventory.yml\nall:\n  children:\n    webservers:\n      hosts:\n        web01: { ansible_host: 10.0.1.10 }\n        web02: { ansible_host: 10.0.1.11 }\n    databases:\n      hosts:\n        db01: { ansible_host: 10.0.2.10 }\n\n# playbook.yml\n---\n- name: Deploy CyberShield Agent\n  hosts: all\n  become: yes\n  vars:\n    enrollment_key: \"{{ vault_enrollment_key }}\"\n    tenant_id: \"{{ vault_tenant_id }}\"\n    agent_version: \"2.5.1\"\n  tasks:\n    - name: Check if agent is already installed\n      stat:\n        path: /opt/cybershield/bin/agent\n      register: agent_check\n\n    - name: Download installer\n      get_url:\n        url: \"https://releases.cybershield.com.br/{{ agent_version }}/install.sh\"\n        dest: /tmp/cybershield-install.sh\n        mode: '0755'\n        checksum: \"sha256:abc123def456...\"\n      when: not agent_check.stat.exists\n\n    - name: Install agent\n      shell: |\n        /tmp/cybershield-install.sh \\\n          --enrollment-key {{ enrollment_key }} \\\n          --tenant-id {{ tenant_id }} \\\n          --auto-start\n      when: not agent_check.stat.exists\n\n    - name: Verify agent is running\n      systemd:\n        name: cybershield-agent\n        state: started\n        enabled: yes\n\n    - name: Cleanup installer\n      file:\n        path: /tmp/cybershield-install.sh\n        state: absent",
        tip: "Use ansible-vault para proteger a enrollment_key: ansible-vault encrypt_string 'ek_cs_abc123' --name 'vault_enrollment_key'. Nunca deixe chaves em texto plano nos playbooks.",
      },
      {
        title: "Monitorar progresso do deploy em tempo real",
        content: "No dashboard, use o filtro 'Recém-instalados': Agentes → Filtro → 'Instalado nas últimas 24h'. Acompanhe: agentes aparecendo online, erros de enrollment (chave inválida, expirada ou limite atingido) e primeira sincronização de dados. O gráfico de instalações mostra o ritmo do deploy.",
        scenario: "Exemplo: Wave 1 com 100 máquinas. Após 1h: 87 online, 8 pending (ainda reiniciando), 5 com erro. Clique nos erros: 3 eram firewall bloqueando, 2 eram enrollment key com typo no script.",
      },
      {
        title: "Validação pós-deploy e baseline",
        content: "Após todas as waves: 1) Execute um Job de 'Health Check' em todos os agentes — verifica versão, conectividade e integridade. 2) Gere um relatório de deploy (Admin → Relatórios → Deploy Report). 3) Após 7 dias, o sistema terá baseline comportamental para cada agente — anomalias futuras serão detectadas automaticamente.",
      },
    ],
    troubleshooting: [
      {
        problem: "GPO não aplica em todas as máquinas",
        cause: "Máquinas não estão na OU correta, GPO link não habilitado, ou máquinas não atualizaram policies.",
        solution: "1) Verifique se as máquinas estão na OU vinculada à GPO. 2) Force atualização: gpupdate /force. 3) Verifique resultados: gpresult /R | findstr CyberShield. 4) Verifique logs do Event Viewer → Application → MSI Installer.",
        code: "# Forçar atualização de GPO em todas as máquinas da OU:\nGet-ADComputer -SearchBase 'OU=Workstations,DC=empresa,DC=local' -Filter * | ForEach-Object {\n  Invoke-GPUpdate -Computer $_.Name -Force\n}",
      },
      {
        problem: "Ansible falha com 'Permission denied'",
        cause: "Usuário SSH sem permissão sudo ou chave SSH não configurada.",
        solution: "Verifique: 1) O usuário tem NOPASSWD no sudoers para os comandos necessários. 2) A chave SSH está correta: ssh -i ~/.ssh/key user@host. 3) O become_method está configurado: become: yes, become_method: sudo.",
      },
      {
        problem: "Agentes instalados mas com versão antiga",
        cause: "Cache do compartilhamento de rede ou CDN servindo versão antiga do instalador.",
        solution: "1) Verifique a versão do MSI/script no share. 2) Limpe cache: del \\\\fileserver\\deploy\\cybershield-agent.msi && copie nova versão. 3) Para atualizações de agentes já instalados, use o módulo de Rollout Policies no painel admin.",
      },
    ],
  },
  {
    id: "agent-management",
    title: "Gerenciamento Avançado de Agentes",
    description: "Gestão completa de agentes: monitoramento em tempo real, grupos, tags, arquivamento, métricas de hardware e troubleshooting detalhado.",
    category: "agentes",
    difficulty: "intermediate",
    estimatedTime: "20 min",
    tags: ["agentes", "monitoramento", "grupos", "tags", "métricas", "hardware"],
    steps: [
      {
        title: "Lista de agentes — Filtros e ordenação avançados",
        content: "Na página 'Agentes', a tabela exibe: Hostname, IP (interno + externo), SO (Windows 10/11/Server + versão), Versão do Agente, Status (Online/Offline/Crítico), Último Heartbeat, Grupo e Tags. Filtros: status, SO, grupo, versão, instalado desde/até. Ordenação: clique no header da coluna. Busca: por nome, IP ou tag.",
        scenario: "Exemplo: Filtrar 'Status: Offline' + 'Grupo: Servidores' → mostra 3 servidores que pararam de reportar nas últimas 2h. Clicar em cada um para investigar causa.",
      },
      {
        title: "Detalhes profundos de um agente",
        content: "Clique em qualquer agente para o painel de detalhes com 6 seções: (1) Resumo — hostname, IP, SO, uptime, versão. (2) Hardware — CPU (modelo, cores, uso %), RAM (total, em uso), Disco (por drive: total, usado, % livre, tipo SSD/HDD). (3) Rede — interfaces de rede, DNS, gateway, portas abertas. (4) Segurança — Windows Defender status, firewall, certificados SSL com datas de expiração. (5) Processos — top 10 processos por CPU/RAM. (6) Histórico — últimos scans, detecções e jobs executados.",
        tip: "O gráfico de tendência de disco é especialmente útil: mostra projeção de quando o disco ficará cheio com base na taxa de crescimento. Configure alertas para 85% de uso.",
      },
      {
        title: "Criar grupos lógicos com tags",
        content: "Grupos organizam agentes hierarquicamente (um agente pertence a um grupo). Tags são labels flexíveis (um agente pode ter múltiplas tags). Exemplos de grupos: 'Servidores Web', 'Estações TI', 'Filial SP'. Exemplos de tags: 'windows-11', 'pci-scope', 'vpn-ativa', 'ssd', 'legacy'.",
        code: "# Estrutura de grupos sugerida para empresa média:\n├── Sede\n│   ├── Servidores\n│   │   ├── Produção\n│   │   └── Desenvolvimento\n│   ├── Estações\n│   │   ├── Administrativo\n│   │   ├── Financeiro (política: restritiva)\n│   │   └── TI\n│   └── Impressoras/IoT\n├── Filial SP\n│   ├── Servidores\n│   └── Estações\n└── Home Office\n    └── Laptops Corporativos",
      },
      {
        title: "Monitoramento de saúde contínuo",
        content: "A página 'Monitoramento Avançado' (menu lateral) exibe: painel de saúde agregado (% agentes saudáveis), alertas ativos por severidade, certificados expirando nos próximos 30/60/90 dias, agentes com disco >85%, agentes com falha no último scan e anomalias comportamentais detectadas.",
        warning: "Agentes offline por >24h são automaticamente marcados como 'Crítico' e geram alerta ao admin. Configure o tempo de tolerância em Admin → Configurações → Monitoramento. Para servidores, recomende tolerância menor (1h).",
      },
      {
        title: "Arquivar e descomissionar agentes",
        content: "Para máquinas desativadas: Agente → Ações → Arquivar. O histórico completo (scans, detecções, métricas) é preservado para auditoria, mas o agente não conta no limite do plano e não gera alertas de offline. Para restaurar: Admin → Agentes Arquivados → Reativar.",
        tip: "Antes de arquivar, execute um último scan completo para ter uma snapshot final do estado de segurança da máquina. Isso é importante para compliance e auditoria.",
      },
      {
        title: "Atualização remota de agentes (Rollout)",
        content: "Novas versões do agente são distribuídas via Rollout Policies: Admin → Políticas de Rollout. Configure: versão-alvo, grupo de teste (piloto com 5-10% dos agentes), tempo de observação entre waves, critérios de rollback automático (ex: se >5% dos agentes ficarem offline após atualização).",
        scenario: "Exemplo: Nova versão 2.6.0 disponível. Rollout: piloto com grupo 'TI' (10 agentes) → aguarda 24h → se OK, wave 1 com 30% → wave 2 com 70%. Se a versão causar >3 crashs, rollback automático para 2.5.1.",
      },
    ],
    troubleshooting: [
      {
        problem: "Agente mostra alto uso de CPU (>50%) constantemente",
        cause: "Scan em execução, muitos arquivos sendo monitorados em tempo real ou conflito com outro antivírus.",
        solution: "1) Verifique se há scan em andamento. 2) Se há outro AV: desinstale-o ou adicione exclusões mútuas. 3) Ajuste o real-time monitoring para excluir pastas de alto I/O (ex: pasta de build, databases).",
      },
      {
        problem: "Métricas de hardware não atualizam",
        cause: "O agente não tem permissão para acessar WMI (Windows) ou /proc (Linux).",
        solution: "Windows: execute 'winmgmt /verifyrepository'. Se corrompido: 'winmgmt /salvagerepository'. Linux: verifique permissões em /proc e /sys.",
        code: "# Windows - reconstruir WMI:\nwinmgmt /verifyrepository\n# Se reportar inconsistência:\nwinmgmt /salvagerepository\nnet stop winmgmt && net start winmgmt\n\n# Linux - verificar permissões:\nls -la /proc/stat /proc/meminfo /proc/diskstats",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // SEGURANÇA
  // ═══════════════════════════════════════════════════════
  {
    id: "virus-scans",
    title: "Scans de Vírus — Guia Técnico Completo",
    description: "Tudo sobre scans: tipos, configuração avançada, interpretação de resultados, quarentena, exclusões, análise forense e integração com threat intelligence.",
    category: "seguranca",
    difficulty: "intermediate",
    estimatedTime: "20 min",
    tags: ["vírus", "scan", "quarentena", "malware", "forense", "threat intel"],
    videoId: "virus-scans",
    realWorldScenarios: [
      { title: "Detecção de ransomware em servidor de arquivos", description: "Scan completo no servidor de arquivos detecta 'Ransom.WannaCry.B'. O sistema automaticamente: isola o servidor da rede, notifica admin via WhatsApp, tira snapshot de evidências e inicia o playbook de resposta a ransomware." },
      { title: "Falso positivo em software interno", description: "O scan marca o ERP customizado da empresa como 'PUP.Optional.CustomApp'. O admin verifica no VirusTotal (0/70 detecções), confirma que é falso positivo e adiciona o hash SHA-256 à whitelist." },
    ],
    steps: [
      {
        title: "Tipos de scan em detalhe",
        content: "Scan Rápido (~5 min): verifica processos em memória, chaves de registro de inicialização (Run/RunOnce), pasta Temp, Downloads, pastas de startup e executáveis recentes. Ideal para verificação diária. Scan Completo (~30-60 min): varre TODOS os arquivos do disco incluindo arquivos de sistema, descompacta ZIPs/RARs até 3 níveis. Ideal para primeira verificação e verificação semanal. Scan Customizado: você define pastas, extensões e profundidade. Ideal para verificar um diretório suspeito específico.",
        tip: "Para ambientes com muitos arquivos temporários (builds, CI/CD), exclua essas pastas do scan completo e faça scan customizado separado nelas com menor frequência.",
      },
      {
        title: "Executar scan com parâmetros avançados",
        content: "Em 'Virus Scans' → 'Novo Scan Avançado': selecione agentes (individual, por grupo ou todos), tipo de scan, configurações adicionais: profundidade de descompactação (1-5 níveis), tamanho máximo de arquivo (padrão: 500MB), extensions a ignorar (.iso, .vmdk), ação automática para detecções (quarentena imediata, log apenas ou perguntar).",
        code: "# Parâmetros do Scan Customizado (exemplo):\n{\n  \"scan_type\": \"custom\",\n  \"targets\": [\"C:\\\\Users\", \"D:\\\\Shared\"],\n  \"exclude_paths\": [\"C:\\\\Users\\\\*\\\\AppData\\\\Local\\\\Temp\"],\n  \"exclude_extensions\": [\".iso\", \".vmdk\", \".vhd\"],\n  \"max_file_size_mb\": 500,\n  \"archive_depth\": 3,\n  \"on_detection\": \"quarantine\",\n  \"scan_hidden_files\": true,\n  \"follow_symlinks\": false\n}",
      },
      {
        title: "Interpretar resultados — Severidades e classificações",
        content: "Cada detecção inclui: Nome da Ameaça (ex: Trojan.GenericKD.12345), Família (trojan, ransomware, PUP, adware, rootkit, worm, backdoor), Severidade (Crítica: ransomware/rootkit, Alta: trojan/backdoor, Média: worm/adware, Baixa: PUP/cookie), Hash SHA-256 (para verificação cruzada), Caminho do Arquivo, Tamanho, Data de Criação/Modificação e Engine de Detecção.",
        tip: "Para verificação cruzada, submeta o hash SHA-256 em virustotal.com. Se <5 engines detectam, pode ser falso positivo. Se >20 engines detectam, é malware confirmado.",
        warning: "Detecções de severidade CRÍTICA (ransomware, rootkit) indicam possível comprometimento ativo. NÃO restaure da quarentena sem análise forense. Isole o endpoint da rede imediatamente.",
      },
      {
        title: "Quarentena — Gestão e análise",
        content: "Itens em quarentena ficam em sandbox criptografada (AES-256) sem acesso ao sistema de arquivos. Para cada item: veja metadata completa, baixe sample para análise (somente admin com MFA), compare hash em bases de threat intel, adicione notas de investigação. Ações: Remover Permanentemente (confirma malware) ou Restaurar (falso positivo — exige justificativa registrada no audit trail).",
        warning: "Baixar samples da quarentena requer MFA ativo e permissão de Admin. O download é registrado no audit trail com IP, horário e justificativa.",
      },
      {
        title: "Exclusões e whitelist — Configuração segura",
        content: "Tipos de exclusão: por Caminho (ex: C:\\DevTools\\compilador.exe), por Hash SHA-256 (mais seguro — identifica o arquivo exato), por Nome de Processo (ex: meu-erp.exe) ou por Pasta (ex: C:\\Builds\\ — todos os arquivos dentro). Escopo: por tenant (afeta todos os agentes) ou por grupo (apenas agentes do grupo).",
        warning: "Exclusões amplas (pasta inteira, extensões comuns) criam pontos cegos na proteção. Prefira SEMPRE exclusão por Hash SHA-256 (identifica apenas aquele binário específico). Revise exclusões trimestralmente.",
        code: "# Boas práticas de exclusão:\n✅ Hash SHA-256: 'a1b2c3d4...' → exclusão precisa de 1 arquivo\n✅ Caminho específico: 'C:\\ERP\\meu-sistema.exe'\n⚠️ Pasta controlada: 'C:\\Builds\\' → revisar mensalmente\n❌ Extensão ampla: '*.dll' → NUNCA faça isso\n❌ Pasta raiz: 'C:\\' → ABSOLUTAMENTE NUNCA",
      },
      {
        title: "Agendamento inteligente de scans",
        content: "Boas práticas de agendamento: Scan Rápido diário (6h da manhã, antes do expediente). Scan Completo semanal (sábado 2h da manhã, menos impacto). Scan Customizado em pastas de compartilhamento (2x por semana). Para servidores 24/7: use Scan Rápido 2x ao dia e Completo no domingo à noite.",
        scenario: "Exemplo de configuração para empresa padrão:\n- Estações: Rápido diário 6h + Completo sábado 2h\n- Servidores: Rápido 6h e 18h + Completo domingo 1h\n- File Server: Rápido 4h, 12h, 20h + Completo sábado 0h",
      },
    ],
    troubleshooting: [
      {
        problem: "Scan demora muito mais que o esperado",
        cause: "Muitos arquivos grandes, pastas de rede mapeadas sendo incluídas ou disco lento (HDD vs SSD).",
        solution: "1) Exclua drives de rede mapeados (scan local apenas). 2) Exclua pastas de VM (.vmdk, .vhd). 3) Para HDDs, agende scans em horários de baixo I/O. 4) Reduza profundidade de descompactação de 5 para 2 níveis.",
      },
      {
        problem: "Scan reporta 'Access Denied' em vários arquivos",
        cause: "O serviço do agente não tem permissão para acessar pastas protegidas do sistema ou de outros usuários.",
        solution: "O agente roda como SYSTEM no Windows (tem acesso a tudo). Se mesmo assim há erros: 1) Verifique se não há EFS (Encrypted File System) em uso. 2) Em Linux, verifique se o agente roda como root. 3) Pastas de outros usuários logados podem estar bloqueadas — agende scan para horário sem login.",
      },
    ],
  },
  {
    id: "security-policies",
    title: "Políticas de Segurança e Compliance LGPD",
    description: "Crie políticas personalizadas, automatize enforcement, monitore compliance LGPD e gere evidências de auditoria.",
    category: "seguranca",
    difficulty: "advanced",
    estimatedTime: "22 min",
    tags: ["políticas", "compliance", "LGPD", "enforcement", "auditoria"],
    prerequisites: ["agent-management"],
    videoId: "security-policies",
    steps: [
      {
        title: "Tipos de política disponíveis",
        content: "O CyberShield oferece 8 tipos de política: (1) Frequência de Scan — mínimo de scans rápidos/completos por semana. (2) Requisitos de Senha — complexidade, expiração, histórico. (3) Controle de USB — bloquear/permitir/log dispositivos removíveis. (4) Whitelist de Aplicações — apenas software autorizado pode executar. (5) Configurações de Firewall — regras obrigatórias. (6) Atualizações de SO — patches devem estar em dia (N dias de tolerância). (7) Criptografia de Disco — BitLocker/LUKS obrigatório. (8) Controle de Rede — restrições de conexão (VPN obrigatória fora do escritório).",
      },
      {
        title: "Criar uma política com regras granulares",
        content: "Em Admin → Políticas → 'Nova Política': defina nome, descrição, nível de criticidade (informativo, moderado, alto, crítico) e adicione regras. Cada regra tem: condição (ex: 'Scan completo executado nos últimos 7 dias'), operador (=, ≠, >, <, contém), valor esperado e ação em caso de violação.",
        code: "# Exemplo: Política 'Baseline de Segurança - Estações'\nNome: Baseline Segurança - Estações\nCriticidade: Alta\nRegras:\n  1. Scan rápido executado nos últimos 2 dias → Ação: Alerta\n  2. Scan completo executado nos últimos 7 dias → Ação: Alerta\n  3. Windows Defender ativo → Ação: Quarentena agente\n  4. Disco criptografado (BitLocker) → Ação: Notificar admin\n  5. Sem software não-autorizado → Ação: Log\n  6. Patches de SO com < 30 dias de atraso → Ação: Alerta",
        scenario: "Exemplo: A política 'PCI-DSS Scope' é aplicada apenas ao grupo 'Servidores de Pagamento' e exige: scan diário, firewall ativo, logs de auditoria habilitados e criptografia em trânsito e repouso.",
      },
      {
        title: "Aplicar políticas a grupos com herança",
        content: "Políticas são aplicadas a grupos com suporte a herança: uma política no grupo 'Sede' é automaticamente herdada por subgrupos 'Servidores' e 'Estações'. Subgrupos podem ter políticas adicionais (cumulativas). Em caso de conflito entre políticas pai e filha, a regra mais restritiva prevalece.",
        tip: "Crie uma hierarquia de políticas: 'Baseline Global' (para todos) → 'Servidores Avançada' (adicional para servidores) → 'PCI-DSS' (adicional para escopo PCI). Isso evita duplicação de regras.",
      },
      {
        title: "Dashboard de compliance em tempo real",
        content: "O dashboard de compliance exibe: score de compliance geral (0-100%), breakdown por política (% de agentes conformes), lista de agentes em violação com detalhes de qual regra violam, tendência histórica (melhora ou piora ao longo do tempo) e ranking de grupos por compliance score.",
        scenario: "Exemplo: Dashboard mostra compliance geral de 87%. Política 'Baseline' está em 94%, mas política 'Criptografia de Disco' está em 62% — 38 estações sem BitLocker. O admin exporta a lista e encaminha ao time de suporte para ativar criptografia.",
      },
      {
        title: "Relatórios LGPD automatizados",
        content: "Gere relatórios de compliance LGPD: (1) RIPD (Relatório de Impacto) — mapeamento de dados pessoais encontrados em endpoints, riscos identificados e medidas de mitigação. (2) Evidências de Conformidade — lista de controles implementados com status (ativo/inativo). (3) Plano de Ação — gaps identificados com recomendações e prazos sugeridos.",
      },
      {
        title: "Enforcement automático com escalonamento",
        content: "Configure ações automáticas escalonáveis: 1ª violação → log no audit trail. 2ª violação (após 24h sem correção) → alerta ao operador. 3ª violação (após 72h) → notificação ao admin + alerta visual no agente. 4ª violação (após 7 dias) → quarentena do agente (bloqueia operações não-essenciais até correção).",
        warning: "Quarentena automática de agentes pode impactar operações críticas. SEMPRE exclua servidores de produção do enforcement automático de quarentena. Use apenas alertas para servidores.",
      },
    ],
    troubleshooting: [
      {
        problem: "Compliance score não atualiza após correção",
        cause: "O agente ainda não executou nova verificação de compliance (execução periódica).",
        solution: "Force uma verificação: Agente → Ações → 'Verificar Compliance Agora'. O score será atualizado em até 5 minutos. Verificações periódicas acontecem a cada 6h por padrão (configurável).",
      },
    ],
  },
  {
    id: "threat-intelligence",
    title: "Inteligência de Ameaças e IA Avançada",
    description: "Use IA para detecção de anomalias, baseline comportamental, Shadow IT, simulação de ataques, resposta a ransomware e Security Graph.",
    category: "seguranca",
    difficulty: "expert",
    estimatedTime: "25 min",
    tags: ["IA", "ameaças", "anomalias", "Shadow IT", "red team", "ransomware", "forense"],
    prerequisites: ["virus-scans", "security-policies"],
    videoId: "threat-intelligence",
    realWorldScenarios: [
      { title: "Detecção de exfiltração de dados", description: "A IA detecta anomalia: o DESKTOP-FINANCEIRO está enviando 15GB de dados para um IP externo desconhecido às 3h da manhã (baseline normal: <100MB/dia). Alerta crítico gerado, endpoint isolado automaticamente, snapshot forense capturado." },
      { title: "Shadow IT em empresa de engenharia", description: "O módulo Shadow IT descobre que 12 funcionários estão usando um serviço de compartilhamento de arquivos não-aprovado. O admin avalia o risco, bloqueia o acesso e oferece alternativa corporativa aprovada." },
    ],
    steps: [
      {
        title: "AI Insights — Como funciona a análise",
        content: "A IA processa continuamente: padrões de tráfego de rede por agente, comportamento de processos (quais executam, quando, por quanto tempo), padrões de acesso a arquivos (read/write/delete), mudanças em configurações do sistema e correlação entre eventos de múltiplos agentes. Gera insights acionáveis com nível de confiança (alto/médio/baixo) e recomendação de ação.",
        scenario: "Exemplo de insight: 'Padrão suspeito detectado: 4 agentes no grupo Financeiro executaram PowerShell.exe com argumentos codificados em Base64 nas últimas 2h. Confiança: Alta. Recomendação: Investigar e bloquear execução de scripts não-assinados.'",
      },
      {
        title: "Baseline comportamental — Setup e calibração",
        content: "O sistema observa cada agente por 7 dias (período de calibração) para estabelecer o baseline: padrões normais de CPU (ex: 15-30% das 9h-18h), uso de rede (ex: 50-200MB/dia), processos típicos (ex: chrome.exe, excel.exe, outlook.exe), horários de atividade e padrão de I/O de disco. Após calibração, desvios >2 desvios padrão geram alertas.",
        tip: "Durante o período de calibração (primeiros 7 dias), o sistema gera muitos 'learning alerts' (informativos). Isso é normal — a IA está aprendendo o comportamento. Após 7 dias, apenas anomalias reais geram alertas.",
        code: "# Métricas coletadas para baseline:\n{\n  \"cpu_usage\": { \"mean\": 22.5, \"std\": 8.3, \"p95\": 45.2 },\n  \"network_tx_mb\": { \"mean\": 85.0, \"std\": 32.1, \"p95\": 180.5 },\n  \"unique_processes\": { \"mean\": 48, \"std\": 12, \"p95\": 78 },\n  \"disk_write_mb\": { \"mean\": 120.0, \"std\": 55.8, \"p95\": 320.0 },\n  \"active_hours\": \"08:30-18:30\",\n  \"typical_processes\": [\"chrome.exe\", \"excel.exe\", \"outlook.exe\"]\n}\n\n# Alerta gerado quando:\n# - CPU > mean + 2*std por > 15 min\n# - Rede > p95 por > 30 min\n# - Processo nunca visto antes executado",
      },
      {
        title: "Detecção de Shadow IT",
        content: "O módulo Shadow IT analisa: conexões de rede para identificar SaaS não-aprovados (compara com lista de serviços conhecidos), processos de aplicações não-catalogadas, extensões de browser com permissões excessivas e dispositivos USB conectados. Cada descoberta é categorizada: Risco Crítico (compartilhamento de arquivos, VPN pessoal), Risco Alto (messaging não-corporativo), Risco Médio (apps de produtividade), Risco Baixo (utilitários).",
        scenario: "Exemplo: O módulo detecta que 8 máquinas acessam regularmente 'mega.nz' (compartilhamento de arquivos pessoal). Risco: Alto (possível exfiltração de dados). Ação sugerida: bloquear no firewall e notificar gestor da equipe.",
      },
      {
        title: "Simulação de ataques (Red Team automatizado)",
        content: "Execute simulações controladas sem risco real: (1) Phishing simulado — envia e-mails de teste e mede quem clica. (2) Escalação de privilégios — testa se usuários podem obter admin. (3) Varredura de portas — identifica serviços expostos desnecessariamente. (4) Teste de detecção — executa EICAR (arquivo de teste padrão de AV) para validar que o scan está funcionando. (5) Movimentação lateral — testa se credenciais de um endpoint permitem acesso a outros.",
        warning: "Simulações de ataque DEVEM ser comunicadas à equipe de SOC e gestão ANTES da execução. Sem comunicação prévia, a equipe pode iniciar resposta a incidente real, desperdiçando recursos.",
        code: "# Teste EICAR (padrão da indústria para testar AV):\n# Crie um arquivo .txt com este conteúdo exato:\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n\n# O CyberShield DEVE detectar e quarentinar este arquivo\n# Se NÃO detectar, há um problema na configuração do scan\n\n# Salve como: eicar-test.com\n# Resultado esperado: detecção imediata como 'EICAR-Test-File'",
      },
      {
        title: "Resposta automatizada a ransomware",
        content: "O playbook de ransomware executa em sequência: (1) Detecção — monitora padrões de criptografia anômala (>50 arquivos modificados/min com entropia alta). (2) Isolamento — desconecta o endpoint da rede via firewall do agente (<30 segundos). (3) Snapshot — captura estado do sistema: processos, conexões de rede, arquivos modificados. (4) Notificação — alerta admin via todos os canais (in-app, e-mail, WhatsApp). (5) Verificação lateral — analisa outros endpoints para sinais de propagação. (6) Preservação de evidências — logs, timeline e samples são salvos para forense.",
      },
      {
        title: "Security Graph — Visualização de relações",
        content: "O Security Graph é uma visualização interativa de nós e conexões: agentes (nós azuis), ameaças (nós vermelhos), usuários (nós verdes), incidentes (nós laranjas). Conexões mostram relações: 'agente X detectou ameaça Y', 'usuário Z logou em agente X', 'ameaça Y se propagou de agente X para W'. Use para: rastrear propagação, identificar agentes mais expostos e correlacionar incidentes.",
        scenario: "Exemplo: O Security Graph mostra que a ameaça 'Emotet' foi detectada em 3 agentes que compartilham o mesmo servidor de arquivos. Isso indica que o ponto de infecção é o file server, não os endpoints individuais.",
      },
    ],
    troubleshooting: [
      {
        problem: "Muitos falsos positivos de anomalia comportamental",
        cause: "Baseline calibrado em período atípico (ex: férias, manutenção) ou atividade legítima nova não-conhecida.",
        solution: "1) Recalibre o baseline: Agente → Baseline → 'Recalibrar' (reinicia período de 7 dias). 2) Adicione exceções para padrões legítimos conhecidos. 3) Ajuste o multiplicador de threshold de 2σ para 3σ (menos sensível) em Admin → IA → Sensibilidade.",
      },
    ],
  },
  {
    id: "incident-response",
    title: "Resposta a Incidentes de Segurança",
    description: "Playbooks passo-a-passo para responder a incidentes: detecção, contenção, erradicação, recuperação e lições aprendidas.",
    category: "seguranca",
    difficulty: "expert",
    estimatedTime: "30 min",
    tags: ["incidente", "resposta", "forense", "contenção", "recuperação", "playbook"],
    prerequisites: ["virus-scans", "threat-intelligence"],
    videoId: "incident-response",
    steps: [
      {
        title: "Fase 1: Detecção e triagem",
        content: "Quando um alerta é gerado, inicie a triagem: (1) Confirme que é um incidente real (não falso positivo). (2) Classifique a severidade: P1 (crítico — ransomware, exfiltração ativa), P2 (alto — malware com propagação), P3 (médio — malware isolado), P4 (baixo — PUP, adware). (3) Documente o horário de detecção, agentes afetados e tipo de ameaça no sistema de notas do incidente.",
        tip: "Regra de ouro da triagem: Se em dúvida sobre a severidade, classifique uma categoria ACIMA. É melhor mobilizar recursos demais do que de menos.",
      },
      {
        title: "Fase 2: Contenção imediata",
        content: "Para P1/P2: Agente → Ações → 'Isolar da Rede' (mantém comunicação com CyberShield, bloqueia tudo mais). Para P3: Quarentena automática do arquivo + monitoramento intensivo do endpoint. Para P4: Log e acompanhamento. Em TODOS os casos: bloquear hash SHA-256 da ameaça na whitelist reversa (blacklist) para prevenir execução em outros endpoints.",
        warning: "NUNCA desligue o endpoint durante a contenção! Desligar destrói evidências em memória (processos, conexões de rede, chaves de criptografia de ransomware). Isole da rede, mas mantenha ligado.",
      },
      {
        title: "Fase 3: Investigação e escopo",
        content: "Com o endpoint contido: (1) Analise o timeline de eventos: Agente → Evidências → Timeline (ordenada por timestamp). (2) Identifique o vetor de ataque: e-mail? USB? download? exploração de vulnerabilidade? (3) Verifique propagação lateral: Security Graph → filtrar por ameaça → ver agentes conectados. (4) Colete IOCs (Indicators of Compromise): hashes, IPs, domínios, nomes de arquivo.",
        code: "# IOCs a coletar e documentar:\n{\n  \"file_hashes\": [\n    \"sha256:a1b2c3d4e5f6...\",\n    \"md5:1a2b3c4d...\"\n  ],\n  \"malicious_ips\": [\"185.143.xxx.xxx\", \"91.234.xxx.xxx\"],\n  \"malicious_domains\": [\"evil-c2.example.com\"],\n  \"affected_files\": [\"/path/to/encrypted/*.locked\"],\n  \"affected_users\": [\"usuario@empresa.com\"],\n  \"affected_endpoints\": [\"DESKTOP-001\", \"DESKTOP-002\"],\n  \"attack_vector\": \"Phishing email com anexo .docm\",\n  \"first_seen\": \"2026-03-13T14:32:00-03:00\"\n}",
      },
      {
        title: "Fase 4: Erradicação",
        content: "Remova completamente a ameaça: (1) Quarentena permanente de todos os arquivos maliciosos detectados. (2) Revogue credenciais comprometidas: senhas dos usuários afetados, tokens de API, chaves SSH. (3) Aplique patches para a vulnerabilidade explorada (se aplicável). (4) Atualize assinaturas e regras de detecção com os IOCs coletados.",
      },
      {
        title: "Fase 5: Recuperação monitorada",
        content: "Restaure operações gradualmente: (1) Reconecte o endpoint à rede (remova isolamento). (2) Execute scan completo para confirmar limpeza. (3) Monitore intensivamente por 72h (baseline em modo sensível). (4) Verifique backups — se dados foram criptografados por ransomware, restaure do último backup limpo. (5) Confirme que todas as credenciais foram rotacionadas.",
      },
      {
        title: "Fase 6: Lições aprendidas e prevenção",
        content: "Após resolução: (1) Documente o incidente completo: timeline, ações tomadas, tempo de resposta. (2) Identifique gaps: detecção demorou? contenção foi rápida? (3) Atualize políticas de segurança. (4) Compartilhe IOCs com comunidade/CERT.br. (5) Conduza treinamento com a equipe sobre o vetor de ataque (ex: treinamento anti-phishing se vetor foi e-mail).",
        tip: "Faça uma reunião de 'Post-Mortem' em até 5 dias após o incidente, com todos os envolvidos. Foque em melhorias de processo, não em culpabilizar pessoas.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // AUTOMAÇÃO
  // ═══════════════════════════════════════════════════════
  {
    id: "jobs-automation",
    title: "Jobs e Automação Avançada",
    description: "Crie jobs complexos, configure automação com blast radius, remediação inteligente e integração com pipelines de CI/CD.",
    category: "automacao",
    difficulty: "intermediate",
    estimatedTime: "18 min",
    tags: ["jobs", "automação", "agendamento", "remediação", "blast radius"],
    steps: [
      {
        title: "Tipos de job e quando usar cada um",
        content: "7 tipos disponíveis: (1) Scan de Vírus — detecção de malware (rápido, completo, custom). (2) Coleta de Inventário — lista software instalado, versões e patches. (3) Verificação de Integridade — valida checksums de arquivos do sistema. (4) Coleta de Certificados — mapeia SSL/TLS instalados com datas. (5) Análise de Rede — portas abertas, conexões ativas, DNS. (6) Compliance Check — verifica conformidade com políticas. (7) Script Customizado — executa PowerShell/Bash controlado (somente admin).",
        scenario: "Exemplo de rotina semanal automatizada:\n- Segunda 6h: Compliance Check (todos)\n- Terça 6h: Coleta de Inventário (estações)\n- Quarta 6h: Análise de Rede (servidores)\n- Quinta 6h: Coleta de Certificados (servidores web)\n- Sexta 6h: Verificação de Integridade (servidores críticos)\n- Sábado 2h: Scan Completo (todos)",
      },
      {
        title: "Criar job com targeting inteligente",
        content: "No Criador de Jobs, targets suportam: agente individual, múltiplos agentes (multi-select), grupo inteiro, múltiplos grupos, tag-based (ex: 'todos com tag pci-scope'), filtro dinâmico (ex: 'todos agentes Windows Server com >85% de disco'). Tags e filtros dinâmicos são especialmente úteis para ambientes grandes.",
        tip: "Use tags para targeting dinâmico: adicione tag 'needs-patch' a agentes que precisam de atualização e crie um job targeting 'tag:needs-patch'. Quando o patch é aplicado, remova a tag automaticamente.",
      },
      {
        title: "Blast Radius — Controle de impacto",
        content: "O blast radius limita quantos agentes são afetados simultaneamente: Em horário comercial (8h-18h): máximo 10% dos agentes do grupo. Fora do horário: até 50%. Finais de semana: até 80%. Para ações manuais do admin: configurável (1% a 100%). Isso previne que uma ação incorreta (ex: regra de firewall errada) derrube toda a infraestrutura de uma vez.",
        code: "# Configuração de Blast Radius (Admin → Políticas → Controle de Impacto):\n{\n  \"business_hours\": {\n    \"start\": \"08:00\",\n    \"end\": \"18:00\",\n    \"max_percent\": 10,\n    \"days\": [1, 2, 3, 4, 5]\n  },\n  \"off_hours\": {\n    \"max_percent\": 50\n  },\n  \"weekends\": {\n    \"max_percent\": 80\n  },\n  \"manual_override\": {\n    \"max_percent\": 100,\n    \"requires_mfa\": true,\n    \"requires_approval\": true\n  }\n}",
        warning: "Para ações com blast radius de 100% (todos os agentes simultaneamente), o sistema exige: MFA do admin + aprovação de segundo admin. Isso é um safety net contra erros catastróficos.",
      },
      {
        title: "Automação com remediação inteligente",
        content: "Configure ações automáticas escalonadas por severidade: Baixa → log apenas. Média → quarentena + notificação ao operador. Alta → quarentena + notificação ao admin + verificação lateral. Crítica → isolamento de rede + notificação imediata (WhatsApp/SMS) + snapshot forense + início do playbook de incidente.",
      },
      {
        title: "Monitoramento de jobs e alertas de falha",
        content: "Dashboard de jobs exibe: fila de execução com prioridade, jobs em andamento com progresso %, histórico com filtros (últimas 24h, 7d, 30d), métricas agregadas (taxa de sucesso, tempo médio de execução). Para jobs falhos: clique para ver log detalhado com mensagem de erro, agentes afetados e sugestão de correção.",
        tip: "Configure alerta automático para taxa de falha >20% em jobs agendados. Isso indica problema sistêmico (ex: agentes offline, permissão insuficiente, recurso indisponível).",
      },
    ],
  },
  {
    id: "notifications-alerts",
    title: "Notificações, Alertas e Escalonamento",
    description: "Configure canais de notificação, regras de alerta personalizadas, escalonamento automático e quiet hours para evitar alert fatigue.",
    category: "automacao",
    difficulty: "beginner",
    estimatedTime: "10 min",
    tags: ["notificações", "alertas", "e-mail", "escalonamento", "quiet hours"],
    steps: [
      {
        title: "4 canais de notificação disponíveis",
        content: "In-App (sino no painel — sempre ativo, mostra badge com contagem), Push Browser (notificações do navegador — requer permissão), E-mail (para alertas configuráveis — suporta SMTP customizado) e Integrações (Slack, Teams, WhatsApp — para alertas críticos em tempo real).",
        tip: "Para operações 24/7, configure WhatsApp para alertas P1/P2 e e-mail para P3/P4. Assim, alertas críticos chegam imediatamente no celular do plantonista.",
      },
      {
        title: "Criar regras de alerta granulares",
        content: "Admin → Alertas → 'Nova Regra'. Defina: condição (ex: 'ameaça severidade = crítica'), canal de notificação, destinatários e horário ativo. Exemplos: 'Ransomware detectado → WhatsApp imediato para admin + operador', 'Agente offline > 2h → e-mail para operador', 'Compliance < 80% → relatório semanal para gestor'.",
        code: "# Exemplo de regras recomendadas:\n\n# Regra 1: Ameaça Crítica\nCondição: severity == 'critical'\nCanal: WhatsApp + E-mail + In-App\nDestinatários: Admin, SOC Lead\nHorário: 24/7\nEscalonamento: Se não reconhecido em 15 min → Super Admin\n\n# Regra 2: Agente Offline\nCondição: agent.status == 'offline' AND duration > '2h'\nCanal: E-mail + In-App\nDestinatários: Operador do grupo\nHorário: Apenas horário comercial\n\n# Regra 3: Compliance Baixo\nCondição: compliance_score < 80\nCanal: E-mail semanal (digest)\nDestinatários: Gestor de TI\nHorário: Segunda-feira 9h",
      },
      {
        title: "Escalonamento automático multi-nível",
        content: "Configure escalonamento temporal: Nível 1 (0-15 min) → Operador de plantão. Nível 2 (15-30 min, se não reconhecido) → Admin do grupo. Nível 3 (30-60 min) → Head de TI. Nível 4 (>60 min) → CTO/CISO. Cada nível pode ter canais diferentes (nível 1: in-app, nível 4: ligação telefônica).",
      },
      {
        title: "Quiet Hours e agrupamento inteligente",
        content: "Evite 'alert fatigue' com: Quiet Hours (23h-7h: apenas alertas P1/P2 enviam notificação, P3/P4 são agrupados e enviados como digest às 8h), Agrupamento (múltiplas detecções do mesmo tipo são consolidadas: '5 endpoints detectaram Trojan.XYZ' em vez de 5 alertas separados), Rate Limiting (máximo 10 alertas/hora por canal, exceto P1).",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // ADMINISTRAÇÃO
  // ═══════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════
  // RELATÓRIOS
  // ═══════════════════════════════════════════════════════
  {
    id: "reports-export",
    title: "Relatórios, Laudos Verificáveis e Exportação",
    description: "Gere relatórios executivos em PDF, exporte dados em CSV/Excel, crie laudos com hash verificável e automatize entregas.",
    category: "relatorios",
    difficulty: "intermediate",
    estimatedTime: "12 min",
    tags: ["relatórios", "PDF", "CSV", "Excel", "laudos", "auditoria"],
    steps: [
      {
        title: "Relatório Executivo PDF — Conteúdo e customização",
        content: "O relatório executivo inclui: capa com logotipo e data, resumo executivo (2 parágrafos com principais achados), KPIs do período (com gráficos de tendência), top 10 ameaças detectadas com detalhes, status de compliance por política, lista de agentes problemáticos, recomendações automáticas da IA (priorizadas por impacto) e footer com hash de integridade.",
        scenario: "Exemplo: CTO gera relatório mensal para o board. O PDF de 12 páginas mostra: compliance de 91% (↑5% vs. mês anterior), 23 ameaças detectadas e remediadas (100% resolução), 2 recomendações da IA implementadas e ROI estimado de R$ 45.000 em incidentes prevenidos.",
      },
      {
        title: "Exportação CSV com filtros aplicados",
        content: "Cada tab do dashboard tem botão 'Exportar CSV'. O CSV respeita os filtros aplicados: se você filtrou 'agentes offline dos últimos 7 dias', o CSV conterá apenas esses dados. Colunas incluem todos os campos visíveis + campos técnicos adicionais (IDs, timestamps UTC, hashes). Encoding: UTF-8 BOM (compatível com Excel).",
      },
      {
        title: "Exportação Excel avançada (.xlsx)",
        content: "Para análises complexas, exporte em Excel: múltiplas abas (Resumo, Agentes, Jobs, Ameaças, Compliance), gráficos embutidos, formatação condicional (células vermelhas para problemas), filtros automáticos e tabela dinâmica pronta para uso. Gerado via ExcelJS com template profissional.",
      },
      {
        title: "Laudos com hash verificável publicamente",
        content: "Cada relatório gera um laudo com: código único (ex: LAUDO-2026-0313-ABC123), hash SHA-256 do conteúdo (garante que não foi adulterado), QR Code com link de verificação e assinatura digital do sistema. Qualquer pessoa pode verificar em /verificar-laudo inserindo o código — útil para auditores, reguladores e processos legais.",
        tip: "Ao enviar relatórios para auditoria externa, sempre inclua o link de verificação do laudo. Isso demonstra profissionalismo e garante a integridade do documento.",
      },
      {
        title: "Automação de entregas (relatórios agendados)",
        content: "Admin → Relatórios → 'Agendar Entrega'. Configure: tipo de relatório, frequência (diário, semanal, mensal), destinatários (e-mails), formato (PDF/Excel) e filtros. Exemplo: 'Relatório executivo PDF mensal para cto@empresa.com no dia 1 de cada mês às 8h'.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // INTEGRAÇÕES AVANÇADAS
  // ═══════════════════════════════════════════════════════
  {
    id: "siem-integration",
    title: "Integração com SIEM (Splunk, QRadar, Elastic)",
    description: "Configure integração completa com seu SIEM: formatos de log, filtros de eventos, troubleshooting e otimização de performance.",
    category: "admin",
    difficulty: "expert",
    estimatedTime: "20 min",
    tags: ["SIEM", "Splunk", "QRadar", "Elastic", "syslog", "integração"],
    prerequisites: ["admin-panel"],
    videoId: "siem-integration",
    steps: [
      {
        title: "Arquitetura da integração",
        content: "O CyberShield envia eventos para o SIEM via: Syslog (TCP/UDP, porta configurável — padrão 514) ou API REST (HTTPS, autenticação via token). Eventos são enviados em near real-time (delay <30s). Suporta formatos: CEF (Common Event Format — padrão para SIEMs), LEEF (Log Event Extended Format — IBM QRadar) e JSON (Elastic/Splunk HEC).",
      },
      {
        title: "Configurar Syslog (Splunk/QRadar)",
        content: "Admin → Integrações → SIEM → 'Syslog'. Configure: IP do servidor Syslog (ex: siem.empresa.local), porta (514 para UDP, 6514 para TCP+TLS), protocolo (UDP para melhor performance, TCP+TLS para garantia de entrega com criptografia), formato (CEF para QRadar, CEF ou JSON para Splunk) e facility/severity mapping.",
        code: "# Configuração recomendada para Splunk:\nProtocolo: TCP+TLS (porta 6514)\nFormato: JSON\nFacility: LOCAL0\nFiltro: severity >= medium\n\n# Exemplo de evento JSON para Splunk:\n{\n  \"timestamp\": \"2026-03-13T14:32:00.000Z\",\n  \"source\": \"cybershield\",\n  \"sourcetype\": \"cybershield:security\",\n  \"event\": {\n    \"type\": \"malware_detected\",\n    \"severity\": \"critical\",\n    \"agent\": { \"hostname\": \"SRV-DB01\", \"ip\": \"10.0.2.10\" },\n    \"threat\": { \"name\": \"Ransom.WannaCry\", \"hash\": \"a1b2c3...\" },\n    \"action\": \"quarantined\"\n  }\n}\n\n# Configuração para QRadar:\nProtocolo: TCP (porta 514)\nFormato: LEEF\nLog Source Type: Universal LEEF\nFiltro: todos os eventos de segurança",
      },
      {
        title: "Configurar API REST (Elastic/Custom)",
        content: "Para Elastic Stack (ELK) ou SIEMs com HTTP input: Admin → Integrações → SIEM → 'API REST'. Configure: URL do endpoint (ex: https://elastic.empresa.local:9200/cybershield/_doc), método (POST), headers (Authorization: Bearer xxx) e batch size (eventos agrupados em lotes de 100 para otimizar performance).",
      },
      {
        title: "Filtrar eventos enviados ao SIEM",
        content: "Não envie TUDO para o SIEM — isso sobrecarrega armazenamento e dificulta análise. Recomendação: envie apenas eventos de severidade média+, excluindo: heartbeats de agente (alto volume, baixo valor), métricas de hardware periódicas e scans sem detecção (exceto scan completo — envie resultado 'limpo' para compliance).",
      },
      {
        title: "Testar e validar a integração",
        content: "Use o botão 'Enviar Evento de Teste' para validar: 1) Verifique no SIEM se o evento chegou. 2) Confirme parsing correto dos campos. 3) Valide que dashboards/alertas do SIEM reconhecem os eventos. 4) Execute um scan com EICAR para gerar detecção real e verificar o fluxo completo.",
      },
    ],
    troubleshooting: [
      {
        problem: "Eventos não chegam ao SIEM",
        cause: "Firewall bloqueando a porta, certificado TLS inválido ou credenciais de API incorretas.",
        solution: "1) Teste conectividade: telnet siem.empresa.local 514. 2) Para TLS: verifique se o certificado do SIEM é confiável ou adicione como exceção. 3) Use o botão 'Testar Conexão' no painel. 4) Verifique logs do SIEM para erros de parsing.",
      },
      {
        problem: "Eventos chegam mas não são parseados corretamente",
        cause: "Formato de log incompatível com o log source configurado no SIEM.",
        solution: "1) Verifique se o formato (CEF/LEEF/JSON) corresponde ao esperado pelo SIEM. 2) No QRadar: verifique o Log Source Type. 3) No Splunk: verifique o sourcetype. 4) Use o evento de teste para comparar formato enviado vs. esperado.",
      },
    ],
  },
  {
    id: "api-integration",
    title: "API REST do CyberShield — Referência Técnica",
    description: "Guia completo da API REST: autenticação, endpoints, rate limiting, webhooks e exemplos práticos de integração.",
    category: "admin",
    difficulty: "expert",
    estimatedTime: "25 min",
    tags: ["API", "REST", "webhooks", "integração", "automação", "desenvolvimento"],
    prerequisites: ["admin-panel"],
    videoId: "api-integration",
    steps: [
      {
        title: "Autenticação e API Keys",
        content: "A API usa autenticação via Bearer Token (JWT). Gere um API Key em Admin → Integrações → 'API Keys'. Cada key tem: nome descritivo, permissões (read, write, admin), IP whitelist opcional e data de expiração. Inclua o token no header: Authorization: Bearer <token>.",
        code: "# Exemplo de requisição autenticada:\ncurl -X GET https://api.cybershield.com.br/v1/agents \\\n  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiI...' \\\n  -H 'Content-Type: application/json'\n\n# Resposta (200 OK):\n{\n  \"data\": [\n    {\n      \"id\": \"agt_abc123\",\n      \"hostname\": \"DESKTOP-001\",\n      \"status\": \"online\",\n      \"os\": \"Windows 11 Pro 23H2\",\n      \"agent_version\": \"2.5.1\",\n      \"last_heartbeat\": \"2026-03-13T14:30:00Z\"\n    }\n  ],\n  \"meta\": { \"total\": 45, \"page\": 1, \"per_page\": 20 }\n}",
        warning: "API Keys são segredos sensíveis. Nunca exponha em código frontend, repositórios públicos ou logs. Use variáveis de ambiente (secrets) em código backend.",
      },
      {
        title: "Endpoints principais",
        content: "Endpoints disponíveis: GET /v1/agents (listar agentes), GET /v1/agents/:id (detalhes de um agente), POST /v1/jobs (criar job), GET /v1/jobs/:id (status do job), GET /v1/threats (listar ameaças), POST /v1/scans (iniciar scan), GET /v1/compliance/score (score de compliance), GET /v1/reports (listar relatórios) e POST /v1/reports/generate (gerar novo relatório).",
        code: "# Exemplos de uso da API:\n\n# Listar agentes offline:\nGET /v1/agents?status=offline&per_page=100\n\n# Criar job de scan rápido:\nPOST /v1/jobs\n{\n  \"type\": \"virus_scan\",\n  \"scan_type\": \"quick\",\n  \"target_agents\": [\"agt_abc123\", \"agt_def456\"],\n  \"on_detection\": \"quarantine\"\n}\n\n# Obter score de compliance:\nGET /v1/compliance/score\n# Resposta: { \"overall\": 87.5, \"by_policy\": {...} }\n\n# Gerar relatório PDF:\nPOST /v1/reports/generate\n{\n  \"type\": \"executive\",\n  \"format\": \"pdf\",\n  \"period\": \"30d\",\n  \"send_to\": [\"cto@empresa.com\"]\n}",
      },
      {
        title: "Webhooks — Notificações em tempo real",
        content: "Configure webhooks para receber eventos em seus sistemas: Admin → Integrações → Webhooks → 'Novo'. Defina: URL de destino (HTTPS obrigatório), secret para validação HMAC, eventos a receber (threat.detected, agent.offline, job.completed, etc.) e retry policy (3 tentativas com backoff exponencial).",
        code: "# Exemplo de webhook recebido (threat.detected):\nPOST https://seu-sistema.com/webhooks/cybershield\nHeaders:\n  X-CyberShield-Signature: sha256=abc123...\n  Content-Type: application/json\n\nBody:\n{\n  \"event\": \"threat.detected\",\n  \"timestamp\": \"2026-03-13T14:32:00Z\",\n  \"data\": {\n    \"threat_id\": \"thr_xyz789\",\n    \"agent\": \"DESKTOP-001\",\n    \"threat_name\": \"Trojan.GenericKD.12345\",\n    \"severity\": \"critical\",\n    \"file_path\": \"C:\\\\Users\\\\user\\\\Downloads\\\\update.exe\",\n    \"action_taken\": \"quarantined\"\n  }\n}\n\n# Validar assinatura HMAC (Python):\nimport hmac, hashlib\nexpected = hmac.new(webhook_secret.encode(), body.encode(), hashlib.sha256).hexdigest()\nassert request.headers['X-CyberShield-Signature'] == f'sha256={expected}'",
      },
      {
        title: "Rate Limiting e boas práticas",
        content: "Limites: Auth endpoints (10/min), Mutation endpoints (30/min), Read endpoints (100/min), Export endpoints (5/5min). Headers de resposta incluem: X-RateLimit-Remaining e X-RateLimit-Reset. Para alto volume: use pagination (per_page=100), cache respostas de read (TTL 60s) e agrupe mutations em batch quando possível.",
      },
    ],
  },
];

// ─── FAQ Data ────────────────────────────────────────────
export const faqs: FAQ[] = [
  { question: "O CyberShield funciona em quais sistemas operacionais?", answer: "Agente: Windows 10/11, Windows Server 2016+, Ubuntu 20.04+, CentOS 7+, Debian 11+, Amazon Linux 2/2023. Painel web: Chrome, Firefox, Edge, Safari — desktop e mobile. Apps nativos: roadmap para 2027.", category: "geral" },
  { question: "Quantos agentes posso instalar?", answer: "Starter: 25 agentes, Professional: 100, Enterprise: ilimitado. Agentes arquivados não contam. Upgrade instantâneo pelo painel. Para >500 agentes, pricing personalizado via comercial.", category: "planos" },
  { question: "Como funciona a detecção de ameaças?", answer: "4 camadas: (1) Assinaturas — base atualizada diariamente com 15M+ de assinaturas. (2) Heurística — detecta malware desconhecido por padrão de comportamento. (3) IA/ML — baseline comportamental por agente, detecta anomalias estatísticas. (4) Threat Intelligence — feeds de IOCs globais em tempo real.", category: "seguranca" },
  { question: "Os dados são criptografados?", answer: "Trânsito: TLS 1.3 em todas as comunicações. Repouso: AES-256 no banco de dados. HMAC keys: vault isolado com rotação automática a cada 90 dias. Backups: criptografados e georedundantes. Certificados: renovação automática via Let's Encrypt.", category: "seguranca" },
  { question: "Como exportar relatórios para auditoria?", answer: "3 formatos: CSV (granular, para BI), PDF (executivo, com gráficos), Excel (múltiplas abas). Todos incluem hash SHA-256 verificável publicamente em /verificar-laudo. Entregas automáticas agendáveis por e-mail (diário/semanal/mensal).", category: "relatorios" },
  { question: "O sistema é compatível com LGPD?", answer: "Sim: mapeamento de dados pessoais, RIPD (Relatório de Impacto), controle de retenção com exclusão automática, audit trail imutável, RBAC (controles de acesso por role), consent management e relatórios LGPD exportáveis em PDF.", category: "compliance" },
  { question: "Como funciona o suporte técnico?", answer: "Starter: e-mail (SLA 48h) + base de conhecimento 24/7. Professional: e-mail (SLA 24h) + chat in-app (horário comercial). Enterprise: e-mail (SLA 4h) + chat 24/7 + WhatsApp + Customer Success Manager dedicado + onboarding assistido.", category: "suporte" },
  { question: "Posso personalizar com minha marca (White Label)?", answer: "Professional/Enterprise: logotipo, cores, domínio CNAME, favicon, templates de e-mail, footer de PDF. Multi-tenant: white-label independente por tenant (ideal para MSPs).", category: "admin" },
  { question: "O que acontece se um agente ficar offline?", answer: "5min: status 'Sem contato'. 1h: alerta operador. 24h: status 'Crítico' + alerta admin. Tempos configuráveis. Quando volta: sincroniza dados do período offline automaticamente.", category: "agentes" },
  { question: "Como funcionam as notificações?", answer: "4 canais: in-app (sino), push browser, e-mail, integrações (Slack/Teams/WhatsApp). Regras de alerta customizáveis por severidade. Escalonamento automático (15min → 30min → 1h). Quiet hours e agrupamento inteligente anti-fatigue.", category: "geral" },
  { question: "Posso integrar com SIEM externo?", answer: "Sim: Splunk, QRadar, Elastic, Microsoft Sentinel via Syslog (TCP/UDP/TLS) ou API REST. Formatos: CEF, LEEF, JSON. Filtro de eventos configurável. Teste com evento de teste integrado.", category: "integracoes" },
  { question: "Como funciona a quarentena?", answer: "Sandbox criptografada (AES-256) isolada do filesystem. Ações: ver metadata, baixar sample (admin+MFA), verificar em bases externas, remover permanentemente ou restaurar (com justificativa no audit trail). Retenção: 90 dias.", category: "seguranca" },
  { question: "É possível fazer rollback de atualização do agente?", answer: "Sim: Admin → Rollout Policies → 'Reverter Versão'. Rollback progressivo com blast radius configurável. Monitoramento automático pós-rollback. Versões anteriores mantidas por 30 dias.", category: "agentes" },
  { question: "Como funciona o blast radius?", answer: "Limita impacto de ações automáticas: horário comercial 10%, fora 50%, manual até 100% (requer MFA + segunda aprovação). Previne que erro em uma regra derrube toda a infraestrutura.", category: "seguranca" },
  { question: "Qual o tamanho máximo de arquivo para scan?", answer: "Padrão: 500MB (configurável). Arquivos compactados: descompactação até 3 níveis. Extensões excluíveis. Para ISO/VMDK: recomendamos excluir do scan regular e fazer scan dedicado.", category: "seguranca" },
  { question: "A API tem rate limiting?", answer: "Sim: Auth 10/min, Mutations 30/min, Reads 100/min, Exports 5/5min. Headers X-RateLimit-Remaining e X-RateLimit-Reset incluídos. Para necessidades maiores, contate suporte para ajuste.", category: "integracoes" },
  { question: "Como funciona a resposta automática a ransomware?", answer: "Detecta criptografia anômala (>50 arquivos/min com alta entropia), isola endpoint em <30s, captura snapshot forense, notifica admin em todos os canais, verifica propagação lateral e inicia playbook automatizado.", category: "seguranca" },
];

// ─── Categories ──────────────────────────────────────────
export const categories = [
  { id: "all", label: "Todos" },
  { id: "inicio", label: "Início Rápido" },
  { id: "dashboard", label: "Dashboard" },
  { id: "agentes", label: "Agentes" },
  { id: "seguranca", label: "Segurança" },
  { id: "automacao", label: "Automação" },
  { id: "admin", label: "Administração" },
  { id: "relatorios", label: "Relatórios" },
];

export const difficultyConfig = {
  beginner: { label: "Iniciante", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  intermediate: { label: "Intermediário", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  advanced: { label: "Avançado", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  expert: { label: "Expert", color: "bg-red-500/10 text-red-400 border-red-500/20" },
};

export const quickStartCards = [
  { title: "Instalar Agente", desc: "Configure seu primeiro endpoint em 5 min", tutorialId: "getting-started" },
  { title: "Primeiro Scan", desc: "Execute verificação de segurança completa", tutorialId: "virus-scans" },
  { title: "Convidar Equipe", desc: "Adicione membros com permissões", tutorialId: "user-management" },
  { title: "Gerar Relatório", desc: "Crie relatório executivo em PDF", tutorialId: "reports-export" },
  { title: "Configurar Alertas", desc: "Nunca perca um evento crítico", tutorialId: "notifications-alerts" },
  { title: "Integrar SIEM", desc: "Envie eventos para seu SIEM", tutorialId: "siem-integration" },
];
