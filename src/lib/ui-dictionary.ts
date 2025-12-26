// UI Labels dictionary for humanized, non-technical interface
// All labels are in Brazilian Portuguese for end-users

export const UI_LABELS = {
  // Security metrics - translating technical terms
  rate_limit: {
    label: 'Tentativas Bloqueadas',
    tooltip: 'Acessos suspeitos que foram bloqueados automaticamente',
    description: 'bloqueios de proteção'
  },
  replay_attempts: {
    label: 'Ataques Repetidos',
    tooltip: 'Tentativas de reutilizar credenciais antigas',
    description: 'detectados'
  },
  failed_logins: {
    label: 'Senhas Incorretas',
    tooltip: 'Tentativas de login com senha errada',
    description: 'tentativas'
  },
  blocked_ips: {
    label: 'Origens Bloqueadas',
    tooltip: 'Endereços de internet que foram bloqueados por comportamento suspeito',
    description: 'ativos'
  },
  critical_events: {
    label: 'Alertas Importantes',
    tooltip: 'Eventos de segurança que precisam de atenção',
    description: 'no período'
  },
  agents_offline: {
    label: 'Computadores Desligados',
    tooltip: 'Computadores que não se comunicaram recentemente',
    description: 'sem conexão recente'
  },

  // IP and network terms
  ip_address: {
    label: 'Origem',
    tooltip: 'De onde veio a tentativa de acesso'
  },
  endpoint: {
    label: 'Destino',
    tooltip: 'Para onde ia o acesso'
  },

  // Severity levels with emojis for visual impact
  severity: {
    critical: { 
      label: '🔴 Urgente', 
      emoji: '🔴',
      description: 'Risco alto - precisa de ação imediata',
      badgeClass: 'bg-red-500'
    },
    high: { 
      label: '🟠 Importante', 
      emoji: '🟠',
      description: 'Resolva hoje se possível',
      badgeClass: 'bg-orange-500'
    },
    medium: { 
      label: '🟡 Atenção', 
      emoji: '🟡',
      description: 'Quando tiver tempo',
      badgeClass: 'bg-yellow-500'
    },
    low: { 
      label: '🟢 Baixo', 
      emoji: '🟢',
      description: 'Apenas informativo',
      badgeClass: 'bg-blue-500'
    },
    info: {
      label: 'ℹ️ Informação',
      emoji: 'ℹ️',
      description: 'Para seu conhecimento',
      badgeClass: 'bg-gray-500'
    }
  },

  // Attack types - humanized
  attack_types: {
    'rate_limit': 'Acesso muito frequente',
    'brute_force': 'Tentativa de adivinhar senha',
    'sql_injection': 'Tentativa de invadir banco de dados',
    'xss': 'Tentativa de injetar código malicioso',
    'unauthorized_access': 'Acesso não autorizado',
    'suspicious_activity': 'Atividade suspeita',
    'invalid_token': 'Credencial inválida',
    'expired_token': 'Sessão expirada'
  },

  // Page titles and descriptions
  pages: {
    security_monitoring: {
      title: 'Proteção em Tempo Real',
      description: 'Veja como seu sistema está sendo protegido contra ameaças'
    },
    vulnerability_findings: {
      title: 'Atualizações de Segurança',
      description: 'Programas que precisam de atualização para manter seu sistema seguro'
    },
    agent_health: {
      title: 'Status dos Computadores',
      description: 'Veja se todos os seus computadores estão protegidos'
    }
  },

  // Dashboard humanized terms
  dashboard: {
    security_score: {
      title: 'Nota de Segurança',
      description: 'Essa nota mostra o quanto seus computadores estão protegidos',
      calculating: 'Calculando...',
      not_calculated: 'Nota ainda não calculada',
      calculate_prompt: 'Clique para verificar a proteção da sua empresa'
    },
    protection_level: {
      title: 'Nível de Proteção',
      description: 'Mostra se sua empresa está seguindo as melhores práticas de segurança'
    },
    software_origin: {
      title: 'Origem dos Programas',
      description: 'Verifica se os programas instalados são originais e seguros'
    },
    active_licenses: {
      title: 'Licenças Ativas',
      description: 'Cada computador precisa de uma licença para ser protegido'
    },
    abuse_protection: {
      title: 'Proteção contra Abusos',
      description: 'Bloqueia tentativas suspeitas de acesso'
    }
  },

  // Job status humanized
  job_status: {
    completed: { label: '✅ Concluído', description: 'Tarefa executada com sucesso' },
    failed: { label: '❌ Erro', description: 'Tarefa falhou por um problema' },
    failed_timeout: { label: '⏱️ Expirou', description: 'Tarefa não executada porque o computador estava desligado' },
    delivered: { label: '🔄 Em andamento', description: 'Tarefa sendo executada' },
    queued: { label: '⏳ Aguardando', description: 'Tarefa na fila' },
    cancelled: { label: '🚫 Cancelado', description: 'Tarefa cancelada' }
  },

  // Empty states with encouraging messages
  empty_states: {
    no_threats: {
      title: '🎉 Nenhuma ameaça!',
      description: 'Seu sistema está seguro. Nenhum ataque foi detectado neste período.'
    },
    no_vulnerabilities: {
      title: '✅ Tudo atualizado!',
      description: 'Não encontramos falhas de segurança neste computador.'
    },
    no_blocked_ips: {
      title: '✓ Nenhum bloqueio ativo',
      description: 'Nenhuma origem está bloqueada no momento.'
    },
    no_agents: {
      title: 'Nenhum computador cadastrado',
      description: 'Instale o agente de proteção nos computadores para começar.'
    }
  },

  // Contextual help messages
  context_help: {
    rate_limits_high: 'Alguém pode estar tentando acessar seu sistema de forma suspeita. Não se preocupe, os acessos foram bloqueados automaticamente.',
    failed_logins_high: 'Várias tentativas de login falharam. Pode ser alguém tentando adivinhar senhas ou usuários esquecendo suas senhas.',
    vulnerabilities_found: 'Alguns programas têm falhas conhecidas que podem ser exploradas por hackers. Atualize-os quando possível.',
    all_secure: 'Seu sistema está protegido! Continuamos monitorando 24 horas por dia.'
  },

  // Action buttons
  actions: {
    run_scan: 'Verificar Agora',
    unblock_ip: 'Desbloquear',
    acknowledge: 'Entendido',
    fix_now: 'Corrigir Agora',
    view_details: 'Ver Detalhes',
    refresh: 'Atualizar',
    request_fix: 'Solicitar Correção'
  },

  // Time-related
  time: {
    now: 'Agora mesmo',
    seconds_ago: 'segundos atrás',
    minutes_ago: 'minutos atrás',
    hours_ago: 'horas atrás',
    days_ago: 'dias atrás',
    never: 'Nunca'
  },

  // Chart labels
  charts: {
    events_timeline: 'O que aconteceu nas últimas horas',
    events_count: 'Eventos detectados',
    blocked_count: 'Bloqueados automaticamente'
  }
};

// Helper function to get attack type label
export function getAttackTypeLabel(type: string): string {
  return UI_LABELS.attack_types[type as keyof typeof UI_LABELS.attack_types] || type;
}

// Helper function to get severity info
export function getSeverityInfo(severity: string): { label: string; emoji: string; description: string; badgeClass: string } {
  const key = severity.toLowerCase() as keyof typeof UI_LABELS.severity;
  return UI_LABELS.severity[key] || UI_LABELS.severity.info;
}

// Helper function to format time ago in friendly terms
export function formatTimeAgoFriendly(seconds: number): string {
  if (seconds < 60) return UI_LABELS.time.now;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} ${UI_LABELS.time.minutes_ago}`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ${UI_LABELS.time.hours_ago}`;
  return `${Math.floor(seconds / 86400)} ${UI_LABELS.time.days_ago}`;
}
