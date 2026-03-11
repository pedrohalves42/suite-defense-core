import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { useActiveTenant } from './useActiveTenant';
import { toast } from 'sonner';

export interface AuditDimension {
  score: number;
  analysis: string;
}

export interface SystemAudit {
  id: string;
  tenant_id: string;
  created_at: string;
  created_by: string | null;
  overall_score: number;
  score_system_identity: number;
  score_control_vs_monitor: number;
  score_evidence_proof: number;
  score_maturity: number;
  score_failure_handling: number;
  score_limitations: number;
  score_operational_trust: number;
  score_market_value: number;
  score_simplicity: number;
  analysis_system_identity: string | null;
  analysis_control_vs_monitor: string | null;
  analysis_evidence_proof: string | null;
  analysis_maturity: string | null;
  analysis_failure_handling: string | null;
  analysis_limitations: string | null;
  analysis_operational_trust: string | null;
  analysis_market_value: string | null;
  analysis_simplicity: string | null;
  executive_summary: string | null;
  final_sentence: string | null;
  recommendation: 'NOT_READY' | 'READY_MVP' | 'READY_FOR_SCALE' | 'ENTERPRISE_READY' | null;
  metrics_snapshot: Record<string, unknown> | null;
  ai_model: string | null;
  prompt_hash: string | null;
  tokens_used: number | null;
}

export interface AuditResult {
  success: boolean;
  audit_id?: string;
  overall_score: number;
  dimensions: {
    system_identity: AuditDimension;
    control_vs_monitor: AuditDimension;
    evidence_proof: AuditDimension;
    maturity: AuditDimension;
    failure_handling: AuditDimension;
    limitations: AuditDimension;
    operational_trust: AuditDimension;
    market_value: AuditDimension;
    simplicity: AuditDimension;
  };
  executive_summary: string;
  final_sentence: string;
  recommendation: 'NOT_READY' | 'READY_MVP' | 'READY_FOR_SCALE' | 'ENTERPRISE_READY';
  metrics_snapshot: Record<string, unknown>;
  tokens_used: number;
}

// Fetch audit history (filtered by active tenant)
export function useAuditHistory(limit = 10) {
  const { activeTenant } = useActiveTenant();
  const activeTenantId = activeTenant?.id ?? null;
  
  return useQuery({
    queryKey: ['system-audits', limit, activeTenantId],
    queryFn: async () => {
      let query = supabase
        .from('system_audits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (activeTenantId) {
        query = query.eq('tenant_id', activeTenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SystemAudit[];
    },
  });
}

// Fetch single audit by ID
export function useAuditById(auditId: string | null) {
  return useQuery({
    queryKey: ['system-audit', auditId],
    queryFn: async () => {
      if (!auditId) return null;
      
      const { data, error } = await supabase
        .from('system_audits')
        .select('*')
        .eq('id', auditId)
        .single();

      if (error) throw error;
      return data as SystemAudit;
    },
    enabled: !!auditId,
  });
}

// Run new audit
export function useRunAudit() {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);

  const runAudit = useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await callEdgeFunction<AuditResult>('ai-system-audit', {});
      
      if (!result.success) {
        throw new Error('Audit failed');
      }

      // Invalidate audit history to refresh
      queryClient.invalidateQueries({ queryKey: ['system-audits'] });
      
      toast.success('Auditoria concluída com sucesso');
      return result;
    } catch (error) {
      console.error('Audit error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao executar auditoria');
      throw error;
    } finally {
      setIsRunning(false);
    }
  }, [queryClient]);

  return { runAudit, isRunning };
}

// Get latest audit (filtered by active tenant)
export function useLatestAudit() {
  const { activeTenant } = useActiveTenant();
  const activeTenantId = activeTenant?.id ?? null;

  return useQuery({
    queryKey: ['system-audits', 'latest', activeTenantId],
    queryFn: async () => {
      let query = supabase
        .from('system_audits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (activeTenantId) {
        query = query.eq('tenant_id', activeTenantId);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data as SystemAudit | null;
    },
  });
}

// Helper to convert DB audit to AuditResult format
export function auditToResult(audit: SystemAudit): AuditResult {
  return {
    success: true,
    audit_id: audit.id,
    overall_score: audit.overall_score,
    dimensions: {
      system_identity: {
        score: audit.score_system_identity,
        analysis: audit.analysis_system_identity || '',
      },
      control_vs_monitor: {
        score: audit.score_control_vs_monitor,
        analysis: audit.analysis_control_vs_monitor || '',
      },
      evidence_proof: {
        score: audit.score_evidence_proof,
        analysis: audit.analysis_evidence_proof || '',
      },
      maturity: {
        score: audit.score_maturity,
        analysis: audit.analysis_maturity || '',
      },
      failure_handling: {
        score: audit.score_failure_handling,
        analysis: audit.analysis_failure_handling || '',
      },
      limitations: {
        score: audit.score_limitations,
        analysis: audit.analysis_limitations || '',
      },
      operational_trust: {
        score: audit.score_operational_trust,
        analysis: audit.analysis_operational_trust || '',
      },
      market_value: {
        score: audit.score_market_value,
        analysis: audit.analysis_market_value || '',
      },
      simplicity: {
        score: audit.score_simplicity,
        analysis: audit.analysis_simplicity || '',
      },
    },
    executive_summary: audit.executive_summary || '',
    final_sentence: audit.final_sentence || '',
    recommendation: audit.recommendation || 'NOT_READY',
    metrics_snapshot: (audit.metrics_snapshot as Record<string, unknown>) || {},
    tokens_used: audit.tokens_used || 0,
  };
}

// Dimension labels in Portuguese
export const DIMENSION_LABELS: Record<string, { name: string; description: string }> = {
  system_identity: {
    name: 'Identidade do Sistema',
    description: 'O que esse sistema realmente é e que problema resolve',
  },
  control_vs_monitor: {
    name: 'Controle vs Monitoramento',
    description: 'O que o sistema controla vs apenas observa',
  },
  evidence_proof: {
    name: 'Evidência e Prova',
    description: 'Como o sistema prova o que fez de forma auditável',
  },
  maturity: {
    name: 'Maturidade',
    description: 'Funcionalidades estáveis e bem desenvolvidas',
  },
  failure_handling: {
    name: 'Tratamento de Falhas',
    description: 'Como o sistema se comporta quando algo dá errado',
  },
  limitations: {
    name: 'Limitações',
    description: 'O que ainda não está completamente finalizado',
  },
  operational_trust: {
    name: 'Confiança Operacional',
    description: 'Nível de confiança para uso em produção',
  },
  market_value: {
    name: 'Valor de Mercado',
    description: 'Potencial de MRR, retenção e diferenciação',
  },
  simplicity: {
    name: 'Simplicidade',
    description: 'Clareza para usuários não-técnicos',
  },
};

// Recommendation labels
export const RECOMMENDATION_LABELS: Record<string, { label: string; color: string; description: string }> = {
  NOT_READY: {
    label: 'Não Pronto',
    color: 'destructive',
    description: 'Sistema precisa de melhorias significativas antes de ser comercializado',
  },
  READY_MVP: {
    label: 'MVP Pronto',
    color: 'warning',
    description: 'Sistema pode ser testado com early adopters',
  },
  READY_FOR_SCALE: {
    label: 'Pronto para Escalar',
    color: 'success',
    description: 'Sistema está pronto para crescimento comercial',
  },
  ENTERPRISE_READY: {
    label: 'Enterprise Ready',
    color: 'primary',
    description: 'Sistema atende requisitos de grandes empresas',
  },
};
