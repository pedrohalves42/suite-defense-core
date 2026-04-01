import type { Tutorial } from './types';

/** Tutoriais: automacao */
export const tutorials_automacao: Tutorial[] = [
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

];
