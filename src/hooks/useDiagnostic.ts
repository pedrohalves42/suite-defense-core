/**
 * useDiagnostic - Hook centralizado para diagnósticos de agentes
 * 
 * Fornece:
 * - Lista de issues do agente
 * - Resumo por severidade
 * - Integração com state machine via isAgentHealthy
 * 
 * IMPORTANTE: Este hook é READ-ONLY.
 * Para ações de remediação, use useAgentActions ou useRemediationActions.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { type AgentState } from '@/lib/agent-state-machine';
import { isAgentHealthy } from '@/lib/health-rules';
import { 
  type DiagnosticIssue, 
  type DiagnosticSummary, 
  type DiagnosticResult,
  SEVERITY_ORDER,
  getSeverityColor,
  getSeverityBorderColor,
  getSeverityLabel,
  validateIssue,
} from '@/types/diagnostic';

// Re-export types for backward compatibility
export type { DiagnosticIssue, DiagnosticSummary, DiagnosticResult };

// Re-export styling utilities for backward compatibility
export { getSeverityColor, getSeverityBorderColor, getSeverityLabel };

/**
 * Hook para diagnóstico de agentes
 * 
 * @param agentName - Nome do agente
 * @param tenantId - ID do tenant
 * @param agentState - Estado formal do agente (opcional, para cálculo de saúde)
 */
export function useDiagnostic(
  agentName: string | null, 
  tenantId: string | null,
  agentState?: AgentState | null
) {
  return useQuery({
    queryKey: ['agent-diagnostic', agentName, tenantId],
    queryFn: async (): Promise<DiagnosticResult> => {
      if (!agentName || !tenantId) {
        return {
          isHealthy: true,
          issues: [],
          summary: { critical: 0, high: 0, medium: 0, info: 0, total: 0 },
          lastCheck: new Date().toISOString(),
        };
      }

      const { data, error } = await supabase.rpc('diagnose_agent_issues', {
        p_agent_name: agentName,
        p_tenant_id: tenantId,
      });

      if (error) throw error;

      const issues = (data || []) as DiagnosticIssue[];
      
      // Validate issues (logs warnings for critical/high without origin)
      issues.forEach(validateIssue);
      
      // Sort issues by severity
      issues.sort((a, b) => 
        (SEVERITY_ORDER[a.severity] || 99) - (SEVERITY_ORDER[b.severity] || 99)
      );

      // Calculate summary
      const summary: DiagnosticSummary = {
        critical: issues.filter(i => i.severity === 'critical').length,
        high: issues.filter(i => i.severity === 'high').length,
        medium: issues.filter(i => i.severity === 'medium').length,
        info: issues.filter(i => i.severity === 'info').length,
        total: issues.length,
      };

      // Use canonical health rule - explicit input object
      const healthy = isAgentHealthy({ state: agentState, summary });

      return {
        isHealthy: healthy,
        issues,
        summary,
        lastCheck: new Date().toISOString(),
      };
    },
    enabled: !!agentName && !!tenantId,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });
}
