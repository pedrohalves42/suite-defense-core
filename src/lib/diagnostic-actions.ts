/**
 * Diagnostic Actions - Mapeamento de issue → ação recomendada
 * 
 * Define ações recomendadas para cada tipo de issue de diagnóstico.
 * Garante que issues críticas sempre tenham uma ação acionável.
 * 
 * IMPORTANTE: Este é o sistema de chaves para ações.
 * Labels e textos são resolvidos aqui, não persistidos nas issues.
 */

import { type DiagnosticIssue, SEVERITY_ORDER } from '@/types/diagnostic';

export type DiagnosticIntent = 'overview' | 'triage' | 'soc';

export interface RecommendedAction {
  label: string;
  action_key: string;
  requires_confirmation: boolean;
  description?: string;
}

/**
 * Mapeamento de issue_type → ação recomendada
 */
export const ISSUE_ACTIONS: Record<string, RecommendedAction> = {
  // Conectividade
  'agent_offline': {
    label: 'Verificar conectividade',
    action_key: 'check_connectivity',
    requires_confirmation: false,
    description: 'Verifique se o computador está ligado e conectado à rede',
  },
  'no_heartbeat': {
    label: 'Verificar conectividade',
    action_key: 'check_connectivity',
    requires_confirmation: false,
    description: 'Computador não envia heartbeat há tempo',
  },
  'stale_heartbeat': {
    label: 'Aguardar reconexão',
    action_key: 'wait_reconnection',
    requires_confirmation: false,
    description: 'Comunicação desatualizada, aguarde ou verifique o computador',
  },

  // Safe Mode
  'safe_mode_active': {
    label: 'Forçar atualização',
    action_key: 'force_update',
    requires_confirmation: true,
    description: 'Computador em modo protegido, forçar atualização pode resolver',
  },
  'safe_mode_repeated': {
    label: 'Investigar causa',
    action_key: 'view_diagnostics',
    requires_confirmation: false,
    description: 'Safe mode ativado múltiplas vezes, investigar problema raiz',
  },

  // Isolamento
  'isolated': {
    label: 'Revisar isolamento',
    action_key: 'review_isolation',
    requires_confirmation: true,
    description: 'Computador isolado por segurança, revisar antes de remover',
  },
  'agent_isolated': {
    label: 'Remover isolamento',
    action_key: 'remove_isolation',
    requires_confirmation: true,
    description: 'Remover isolamento após verificar que é seguro',
  },

  // Throttle
  'throttled': {
    label: 'Remover limitação',
    action_key: 'remove_throttle',
    requires_confirmation: false,
    description: 'Comunicação reduzida temporariamente',
  },
  'agent_throttled': {
    label: 'Remover limitação',
    action_key: 'remove_throttle',
    requires_confirmation: false,
    description: 'Remover limitação de comunicação',
  },

  // Token/Credenciais
  'no_token': {
    label: 'Reinstalar agente',
    action_key: 'reinstall_agent',
    requires_confirmation: true,
    description: 'Credenciais inválidas, necessário reinstalar',
  },
  'token_expired': {
    label: 'Renovar token',
    action_key: 'renew_token',
    requires_confirmation: false,
    description: 'Token expirado, renovar automaticamente',
  },

  // Versão
  'outdated_version': {
    label: 'Forçar atualização',
    action_key: 'force_update',
    requires_confirmation: false,
    description: 'Versão desatualizada, forçar atualização',
  },
  'version_blocked': {
    label: 'Atualização urgente',
    action_key: 'force_update',
    requires_confirmation: true,
    description: 'Versão bloqueada, atualização necessária',
  },

  // Jobs
  'failed_jobs': {
    label: 'Ver tarefas falhando',
    action_key: 'view_failed_jobs',
    requires_confirmation: false,
    description: 'Algumas tarefas estão falhando repetidamente',
  },
  'jobs_queue_full': {
    label: 'Limpar fila',
    action_key: 'clear_job_queue',
    requires_confirmation: true,
    description: 'Fila de tarefas cheia, considerar limpar',
  },

  // Recursos
  'high_cpu': {
    label: 'Verificar processos',
    action_key: 'check_processes',
    requires_confirmation: false,
    description: 'Uso de CPU elevado, verificar processos',
  },
  'high_memory': {
    label: 'Verificar memória',
    action_key: 'check_memory',
    requires_confirmation: false,
    description: 'Uso de memória elevado',
  },
  'low_disk': {
    label: 'Liberar espaço',
    action_key: 'check_disk',
    requires_confirmation: false,
    description: 'Espaço em disco baixo',
  },

  // Rede
  'network_issue': {
    label: 'Diagnóstico de rede',
    action_key: 'network_diagnostics',
    requires_confirmation: false,
    description: 'Problema de rede detectado',
  },
  'dns_failure': {
    label: 'Verificar DNS',
    action_key: 'check_dns',
    requires_confirmation: false,
    description: 'Falha na resolução DNS',
  },

  // Políticas
  'policy_violation': {
    label: 'Ver política',
    action_key: 'view_policy',
    requires_confirmation: false,
    description: 'Violação de política detectada',
  },
  'policy_sync_failed': {
    label: 'Resincronizar',
    action_key: 'sync_policies',
    requires_confirmation: false,
    description: 'Falha na sincronização de políticas',
  },
};

/**
 * Obtém a ação recomendada para um tipo de issue
 * @param issueType - Tipo da issue
 * @returns Ação recomendada ou null se não houver
 */
export function getRecommendedAction(issueType: string): RecommendedAction | null {
  return ISSUE_ACTIONS[issueType] || null;
}

/**
 * Verifica se um tipo de issue tem ação recomendada
 */
export function hasRecommendedAction(issueType: string): boolean {
  return issueType in ISSUE_ACTIONS;
}

/**
 * Obtém todas as ações disponíveis
 */
export function getAllActions(): Record<string, RecommendedAction> {
  return { ...ISSUE_ACTIONS };
}

/**
 * Issue types que bloqueiam execução do agente
 */
const BLOCKING_ISSUE_TYPES = [
  'isolated',
  'agent_isolated',
  'quarantined', // V-FIX: Quarantined agents are also blocked
  'no_token',
  'version_blocked',
  'token_expired',
  'safe_mode_active',
];

/**
 * Verifica se uma issue bloqueia execução
 */
function isBlockingIssue(issue: DiagnosticIssue): boolean {
  return BLOCKING_ISSUE_TYPES.includes(issue.issue_type);
}

/**
 * Ordena issues baseado no intent semântico.
 * 
 * - SOC: críticos primeiro, depois high, depois blocking, resto
 * - Triage: ordenação padrão por severidade
 * - Overview: ordenação padrão por severidade
 * 
 * @param issues - Lista de issues
 * @param intent - Intenção do contexto de uso
 * @returns Issues ordenadas
 */
export function sortIssuesByIntent(
  issues: DiagnosticIssue[], 
  intent: DiagnosticIntent
): DiagnosticIssue[] {
  if (intent === 'soc') {
    // SOC: critical primeiro, depois high, depois blocking, resto
    return [...issues].sort((a, b) => {
      // Prioridade 1: Severidade
      const severityDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
      if (severityDiff !== 0) return severityDiff;
      
      // Prioridade 2: Issues que bloqueiam execução
      const aBlocking = isBlockingIssue(a);
      const bBlocking = isBlockingIssue(b);
      if (aBlocking && !bBlocking) return -1;
      if (!aBlocking && bBlocking) return 1;
      
      return 0;
    });
  }
  
  // Default: ordenação padrão por severidade
  return [...issues].sort((a, b) => 
    (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  );
}
