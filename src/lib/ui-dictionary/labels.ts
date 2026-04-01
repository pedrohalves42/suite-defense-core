// UI Labels dictionary for humanized, non-technical interface
// All labels are in Brazilian Portuguese for end-users
// FONTE ÚNICA DA VERDADE para terminologia de UI

export const UI_LABELS = {
  // ===== AGENT STATUS LABELS (centralized) =====
  agent_status: {
    healthy: {
      label: 'Protegido',
      labelShort: 'OK',
      description: 'Computador online e funcionando normalmente',
      color: 'green'
    },
    warning: {
      label: 'Atenção',
      labelShort: '!',
      description: 'Computador pode estar com problemas de conexão',
      color: 'yellow'
    },
    offline: {
      label: 'Offline',
      labelShort: '—',
      description: 'Computador sem comunicação há mais de 10 minutos',
      color: 'red'
    },
    critical: {
      label: 'Crítico',
      labelShort: '⚠',
      description: 'Computador com alertas de segurança não resolvidos',
      color: 'red'
    },
    never_connected: {
      label: 'Nunca conectou',
      labelShort: '?',
      description: 'Agente instalado mas nunca enviou dados',
      color: 'gray'
    },
    safe_mode: {
      label: 'Modo Protegido',
      labelShort: '🛡',
      description: 'Proteção ativada automaticamente após falhas',
      color: 'orange'
    },
    isolated: {
      label: 'Isolado',
      labelShort: '🔒',
      description: 'Computador bloqueado por motivo de segurança',
      color: 'purple'
    },
    degraded: {
      label: 'Com Restrições',
      labelShort: '↓',
      description: 'Computador com comunicação reduzida temporariamente',
      color: 'amber'
    },
    archived: {
      label: 'Arquivado',
      labelShort: '📦',
      description: 'Computador removido do monitoramento ativo',
      color: 'gray'
    },
    updating: {
      label: 'Atualizando',
      labelShort: '↻',
      description: 'Computador recebendo nova versão do agente',
      color: 'blue'
    }
  },

  // ===== AGENT KPI LABELS (dashboard cards) =====
  agent_kpis: {
    total: 'Computadores',
    protected: 'Protegidos',
    needs_attention: 'Precisam de Atenção',
    offline: 'Offline',
    never_connected: 'Nunca Conectaram',
    with_problems: 'Com Problemas',
    in_safe_mode: 'Em Modo Protegido'
  },

  // ===== PROCESSES TAB MESSAGES =====
  processes: {
    loading: 'Carregando processos...',
    empty: {
      title: 'Monitoramento de Processos',
      description: 'Dados de processos serão exibidos aqui quando disponíveis.',
      requirement: 'Requer agente versão 5.0 ou superior.',
      hint: 'O agente coleta informações sobre CPU, memória e processos ativos automaticamente.'
    },
    error: {
      title: 'Dados indisponíveis',
      description: 'Não foi possível carregar os dados de processos.',
      retry: 'Tente novamente em alguns instantes.'
    }
  },

  // Security metrics
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

  // Severity levels
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

  // Attack types
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

  // Empty states
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

  // Contextual help
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
  },

  // ===== COMPLIANCE REPORT TRANSLATIONS =====
  compliance: {
    verification: {
      sha256_valid: 'Documento não foi alterado',
      sha256_invalid: 'Documento pode ter sido modificado',
      hmac_valid: 'Origem confirmada - documento autêntico',
      hmac_invalid: 'Origem não verificada',
      integrity_valid: 'Este documento é autêntico e não foi alterado',
      integrity_invalid: 'Não foi possível confirmar a autenticidade',
      expired: 'Este documento expirou',
      valid: 'Documento válido e autêntico'
    },
    invariants: {
      rls_active: 'Dados protegidos - só você pode vê-los',
      hmac_auth: 'Comunicação criptografada entre computadores e servidor',
      multi_tenant: 'Suas informações isoladas de outras empresas',
      credential_masking: 'Senhas nunca são armazenadas visíveis',
      fail_closed: 'Sistema se protege automaticamente em caso de problemas',
      dns_filter: 'Sites perigosos são bloqueados automaticamente'
    },
    risk: {
      MÍNIMO: {
        label: 'Excelente',
        emoji: '🟢',
        description: 'Sua empresa está muito bem protegida',
        action: 'Continue assim! Monitore regularmente.'
      },
      BAIXO: {
        label: 'Bom',
        emoji: '🟢',
        description: 'Segurança adequada com pequenas melhorias possíveis',
        action: 'Revise os pontos sugeridos quando puder.'
      },
      MÉDIO: {
        label: 'Atenção',
        emoji: '🟡',
        description: 'Alguns pontos precisam de atenção',
        action: 'Resolva os itens marcados esta semana.'
      },
      ALTO: {
        label: 'Preocupante',
        emoji: '🟠',
        description: 'Problemas importantes identificados',
        action: 'Ação recomendada nas próximas 48 horas.'
      },
      CRÍTICO: {
        label: 'Urgente',
        emoji: '🔴',
        description: 'Situação crítica - ação imediata necessária',
        action: 'Resolva os problemas críticos hoje.'
      }
    },
    sections: {
      executive_summary: 'Resumo em linguagem simples do estado de segurança da sua empresa',
      invariants: 'Verificações automáticas que garantem a proteção dos seus dados',
      policies: 'Regras de bloqueio de sites e proteções configuradas',
      statistics: 'Números e métricas do período analisado',
      recommendations: 'Sugestões de melhorias para aumentar a segurança'
    },
    status: {
      generated: 'Relatório gerado com sucesso',
      pending: 'Aguardando geração',
      expired: 'Relatório expirado - gere um novo',
      error: 'Erro na geração do relatório'
    },
    glossary: {
      sha256: {
        term: 'SHA256',
        explanation: 'Uma "impressão digital" única do documento. Se qualquer letra mudar, essa impressão muda completamente, garantindo que o documento não foi alterado.'
      },
      hmac: {
        term: 'HMAC-SHA256',
        explanation: 'Uma assinatura digital que prova que o documento foi criado pelo sistema CyberShield e não por outra pessoa.'
      },
      rls: {
        term: 'RLS (Row Level Security)',
        explanation: 'Uma proteção no banco de dados que garante que cada empresa só veja seus próprios dados.'
      },
      tenant: {
        term: 'Tenant',
        explanation: 'Sua empresa dentro do sistema. Cada empresa é um "inquilino" separado com dados isolados.'
      },
      endpoint: {
        term: 'Endpoint',
        explanation: 'Um computador, notebook ou servidor que está sendo protegido pelo sistema.'
      },
      vulnerability: {
        term: 'Vulnerabilidade',
        explanation: 'Uma falha em um programa que pode ser usada por hackers para invadir seu sistema.'
      },
      antivirus: {
        term: 'Antivírus',
        explanation: 'Programa que protege seu computador contra vírus, malware e outras ameaças.'
      },
      compliance: {
        term: 'Compliance',
        explanation: 'Estar em conformidade com leis e normas de segurança (como LGPD).'
      }
    },
    templates: {
      LGPD: {
        name: 'LGPD - Lei Geral de Proteção de Dados',
        description: 'Verifica se sua empresa está em conformidade com a lei brasileira de proteção de dados pessoais',
        laymanDescription: 'Este relatório mostra como sua empresa protege as informações pessoais dos seus clientes e funcionários, conforme exigido pela lei brasileira.'
      },
      ISO_27001: {
        name: 'ISO 27001 - Segurança da Informação',
        description: 'Avaliação baseada no padrão internacional de gestão de segurança',
        laymanDescription: 'Este relatório avalia sua segurança usando o padrão mais respeitado do mundo para proteção de informações.'
      },
      SOC2_LITE: {
        name: 'SOC2-lite - Trust Services',
        description: 'Critérios de confiança simplificados para serviços digitais',
        laymanDescription: 'Este relatório verifica se seus sistemas são confiáveis, seguros e estão sempre disponíveis.'
      }
    }
  }
};
