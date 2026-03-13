/**
 * useDetectionRules — Manage configurable detection rules.
 * useMitreAttackRef — Reference MITRE ATT&CK techniques.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export function useDetectionRules() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['detection-rules', activeTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('detection_rules')
        .select('*')
        .or(`tenant_id.is.null,tenant_id.eq.${activeTenant!.id}`)
        .eq('is_enabled', true)
        .order('severity', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !loading && !!activeTenant?.id,
  });
}

export function useMitreAttackTechniques() {
  return useQuery({
    queryKey: ['mitre-techniques'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mitre_attack_techniques')
        .select('*')
        .order('technique_id');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 60_000, // 30 min cache
  });
}

export function useToggleDetectionRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('detection_rules')
        .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['detection-rules'] });
    },
  });
}

export function useMitreCoverageSnapshot() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['mitre-coverage-snapshot', activeTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mitre_coverage_snapshot')
        .select('*, mitre_attack_techniques(*)')
        .eq('tenant_id', activeTenant!.id)
        .order('detection_count', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !loading && !!activeTenant?.id,
    staleTime: 5 * 60_000,
  });
}
