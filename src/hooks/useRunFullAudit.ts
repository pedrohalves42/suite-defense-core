import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { AuditResult } from './useSystemAudit';
import { RedTeamAssessment } from './useRedTeamAssessment';

export interface FullAuditResult {
  success: boolean;
  version?: string;
  execution_order?: string;
  red_team: RedTeamAssessment;
  ana: AuditResult;  // Edge function returns 'ana', not 'ana_audit'
  confidence_gap: {
    gap_id: string;
    ana_score: number;
    red_score: number;
    gap: number;
    health_status: string;
    gap_delta: number;
    alert_triggered: boolean;
    alert_reason: string | null;
  };
  governance?: {
    previous_score: number | null;
    avg_last_3: number | null;
    avg_last_7: number | null;
    guardrail_max_delta: number;
    variance_reduced: boolean;
    fallback_used: boolean;
  };
  total_tokens?: number;
  // Deterministic fallback fields
  is_deterministic?: boolean;
  fallback_reason?: string;
  overall_score?: number;
  market_score?: number;
  threat_level?: string;
  binary_criteria?: Record<string, boolean>;
}

export function useRunFullAudit() {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<'idle' | 'red_team' | 'ana' | 'gap' | 'done'>('idle');

  const runFullAudit = useCallback(async (): Promise<FullAuditResult | null> => {
    setIsRunning(true);
    setProgress('red_team');
    
    try {
      const result = await callEdgeFunction<FullAuditResult>('ai-full-audit', {});
      
      if (!result.success) {
        throw new Error('Full audit failed');
      }

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['system-audits'] });
      queryClient.invalidateQueries({ queryKey: ['red-team-assessments'] });
      queryClient.invalidateQueries({ queryKey: ['confidence-gap'] });

      setProgress('done');
      
      // Show appropriate message based on audit type
      if (result.is_deterministic) {
        toast.warning('Auditoria determinística concluída (créditos AI esgotados)');
      } else {
        toast.success('Auditoria completa concluída com sucesso');
      }
      
      return result;
    } catch (error) {
      logger.error('Full audit error', error instanceof Error ? error : undefined);
      toast.error(error instanceof Error ? error.message : 'Erro ao executar auditoria completa');
      return null;
    } finally {
      setIsRunning(false);
      setProgress('idle');
    }
  }, [queryClient]);

  return { runFullAudit, isRunning, progress };
}
