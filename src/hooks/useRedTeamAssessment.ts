import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useActiveTenant } from './useActiveTenant';

export interface AttackVector {
  name: string;
  category: string;
  difficulty: string;
  impact: string;
  description: string;
  current_mitigation: string;
  gap: string;
}

export interface ResidualRisk {
  risk: string;
  likelihood: string;
  impact: string;
  owner: string;
}

export interface HardeningRecommendation {
  action: string;
  priority: string;
  effort: string;
  reduces_score_by: number;
}

export interface RedTeamAssessment {
  id: string;
  tenant_id: string;
  threat_level: 'low' | 'medium' | 'high' | 'critical';
  red_score: number;
  attack_vectors: AttackVector[];
  residual_risks: ResidualRisk[];
  threat_system_identity: number | null;
  threat_governance: number | null;
  threat_evidence_proof: number | null;
  threat_human_oversight: number | null;
  threat_operational_resilience: number | null;
  threat_cross_tenant_isolation: number | null;
  threat_transparency_explainability: number | null;
  threat_compliance_alignment: number | null;
  threat_market_trust: number | null;
  executive_threat_summary: string | null;
  worst_case_scenario: string | null;
  recommended_hardening: HardeningRecommendation[];
  ai_model: string | null;
  ai_prompt_hash: string | null;
  metrics_snapshot: Record<string, any> | null;
  created_at: string;
}

export function useRedTeamHistory() {
  const { activeTenant, loading } = useActiveTenant();
  
  return useQuery({
    queryKey: ['red-team-history', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return [];
      const { data, error } = await supabase
        .from('red_team_assessments')
        .select('id, tenant_id, threat_level, red_score, attack_vectors, residual_risks, executive_threat_summary, worst_case_scenario, recommended_hardening, ai_model, created_at, threat_system_identity, threat_governance, threat_evidence_proof, threat_human_oversight, threat_operational_resilience, threat_cross_tenant_isolation, threat_transparency_explainability, threat_compliance_alignment, threat_market_trust')
        .eq('tenant_id', activeTenant.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as unknown as RedTeamAssessment[];
    },
    enabled: !loading && !!activeTenant?.id,
  });
}

export function useRedTeamById(id: string | null) {
  return useQuery({
    queryKey: ['red-team', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('red_team_assessments')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as unknown as RedTeamAssessment;
    },
    enabled: !!id,
  });
}

export function useLatestRedTeam() {
  const { activeTenant } = useActiveTenant();
  const activeTenantId = activeTenant?.id ?? null;

  return useQuery({
    queryKey: ['red-team-latest', activeTenantId],
    queryFn: async () => {
      let query = supabase
        .from('red_team_assessments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (activeTenantId) {
        query = query.eq('tenant_id', activeTenantId);
      }

      const { data, error } = await query.single();
      if (error && error.code !== 'PGRST116') throw error;
      return data as unknown as RedTeamAssessment | null;
    },
  });
}

export function useRunRedTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (anaSummary?: string) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-red-team-assessment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({ ana_summary: anaSummary }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Red Team assessment failed');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['red-team-history'] });
      queryClient.invalidateQueries({ queryKey: ['red-team-latest'] });
      queryClient.invalidateQueries({ queryKey: ['confidence-gap'] });
      toast.success('Análise Red Team concluída');
    },
    onError: (error) => {
      toast.error(`Erro na análise Red Team: ${error.message}`);
    },
  });
}

export function getThreatLevelColor(level: string): string {
  switch (level) {
    case 'critical': return 'text-red-500';
    case 'high': return 'text-orange-500';
    case 'medium': return 'text-yellow-500';
    case 'low': return 'text-green-500';
    default: return 'text-muted-foreground';
  }
}

export function getThreatLevelBg(level: string): string {
  switch (level) {
    case 'critical': return 'bg-red-500/10 border-red-500/20';
    case 'high': return 'bg-orange-500/10 border-orange-500/20';
    case 'medium': return 'bg-yellow-500/10 border-yellow-500/20';
    case 'low': return 'bg-green-500/10 border-green-500/20';
    default: return 'bg-muted';
  }
}
