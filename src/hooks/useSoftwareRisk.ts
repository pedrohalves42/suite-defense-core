import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { toast } from 'sonner';

export interface SoftwareRiskSummary {
  risk_level: string;
  count: number;
  category_breakdown: Record<string, number>;
}

export interface SoftwareKnowledgeRule {
  id: string;
  software_pattern: string;
  match_type: 'exact' | 'contains' | 'regex';
  category: string;
  default_risk_level: 'low' | 'medium' | 'high' | 'critical';
  vendor_patterns: string[] | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SoftwareInventoryItem {
  id: string;
  agent_id: string;
  name: string;
  version: string | null;
  vendor: string | null;
  install_location: string | null;
  risk_level: string | null;
  first_seen_at: string;
  last_seen_at: string;
  agents?: { agent_name: string };
}

export interface TopRiskySoftware {
  name: string;
  vendor: string | null;
  risk_level: string;
  machine_count: number;
  first_seen_at: string;
}

export function useSoftwareRiskSummary() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['software-risk-summary', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return [];
      
      const { data, error } = await supabase.rpc('get_software_risk_summary', {
        p_tenant_id: activeTenant.id
      });

      if (error) throw error;
      return (data || []) as SoftwareRiskSummary[];
    },
    enabled: !loading && !!activeTenant?.id,
    staleTime: 60 * 1000,
  });
}

export function useSoftwareByRisk(riskLevel?: string, limit = 50) {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['software-by-risk', activeTenant?.id, riskLevel, limit],
    queryFn: async () => {
      if (!activeTenant?.id) return [];

      let query = supabase
        .from('software_inventory')
        .select('*, agents(agent_name)')
        .eq('tenant_id', activeTenant.id)
        .order('last_seen_at', { ascending: false })
        .limit(limit);

      if (riskLevel) {
        query = query.eq('risk_level', riskLevel);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SoftwareInventoryItem[];
    },
    enabled: !loading && !!activeTenant?.id,
  });
}

export function useTopRiskySoftware(limit = 10) {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['top-risky-software', activeTenant?.id, limit],
    queryFn: async () => {
      if (!activeTenant?.id) return [];

      const { data, error } = await supabase
        .from('software_inventory')
        .select('name, vendor, risk_level, agent_id, first_seen_at')
        .eq('tenant_id', activeTenant.id)
        .in('risk_level', ['critical', 'high'])
        .order('last_seen_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      // Group by name to count unique machines
      const grouped = new Map<string, TopRiskySoftware>();
      for (const item of data || []) {
        const key = item.name;
        const existing = grouped.get(key);
        if (existing) {
          existing.machine_count++;
        } else {
          grouped.set(key, {
            name: item.name,
            vendor: item.vendor,
            risk_level: item.risk_level || 'unknown',
            machine_count: 1,
            first_seen_at: item.first_seen_at,
          });
        }
      }

      return Array.from(grouped.values())
        .sort((a, b) => {
          const riskOrder: Record<string, number> = { critical: 0, high: 1 };
          const riskDiff = (riskOrder[a.risk_level] ?? 9) - (riskOrder[b.risk_level] ?? 9);
          if (riskDiff !== 0) return riskDiff;
          return b.machine_count - a.machine_count;
        })
        .slice(0, limit);
    },
    enabled: !loading && !!activeTenant?.id,
    staleTime: 60 * 1000,
  });
}

export function useSoftwarePolicy() {
  const { activeTenant, loading } = useActiveTenant();

  return useQuery({
    queryKey: ['software-policy', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return null;

      const { data, error } = await supabase
        .from('tenant_software_policy')
        .select('*')
        .eq('tenant_id', activeTenant.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !loading && !!activeTenant?.id,
  });
}

export function useSoftwareKnowledgeBase() {
  return useQuery({
    queryKey: ['software-knowledge-base'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('software_knowledge_base')
        .select('*')
        .order('category', { ascending: true })
        .order('software_pattern', { ascending: true });

      if (error) throw error;
      return (data || []) as SoftwareKnowledgeRule[];
    },
  });
}

export function useCreateKnowledgeRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Omit<SoftwareKnowledgeRule, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('software_knowledge_base')
        .insert(rule)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['software-knowledge-base'] });
      toast.success('Regra criada com sucesso');
    },
    onError: (error) => {
      console.error('Error creating rule:', error);
      toast.error('Erro ao criar regra');
    },
  });
}

export function useUpdateKnowledgeRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SoftwareKnowledgeRule> & { id: string }) => {
      const { data, error } = await supabase
        .from('software_knowledge_base')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['software-knowledge-base'] });
      toast.success('Regra atualizada');
    },
    onError: (error) => {
      console.error('Error updating rule:', error);
      toast.error('Erro ao atualizar regra');
    },
  });
}

export function useDeleteKnowledgeRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('software_knowledge_base')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['software-knowledge-base'] });
      toast.success('Regra removida');
    },
    onError: (error) => {
      console.error('Error deleting rule:', error);
      toast.error('Erro ao remover regra');
    },
  });
}

export function useReclassifySoftware() {
  const { activeTenant } = useActiveTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!activeTenant?.id) throw new Error('No tenant');

      // Trigger reclassification by updating all software with unknown risk
      const { error } = await supabase
        .from('software_inventory')
        .update({ risk_level: 'unknown' })
        .eq('tenant_id', activeTenant.id)
        .eq('risk_level', 'unknown');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['software-risk-summary'] });
      queryClient.invalidateQueries({ queryKey: ['software-by-risk'] });
      toast.success('Reclassificação iniciada');
    },
    onError: (error) => {
      console.error('Error reclassifying:', error);
      toast.error('Erro ao reclassificar');
    },
  });
}
