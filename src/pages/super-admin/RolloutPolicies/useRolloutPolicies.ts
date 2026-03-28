import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RolloutPolicy } from "./types";

export function useRolloutPolicies() {
  const queryClient = useQueryClient();
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<RolloutPolicy>>({});

  const { data: policies, isLoading } = useQuery({
    queryKey: ['rollout-policies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_update_policies')
        .select('*')
        .order('platform');
      if (error) throw error;
      return data as RolloutPolicy[];
    }
  });

  const { data: releases } = useQuery({
    queryKey: ['agent-releases-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_releases_public')
        .select('version, platform')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<RolloutPolicy> & { platform: string }) => {
      const existing = policies?.find(p => p.platform === data.platform);
      if (existing) {
        const { error } = await supabase
          .from('agent_update_policies')
          .update({
            target_version: data.target_version,
            rollout_percentage: data.rollout_percentage,
            enabled: data.enabled,
            notes: data.notes,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agent_update_policies')
          .insert({
            platform: data.platform,
            target_version: data.target_version || '',
            rollout_percentage: data.rollout_percentage || 0,
            enabled: data.enabled || false,
            notes: data.notes
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rollout-policies'] });
      toast.success('Política de rollout salva');
      setEditingPolicy(null);
      setFormData({});
    },
    onError: (error) => { toast.error(`Erro ao salvar: ${error.message}`); }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('agent_update_policies')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rollout-policies'] });
      toast.success(variables.enabled ? 'Rollout ativado' : 'Rollout desativado (Kill Switch)');
    },
    onError: (error) => { toast.error(`Erro: ${error.message}`); }
  });

  const getPolicyForPlatform = (platform: string) => policies?.find(p => p.platform === platform);
  const getLatestVersionForPlatform = (platform: string) => releases?.find(r => r.platform === platform)?.version || 'N/A';

  const startEditing = (platform: string) => {
    const existing = getPolicyForPlatform(platform);
    setEditingPolicy(platform);
    setFormData(existing || { platform, rollout_percentage: 0, enabled: false });
  };

  const handleSave = (platform: string) => {
    saveMutation.mutate({ ...formData, platform } as RolloutPolicy);
  };

  const cancelEditing = () => { setEditingPolicy(null); setFormData({}); };

  return {
    policies, isLoading, editingPolicy, formData, setFormData,
    saveMutation, toggleMutation,
    getPolicyForPlatform, getLatestVersionForPlatform,
    startEditing, handleSave, cancelEditing,
  };
}
