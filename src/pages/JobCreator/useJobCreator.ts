import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RpcAgentRow } from '@/types/rpc';
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { Agent, Job } from "./types";

export function useJobCreator() {
  const { activeTenant: tenant, loading: tenantLoading } = useActiveTenant();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [latestVersion, setLatestVersion] = useState<string>("v3.10.35-OPTIMIZED-INTERVALS");

  const loadAgents = useCallback(async () => {
    if (!tenant?.id || tenantLoading) return;
    try {
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });
      if (error) throw error;
      const mapped = ((data || []) as unknown as RpcAgentRow[]).map((agent): Agent => ({
        id: agent.id,
        agent_name: agent.agent_name,
        hostname: agent.hostname,
        display_name: agent.display_name,
        status: agent.status,
        last_heartbeat: agent.last_heartbeat,
      })).sort((a, b) => a.agent_name.localeCompare(b.agent_name));
      setAgents(mapped);
    } catch (error) {
      logger.error("Erro ao carregar agentes", error);
      toast.error("Erro ao carregar lista de agentes");
    }
  }, [tenant?.id, tenantLoading]);

  const loadJobs = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) { setRecentJobs([]); return; }

      const { data: userRoles, error: roleError } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (roleError || !userRoles?.tenant_id) { setRecentJobs([]); return; }

      const { data, error } = await supabase
        .rpc('get_recent_jobs', { p_tenant_id: userRoles.tenant_id, p_limit: 50 });
      if (error) throw error;
      setRecentJobs(data || []);
    } catch (error) {
      logger.error("Erro ao carregar jobs", error);
    }
  }, []);

  const loadLatestVersion = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("agent_releases_public")
        .select("version")
        .eq("platform", "windows")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (data?.version) setLatestVersion(data.version);
    } catch (error) {
      logger.warn("Erro ao carregar versão mais recente", error);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    await Promise.all([loadAgents(), loadJobs(), loadLatestVersion()]);
    setLoadingData(false);
  }, [loadAgents, loadJobs, loadLatestVersion]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel(`jobs-creator-${tenant.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'jobs',
        filter: `tenant_id=eq.${tenant.id}`
      }, () => loadJobs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, loadJobs]);

  const clearPendingJobs = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("Tenant não encontrado");
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('tenant_id', tenant.id)
        .eq('status', 'queued')
        .lt('created_at', oneHourAgo);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tarefas pendentes limpas com sucesso"); loadJobs(); },
    onError: (error: Error) => { toast.error(`Erro ao limpar tarefas: ${error.message}`); }
  });

  const activeAgents = agents.filter(a => {
    if (!a.last_heartbeat) return false;
    return (new Date().getTime() - new Date(a.last_heartbeat).getTime()) < 30 * 60 * 1000;
  });

  return {
    tenant, agents, recentJobs, loadingData, latestVersion,
    activeAgents, loadJobs, clearPendingJobs,
  };
}
