import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface OpenPort {
  port: number;
  process: string;
  protocol: string;
}

export interface ActiveConnection {
  remote_address: string;
  remote_port: number;
  state: string;
}

export interface NetworkAdapter {
  name: string;
  ip_address: string;
  mac_address: string;
  status: string;
}

export interface NetworkInfo {
  id: string;
  agent_id: string;
  tenant_id: string;
  firewall_domain: boolean | null;
  firewall_private: boolean | null;
  firewall_public: boolean | null;
  open_ports: OpenPort[];
  active_connections: ActiveConnection[];
  network_adapters: NetworkAdapter[];
  dns_servers: string[];
  gateway_ip: string | null;
  public_ip: string | null;
  dns_test_success: boolean | null;
  https_test_success: boolean | null;
  collected_at: string;
}

async function fetchAgentNetworkInfo(agentId: string): Promise<NetworkInfo | null> {
  const { data, error } = await supabase
    .from('agent_network_info')
    .select('*')
    .eq('agent_id', agentId)
    .order('collected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[useAgentNetworkInfo] Error:', error);
    throw new Error(`Failed to fetch network info: ${error.message}`);
  }

  if (!data) return null;

  // Parse JSON fields safely
  const rawData = data as Record<string, unknown>;
  return {
    id: rawData.id as string,
    agent_id: rawData.agent_id as string,
    tenant_id: rawData.tenant_id as string,
    firewall_domain: rawData.firewall_domain as boolean | null,
    firewall_private: rawData.firewall_private as boolean | null,
    firewall_public: rawData.firewall_public as boolean | null,
    open_ports: (rawData.open_ports as OpenPort[]) || [],
    active_connections: (rawData.active_connections as ActiveConnection[]) || [],
    network_adapters: (rawData.network_adapters as NetworkAdapter[]) || [],
    dns_servers: (rawData.dns_servers as string[]) || [],
    gateway_ip: rawData.gateway_ip as string | null,
    public_ip: rawData.public_ip as string | null,
    dns_test_success: rawData.dns_test_success as boolean | null,
    https_test_success: rawData.https_test_success as boolean | null,
    collected_at: rawData.collected_at as string,
  };
}

export function useAgentNetworkInfo(agentId: string, enabled = true) {
  return useQuery({
    queryKey: ['agent-network-info', agentId],
    queryFn: () => fetchAgentNetworkInfo(agentId),
    enabled: enabled && !!agentId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
