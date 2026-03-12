import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Network, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

const nodeTypeColors: Record<string, string> = {
  agent: "#3b82f6",
  process: "#8b5cf6",
  ip: "#ef4444",
  domain: "#f59e0b",
  hash: "#10b981",
  user: "#06b6d4",
  file: "#6366f1",
  cve: "#ec4899",
};

const nodeTypeLabels: Record<string, string> = {
  agent: "Agente", process: "Processo", ip: "IP", domain: "Domínio",
  hash: "Hash", user: "Usuário", file: "Arquivo", cve: "CVE",
};

export default function SecurityGraph() {
  const { tenant } = useTenant();
  const [filterType, setFilterType] = useState("all");
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const queryClient = useQueryClient();

  const buildGraph = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("populate-security-graph", {
        body: { tenant_id: tenant!.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["security-graph-nodes"] });
      queryClient.invalidateQueries({ queryKey: ["security-graph-edges"] });
      toast.success(`Grafo construído: ${data.nodes_created} nós e ${data.edges_created} conexões`);
    },
    onError: (err: any) => toast.error("Erro ao construir grafo: " + err.message),
  });

  const { data: nodes = [], isLoading: nodesLoading } = useQuery({
    queryKey: ["security-graph-nodes", tenant?.id, filterType],
    queryFn: async () => {
      let query = supabase
        .from("security_graph_nodes")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("risk_score", { ascending: false })
        .limit(200);
      if (filterType !== "all") query = query.eq("node_type", filterType);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: edges = [] } = useQuery({
    queryKey: ["security-graph-edges", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_graph_edges")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    nodes.forEach((n: any) => { byType[n.node_type] = (byType[n.node_type] || 0) + 1; });
    const highRisk = nodes.filter((n: any) => n.risk_score >= 70).length;
    return { total: nodes.length, edges: edges.length, byType, highRisk };
  }, [nodes, edges]);

  const connectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    const connectedIds = new Set<string>();
    edges.forEach((e: any) => {
      if (e.source_node_id === selectedNode.id) connectedIds.add(e.target_node_id);
      if (e.target_node_id === selectedNode.id) connectedIds.add(e.source_node_id);
    });
    return nodes.filter((n: any) => connectedIds.has(n.id));
  }, [selectedNode, edges, nodes]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" /> Security Graph
          </h1>
          <p className="text-muted-foreground">Visualize relacionamentos entre entidades de segurança</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => buildGraph.mutate()}
            disabled={buildGraph.isPending || !tenant?.id}
            variant="default"
          >
            {buildGraph.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {buildGraph.isPending ? "Construindo..." : "Construir Grafo"}
          </Button>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(nodeTypeLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Nós no Grafo</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.edges}</p>
          <p className="text-xs text-muted-foreground">Conexões</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.highRisk}</p>
          <p className="text-xs text-muted-foreground">Alto Risco (≥70)</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-foreground">{Object.keys(stats.byType).length}</p>
          <p className="text-xs text-muted-foreground">Tipos de Entidade</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graph Visualization (Node List View) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Mapa de Entidades</CardTitle>
          </CardHeader>
          <CardContent>
            {nodesLoading ? (
              <p className="text-muted-foreground text-center py-12">Carregando grafo...</p>
            ) : nodes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Network className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum nó no grafo. O grafo é construído automaticamente a partir de processos, conexões e IoCs.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto">
                {nodes.map((node: any) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`p-3 rounded-lg border text-left transition-all hover:ring-2 hover:ring-primary/50 ${
                      selectedNode?.id === node.id ? "ring-2 ring-primary bg-primary/5" : "bg-card"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: nodeTypeColors[node.node_type] || "#888" }} />
                      <span className="text-xs font-medium text-muted-foreground">{nodeTypeLabels[node.node_type]}</span>
                    </div>
                    <p className="text-sm font-mono truncate text-foreground">{node.label || node.node_value}</p>
                    {node.risk_score > 0 && (
                      <Badge variant="outline" className={`mt-1 text-xs ${node.risk_score >= 70 ? "text-red-400" : node.risk_score >= 40 ? "text-yellow-400" : "text-green-400"}`}>
                        Risk: {node.risk_score}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Node Detail */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Detalhes do Nó</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedNode ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <Badge style={{ backgroundColor: nodeTypeColors[selectedNode.node_type] + "20", color: nodeTypeColors[selectedNode.node_type] }}>
                    {nodeTypeLabels[selectedNode.node_type]}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="font-mono text-sm break-all text-foreground">{selectedNode.node_value}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Risk Score</p>
                  <p className={`text-lg font-bold ${selectedNode.risk_score >= 70 ? "text-red-400" : selectedNode.risk_score >= 40 ? "text-yellow-400" : "text-green-400"}`}>
                    {selectedNode.risk_score}/100
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Primeiro visto</p>
                  <p className="text-sm">{new Date(selectedNode.first_seen_at).toLocaleString("pt-BR")}</p>
                </div>
                {connectedNodes.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Conexões ({connectedNodes.length})</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {connectedNodes.map((cn: any) => (
                        <button key={cn.id} onClick={() => setSelectedNode(cn)}
                          className="flex items-center gap-2 w-full p-2 rounded text-left hover:bg-muted/50">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: nodeTypeColors[cn.node_type] }} />
                          <span className="text-xs truncate">{cn.label || cn.node_value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">Selecione um nó para ver detalhes</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Type Distribution */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Distribuição por Tipo</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.byType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: nodeTypeColors[type] }} />
                <span className="text-sm">{nodeTypeLabels[type]}: <strong>{count}</strong></span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
