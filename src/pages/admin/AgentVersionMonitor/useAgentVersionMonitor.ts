import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';

export interface AgentWithCapabilities {
  id: string;
  agent_name: string;
  hostname: string | null;
  agent_version: string | null;
  ed25519_supported: boolean | null;
  signature_mode: string | null;
  status: string;
  last_heartbeat: string | null;
  os_type: string | null;
}

export function useAgentVersionMonitor() {
  const { tenant } = useTenant();
  const { toast } = useToast();

  const { data: agents, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['agent-version-monitor', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      if (error) throw error;
      return ((data || []) as unknown as AgentWithCapabilities[]).sort((a, b) =>
        (a.agent_name || '').localeCompare(b.agent_name || '')
      );
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  const { data: latestRelease } = useQuery({
    queryKey: ['latest-agent-release'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_releases_public')
        .select('version')
        .eq('is_active', true)
        .eq('platform', 'windows')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.version || null;
    },
  });

  const stats = agents ? {
    total: agents.length,
    onLatest: agents.filter(a => a.agent_version === latestRelease).length,
    withEd25519: agents.filter(a => a.ed25519_supported === true).length,
    withoutEd25519: agents.filter(a => a.ed25519_supported === false).length,
    unknownEd25519: agents.filter(a => a.ed25519_supported === null).length,
    strictMode: agents.filter(a => a.signature_mode === 'strict').length,
    auditMode: agents.filter(a => a.signature_mode === 'audit_only').length,
    unknownMode: agents.filter(a => !a.signature_mode).length,
    online: agents.filter(a => {
      if (!a.last_heartbeat) return false;
      return Date.now() - new Date(a.last_heartbeat).getTime() < 5 * 60 * 1000;
    }).length,
  } : null;

  const versionGroups = agents?.reduce((acc, agent) => {
    const version = agent.agent_version || 'Desconhecida';
    if (!acc[version]) acc[version] = [];
    acc[version].push(agent);
    return acc;
  }, {} as Record<string, AgentWithCapabilities[]>) || {};

  const sortedVersions = Object.entries(versionGroups)
    .sort(([a], [b]) => {
      if (a === 'Desconhecida') return 1;
      if (b === 'Desconhecida') return -1;
      return b.localeCompare(a, undefined, { numeric: true });
    });

  const handleForceUpdate = async (agentId: string, agentName: string) => {
    if (!latestRelease) {
      toast({ title: 'Erro', description: 'Nenhuma versão de release ativa encontrada', variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('agents')
      .update({ force_update_version: latestRelease, force_update_reason: 'Forced via Version Monitor Dashboard', force_update_at: new Date().toISOString() })
      .eq('id', agentId)
      .eq('tenant_id', tenant!.id);
    if (error) {
      toast({ title: 'Erro', description: `Falha ao agendar update: ${error.message}`, variant: 'destructive' });
    } else {
      toast({ title: 'Update Agendado', description: `${agentName} será atualizado para ${latestRelease} no próximo heartbeat` });
      refetch();
    }
  };

  const handleForceUpdateAll = async () => {
    if (!latestRelease || !agents) {
      toast({ title: 'Erro', description: 'Nenhuma versão de release ativa encontrada', variant: 'destructive' });
      return;
    }
    const outdatedAgents = agents.filter(a => a.agent_version !== latestRelease);
    if (outdatedAgents.length === 0) {
      toast({ title: 'Info', description: 'Todos os agentes já estão na versão mais recente' });
      return;
    }
    const { error } = await supabase
      .from('agents')
      .update({ force_update_version: latestRelease, force_update_reason: 'Bulk force update via Version Monitor', force_update_at: new Date().toISOString() })
      .in('id', outdatedAgents.map(a => a.id));
    if (error) {
      toast({ title: 'Erro', description: `Falha ao agendar updates: ${error.message}`, variant: 'destructive' });
    } else {
      toast({ title: 'Updates Agendados', description: `${outdatedAgents.length} agentes serão atualizados para ${latestRelease}` });
      refetch();
    }
  };

  return {
    agents, isLoading, refetch, isRefetching,
    latestRelease, stats, sortedVersions,
    handleForceUpdate, handleForceUpdateAll,
  };
}
