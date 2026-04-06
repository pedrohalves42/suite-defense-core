/**
 * useCorrelationRules — CRUD hooks for temporal correlation rules.
 * useCorrelationResults — View and review correlation matches.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export interface CorrelationRule {
  id: string;
  tenant_id: string;
  rule_name: string;
  description: string | null;
  condition_a_event_type: string;
  condition_b_event_type: string;
  window_minutes: number;
  severity: string;
  mitre_technique_id: string | null;
  mitre_tactic: string | null;
  mode: string;
  is_enabled: boolean;
  risk_score: number;
  match_count: number;
  false_positive_count: number;
  created_at: string;
  updated_at: string;
}

export interface CorrelationResult {
  id: string;
  tenant_id: string;
  correlation_rule_id: string;
  agent_id: string | null;
  event_a_time: string;
  event_b_time: string;
  event_a_summary: string | null;
  event_b_summary: string | null;
  severity: string;
  is_false_positive: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

// ── Correlation Rules ──

export function useCorrelationRules() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['correlation-rules', activeTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('correlation_rules')
        .select('*')
        .eq('tenant_id', activeTenant!.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as CorrelationRule[];
    },
    enabled: !loading && !!activeTenant?.id,
    staleTime: 5 * 60_000,
  });
}

export function useCreateCorrelationRule() {
  const { activeTenant } = useActiveTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Omit<CorrelationRule, 'id' | 'tenant_id' | 'risk_score' | 'match_count' | 'false_positive_count' | 'created_at' | 'updated_at'>) => {
      if (!activeTenant?.id) throw new Error('No active tenant');
      const { error } = await supabase
        .from('correlation_rules')
        .insert({ ...rule, tenant_id: activeTenant.id } as Omit<CorrelationRule, 'id' | 'risk_score' | 'match_count' | 'false_positive_count' | 'created_at' | 'updated_at'> & { tenant_id: string });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['correlation-rules'] }),
  });
}

export function useUpdateCorrelationRuleMode() {
  const { activeTenant } = useActiveTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId, mode }: { ruleId: string; mode: 'active' | 'dry_run' | 'disabled' }) => {
      if (!activeTenant?.id) throw new Error('No active tenant');
      const { error } = await supabase
        .from('correlation_rules')
        .update({ mode, updated_at: new Date().toISOString() } as Partial<CorrelationRule>)
        .eq('id', ruleId)
        .eq('tenant_id', activeTenant.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['correlation-rules'] }),
  });
}

// ── Correlation Results ──

export function useCorrelationResults(ruleId?: string) {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['correlation-results', activeTenant?.id, ruleId],
    queryFn: async () => {
      let query = supabase
        .from('correlation_results')
        .select('*')
        .eq('tenant_id', activeTenant!.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (ruleId) query = query.eq('correlation_rule_id', ruleId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as CorrelationResult[];
    },
    enabled: !loading && !!activeTenant?.id,
    staleTime: 2 * 60_000,
  });
}

export function useMarkCorrelationFalsePositive() {
  const { activeTenant } = useActiveTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (resultId: string) => {
      if (!activeTenant?.id) throw new Error('No active tenant');
      const { error } = await supabase
        .from('correlation_results')
        .update({
          is_false_positive: true,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq('id', resultId)
        .eq('tenant_id', activeTenant.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['correlation-results'] }),
  });
}

// ── Detection Rule Mode & Feedback ──

export function useUpdateDetectionRuleMode() {
  const { activeTenant } = useActiveTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId, mode }: { ruleId: string; mode: 'active' | 'dry_run' | 'disabled' }) => {
      if (!activeTenant?.id) throw new Error('No active tenant');
      const { error } = await supabase
        .from('detection_rules')
        .update({ mode, updated_at: new Date().toISOString() } as any)
        .eq('id', ruleId)
        .or(`tenant_id.eq.${activeTenant.id},tenant_id.is.null`);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['detection-rules'] }),
  });
}

export function useDetectionRuleFeedback() {
  const { activeTenant } = useActiveTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId, isTruePositive }: { ruleId: string; isTruePositive: boolean }) => {
      if (!activeTenant?.id) throw new Error('No active tenant');
      const col = isTruePositive ? 'true_positive_count' : 'false_positive_count';
      // Use RPC to atomically increment
      const { data: current, error: fetchErr } = await supabase
        .from('detection_rules')
        .select(`${col}`)
        .eq('id', ruleId)
        .or(`tenant_id.eq.${activeTenant.id},tenant_id.is.null`)
        .single();
      if (fetchErr) throw fetchErr;
      const newVal = ((current as any)?.[col] ?? 0) + 1;
      const { error } = await supabase
        .from('detection_rules')
        .update({
          [col]: newVal,
          last_triggered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', ruleId)
        .or(`tenant_id.eq.${activeTenant.id},tenant_id.is.null`);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['detection-rules'] }),
  });
}

// ── Risk Score Recalculation ──

export function useRecalculateRiskScores() {
  const { activeTenant } = useActiveTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!activeTenant?.id) throw new Error('No active tenant');
      const { error } = await supabase.rpc('recalculate_risk_scores', {
        p_tenant_id: activeTenant.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['detection-rules'] }),
  });
}

// ── Run Correlation Engine ──

export function useRunCorrelationEngine() {
  const { activeTenant } = useActiveTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!activeTenant?.id) throw new Error('No active tenant');
      const { data, error } = await supabase.rpc('run_correlation_engine', {
        p_tenant_id: activeTenant.id,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['correlation-results'] });
      qc.invalidateQueries({ queryKey: ['correlation-rules'] });
    },
  });
}
