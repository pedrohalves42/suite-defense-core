/**
 * Security event utility functions and labels
 */

export const EVENT_LABELS: Record<string, { title: string; explanation: string; icon: string }> = {
  unauthorized:        { title: 'Site bloqueado no computador', explanation: 'Um computador tentou acessar um site proibido pela política de bloqueio e foi impedido', icon: '🚫' },
  AUTH_INVALID_SIG:    { title: 'Credencial inválida', explanation: 'Uma tentativa de login com dados incorretos foi barrada', icon: '🔑' },
  AUTH_INVALID_SIGNATURE: { title: 'Credencial inválida', explanation: 'Uma tentativa de login com dados incorretos foi barrada', icon: '🔑' },
  AUTH_EXPIRED_TOKEN:  { title: 'Sessão expirada', explanation: 'Uma sessão antiga tentou ser usada e foi bloqueada', icon: '⏰' },
  AUTH_MISSING_TOKEN:  { title: 'Login obrigatório', explanation: 'Alguém tentou acessar sem fazer login primeiro', icon: '🔒' },
  playbook_triggered:  { title: 'Proteção ativada automaticamente', explanation: 'O sistema detectou um risco e agiu sozinho para proteger', icon: '🛡️' },
  playbook_executed:   { title: 'Proteção concluída', explanation: 'Uma ação de proteção automática foi finalizada com sucesso', icon: '✅' },
  action_blocked:      { title: 'Ação perigosa bloqueada', explanation: 'Uma ação suspeita foi impedida pelo sistema', icon: '🚫' },
  threat_detected:     { title: 'Ameaça encontrada', explanation: 'O sistema identificou algo potencialmente perigoso', icon: '⚠️' },
  agent_isolated:      { title: 'Computador isolado', explanation: 'Um computador foi separado da rede por segurança', icon: '🔌' },
  brute_force:         { title: 'Ataque de senhas bloqueado', explanation: 'Alguém tentou adivinhar senhas repetidamente e foi bloqueado', icon: '🔨' },
  sql_injection:       { title: 'Tentativa de invasão bloqueada', explanation: 'Uma técnica de hacking foi detectada e impedida', icon: '🛑' },
  xss:                 { title: 'Código malicioso bloqueado', explanation: 'Tentativa de injetar código perigoso foi impedida', icon: '🦠' },
  rate_limit:          { title: 'Excesso de tentativas', explanation: 'Muitas requisições foram feitas em pouco tempo', icon: '⏱️' },
  control_characters:  { title: 'Dados suspeitos bloqueados', explanation: 'Dados com formato irregular foram rejeitados', icon: '🔍' },
  payload_tampering:   { title: 'Adulteração detectada', explanation: 'Os dados enviados foram alterados no caminho e bloqueados', icon: '🔧' },
  quota_exceeded:      { title: 'Limite atingido', explanation: 'O limite de uso foi alcançado temporariamente', icon: '📊' },
  path_traversal:      { title: 'Acesso a pasta proibida', explanation: 'Tentativa de acessar arquivos restritos foi bloqueada', icon: '📁' },
  invalid_input:       { title: 'Dados inválidos rejeitados', explanation: 'Informações com formato incorreto foram recusadas', icon: '❌' },
};

export interface SecurityEvent {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  explanation: string;
  icon: string;
  computer?: string;
  ip?: string;
  extra?: string;
  timestamp: string;
}

export function getEventInfo(raw: string): { title: string; explanation: string; icon: string } {
  if (EVENT_LABELS[raw]) return EVENT_LABELS[raw];
  for (const [key, info] of Object.entries(EVENT_LABELS)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return info;
  }
  return {
    title: raw.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()),
    explanation: 'Evento registrado pelo sistema de segurança',
    icon: 'ℹ️',
  };
}

export function extractFriendlyDetails(raw: unknown): { computer?: string; ip?: string; extra?: string } {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') return {};
    const record = obj as Record<string, unknown>;
    return {
      computer: record.agent_name ? String(record.agent_name) : undefined,
      ip: record.ip_address ? String(record.ip_address) : undefined,
      extra: record.endpoint ? `em ${String(record.endpoint)}` : undefined,
    };
  } catch {
    return {};
  }
}
