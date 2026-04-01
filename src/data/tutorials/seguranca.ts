import type { Tutorial } from './types';

/** Tutoriais: seguranca */
export const tutorials_seguranca: Tutorial[] = [
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

];
