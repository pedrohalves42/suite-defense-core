import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { getRiskInfo } from './constants';

export function useSecurityGraph() {
  const { tenant } = useTenant();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ danger: true, warning: true });
  const queryClient = useQueryClient();

  const buildGraph = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('populate-security-graph', {
        body: { tenant_id: tenant!.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['security-graph-nodes'] });
      queryClient.invalidateQueries({ queryKey: ['security-graph-edges'] });
      toast.success(`Análise concluída: ${data.nodes_created} itens encontrados`);
    },
    onError: (err: Error) => toast.error('Erro ao analisar: ' + err.message),
  });

  const autoBlock = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('auto-block-threats');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['blocked-websites'] });
      if (data.blocked === 0 && data.already_blocked > 0) {
        toast.info(`Todos os ${data.already_blocked} itens perigosos já estão bloqueados.`);
      } else if (data.blocked > 0) {
        toast.success(`${data.blocked} domínio(s) bloqueado(s) e sincronizado(s) com ${data.synced_agents} computador(es).`);
      } else {
        toast.info('Nenhum domínio/IP perigoso encontrado para bloquear.');
      }
    },
    onError: (err: Error) => toast.error('Erro ao bloquear: ' + err.message),
  });

  const { data: nodes = [], isLoading: nodesLoading } = useQuery({
    queryKey: ['security-graph-nodes', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_graph_nodes')
        .select('id, tenant_id, node_type, node_value, label, risk_score, first_seen_at, last_seen_at, metadata')
        .eq('tenant_id', tenant!.id)
        .order('risk_score', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: edges = [] } = useQuery({
    queryKey: ['security-graph-edges', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_graph_edges')
        .select('id, source_node_id, target_node_id, relationship')
        .eq('tenant_id', tenant!.id)
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const filteredNodes = useMemo(() => {
    if (!searchTerm) return nodes;
    const term = searchTerm.toLowerCase();
    return nodes.filter((n) =>
      (n.label || '').toLowerCase().includes(term) ||
      (n.node_value || '').toLowerCase().includes(term)
    );
  }, [nodes, searchTerm]);

  const riskGroups = useMemo(() => {
    const groups = { danger: [] as typeof nodes, warning: [] as typeof nodes, caution: [] as typeof nodes, safe: [] as typeof nodes };
    filteredNodes.forEach((n) => {
      const risk = getRiskInfo(n.risk_score);
      groups[risk.level].push(n);
    });
    return groups;
  }, [filteredNodes]);

  const connectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    const connectedIds = new Set<string>();
    edges.forEach((e) => {
      if (e.source_node_id === selectedNode.id) connectedIds.add(e.target_node_id);
      if (e.target_node_id === selectedNode.id) connectedIds.add(e.source_node_id);
    });
    return nodes.filter((n) => connectedIds.has(n.id));
  }, [selectedNode, edges, nodes]);

  const dangerCount = riskGroups.danger.length;
  const warningCount = riskGroups.warning.length;
  const safeCount = riskGroups.caution.length + riskGroups.safe.length;

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  return {
    tenant, searchTerm, setSearchTerm, selectedNode, setSelectedNode,
    expandedGroups, toggleGroup, buildGraph, autoBlock,
    nodes, nodesLoading, riskGroups, connectedNodes,
    dangerCount, warningCount, safeCount,
  };
}
