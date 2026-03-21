/**
 * Health Rules - Regras canônicas de saúde do agente
 * 
 * Fonte única de verdade para determinar se um agente está saudável.
 * Combina AgentState + DiagnosticSummary para definição consistente.
 * 
 * IMPORTANTE: Funções são determinísticas e explícitas.
 * Ausência de dados gera warning + retorna não saudável.
 */

import { type AgentState } from '@/lib/agent-state-machine';
import { type DiagnosticSummary } from '@/types/diagnostic';

/**
 * Input estruturado para verificação de saúde.
 * Evita defaults silenciosos e args posicionais.
 */
export interface HealthCheckInput {
  state: AgentState | null | undefined;
  summary?: DiagnosticSummary | null;
}

/**
 * Regra canônica de saúde do agente.
 * 
 * Um agente é considerado saudável quando:
 * 1. O estado formal é 'healthy'
 * 2. Não possui issues críticas ou de alta prioridade
 * 
 * @param input - Objeto com state e summary
 * @returns true se o agente está saudável
 */
export function isAgentHealthy(input: HealthCheckInput): boolean {
  // Falha explícita se estado ausente
  if (!input.state) {
    logger.warn('[health-rules] isAgentHealthy called without state - returning unhealthy');
    return false;
  }

  // Regra 1: Estado formal deve ser 'healthy'
  const stateIsHealthy = input.state === 'healthy';
  
  // Regra 2: Sem issues críticas ou de alta prioridade
  const noActionableIssues = 
    !input.summary || 
    (input.summary.critical === 0 && input.summary.high === 0);
  
  return stateIsHealthy && noActionableIssues;
}

/**
 * Determina o nível de severidade geral do agente
 * baseado em estado + diagnóstico
 * 
 * @param input - Objeto com state e summary (usa HealthCheckInput)
 */
export function getAgentHealthLevel(input: HealthCheckInput): 'healthy' | 'warning' | 'critical' {
  if (!input.state) {
    console.warn('[health-rules] getAgentHealthLevel called without state - returning critical');
    return 'critical';
  }

  // Estados críticos
  if (input.state === 'isolated' || input.state === 'quarantined') {
    return 'critical';
  }

  // Issues críticas
  if (input.summary && input.summary.critical > 0) {
    return 'critical';
  }

  // Estados de atenção
  if (input.state === 'offline' || input.state === 'safe_mode') {
    return 'warning';
  }

  // Issues de alta prioridade
  if (input.summary && input.summary.high > 0) {
    return 'warning';
  }

  // Estados degradados
  if (input.state === 'degraded' || input.state === 'updating' || input.state === 'rollback') {
    return 'warning';
  }

  return 'healthy';
}
