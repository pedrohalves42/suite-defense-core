/**
 * Health Rules - Regras canônicas de saúde do agente
 * 
 * Fonte única de verdade para determinar se um agente está saudável.
 * Combina AgentState + DiagnosticSummary para definição consistente.
 */

import { type AgentState } from '@/lib/agent-state-machine';
import { type DiagnosticSummary } from '@/types/diagnostic';

/**
 * Regra canônica de saúde do agente.
 * 
 * Um agente é considerado saudável quando:
 * 1. O estado formal é 'healthy'
 * 2. Não possui issues críticas ou de alta prioridade
 * 
 * @param agentState - Estado formal derivado do agente
 * @param diagnosticSummary - Resumo de diagnóstico (opcional)
 * @returns true se o agente está saudável
 */
export function isAgentHealthy(
  agentState: AgentState | null | undefined,
  diagnosticSummary?: DiagnosticSummary | null
): boolean {
  // Se não temos estado, consideramos não saudável
  if (!agentState) {
    return false;
  }

  // Regra 1: Estado formal deve ser 'healthy'
  const stateIsHealthy = agentState === 'healthy';
  
  // Regra 2: Sem issues críticas ou de alta prioridade
  const noActionableIssues = 
    !diagnosticSummary || 
    (diagnosticSummary.critical === 0 && diagnosticSummary.high === 0);
  
  return stateIsHealthy && noActionableIssues;
}

/**
 * Determina o nível de severidade geral do agente
 * baseado em estado + diagnóstico
 */
export function getAgentHealthLevel(
  agentState: AgentState | null | undefined,
  diagnosticSummary?: DiagnosticSummary | null
): 'healthy' | 'warning' | 'critical' {
  if (!agentState) {
    return 'critical';
  }

  // Estados críticos
  if (agentState === 'isolated' || agentState === 'quarantined') {
    return 'critical';
  }

  // Issues críticas
  if (diagnosticSummary && diagnosticSummary.critical > 0) {
    return 'critical';
  }

  // Estados de atenção
  if (agentState === 'offline' || agentState === 'safe_mode') {
    return 'warning';
  }

  // Issues de alta prioridade
  if (diagnosticSummary && diagnosticSummary.high > 0) {
    return 'warning';
  }

  // Estados degradados
  if (agentState === 'degraded' || agentState === 'updating' || agentState === 'rollback') {
    return 'warning';
  }

  return 'healthy';
}
