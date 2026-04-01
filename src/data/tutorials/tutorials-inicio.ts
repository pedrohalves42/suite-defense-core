import type { Tutorial } from './types';

/** Tutoriais: Início Rápido */
export const tutorialsInicio: Tutorial[] = [
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
];
