/**
 * useDiagnostic - Hook centralizado para diagnósticos de agentes
 * 
 * Fornece:
 * - Lista de issues do agente
 * - Resumo por severidade
 * - Integração com state machine
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DiagnosticIssue {
  issue_type: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  description: string;
  details: Record<string, unknown>;
}

export interface DiagnosticSummary {
  critical: number;
  high: number;
  medium: number;
  info: number;
  total: number;
}

export interface DiagnosticResult {
  isHealthy: boolean;
  issues: DiagnosticIssue[];
  summary: DiagnosticSummary;
  lastCheck: string;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  info: 3,
};

export function useDiagnostic(agentName: string | null, tenantId: string | null) {
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

      return {
        isHealthy: summary.critical === 0 && summary.high === 0,
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

// Utility functions for severity styling
export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-destructive text-destructive-foreground';
    case 'high': return 'bg-orange-500 text-white';
    case 'medium': return 'bg-yellow-500 text-black';
    case 'info': return 'bg-blue-500 text-white';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function getSeverityBorderColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'border-l-destructive';
    case 'high': return 'border-l-orange-500';
    case 'medium': return 'border-l-yellow-500';
    case 'info': return 'border-l-blue-500';
    default: return 'border-l-muted';
  }
}

export function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'critical': return 'Crítico';
    case 'high': return 'Alto';
    case 'medium': return 'Médio';
    case 'info': return 'Informativo';
    default: return severity;
  }
}
