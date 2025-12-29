import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { toast } from 'sonner';
import { AuditResult } from './useSystemAudit';
import { RedTeamAssessment } from './useRedTeamAssessment';

export interface FullAuditResult {
  success: boolean;
  red_team: RedTeamAssessment;
  ana_audit: AuditResult;
  confidence_gap: number;
  gap_analysis: string;
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
      toast.success('Auditoria completa concluída com sucesso');
      return result;
    } catch (error) {
      console.error('Full audit error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao executar auditoria completa');
      return null;
    } finally {
      setIsRunning(false);
      setProgress('idle');
    }
  }, [queryClient]);

  return { runFullAudit, isRunning, progress };
}
