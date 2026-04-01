import type { Tutorial } from './types';

/** Tutoriais: agentes */
export const tutorials_agentes: Tutorial[] = [
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

];
