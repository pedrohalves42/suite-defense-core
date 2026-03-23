import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Network, RefreshCw, Loader2, Search, AlertTriangle, Globe, Monitor, Shield, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

const nodeTypeConfig: Record<string, { color: string; label: string; icon: typeof Globe }> = {
  agent: { color: "hsl(var(--primary))", label: "Agente", icon: Monitor },
  process: { color: "hsl(270 70% 60%)", label: "Processo", icon: Shield },
  ip: { color: "hsl(var(--destructive))", label: "IP", icon: Globe },
  domain: { color: "hsl(35 90% 55%)", label: "Domínio", icon: Globe },
  hash: { color: "hsl(160 60% 45%)", label: "Hash", icon: Shield },
  user: { color: "hsl(190 80% 45%)", label: "Usuário", icon: Monitor },
  file: { color: "hsl(240 60% 60%)", label: "Arquivo", icon: Shield },
  cve: { color: "hsl(330 70% 55%)", label: "CVE", icon: AlertTriangle },
};

function getRiskLevel(score: number) {
  if (score >= 80) return { label: "Crítico", className: "bg-destructive/15 text-destructive border-destructive/30" };
  if (score >= 60) return { label: "Alto", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
  if (score >= 40) return { label: "Médio", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" };
  return { label: "Baixo", className: "bg-green-500/15 text-green-400 border-green-500/30" };
}

export default function SecurityGraph() {
  const { tenant } = useTenant();
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
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
      toast.success(`Grafo atualizado: ${data.nodes_created} entidades, ${data.edges_created} conexões`);
    },
    onError: (err: any) => toast.error("Erro ao construir grafo: " + err.message),
  });

  const { data: nodes = [], isLoading: nodesLoading } = useQuery({
    queryKey: ["security-graph-nodes", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_graph_nodes")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("risk_score", { ascending: false })
        .limit(500);
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

  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (filterType !== "all") result = result.filter((n: any) => n.node_type === filterType);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((n: any) =>
        (n.label || "").toLowerCase().includes(term) ||
        (n.node_value || "").toLowerCase().includes(term)
      );
    }
    return result;
  }, [nodes, filterType, searchTerm]);

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    nodes.forEach((n: any) => { byType[n.node_type] = (byType[n.node_type] || 0) + 1; });
    const critical = nodes.filter((n: any) => n.risk_score >= 80).length;
    const high = nodes.filter((n: any) => n.risk_score >= 60 && n.risk_score < 80).length;
    return { total: nodes.length, edges: edges.length, byType, critical, high };
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

  // Group nodes by type for the summary
  const groupedByType = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredNodes.forEach((n: any) => {
      if (!groups[n.node_type]) groups[n.node_type] = [];
      groups[n.node_type].push(n);
    });
    return groups;
  }, [filteredNodes]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Mapa de Segurança
          </h1>
          <p className="text-sm text-muted-foreground">Entidades detectadas na rede e suas conexões</p>
        </div>
        <Button
          onClick={() => buildGraph.mutate()}
          disabled={buildGraph.isPending || !tenant?.id}
          size="sm"
        >
          {buildGraph.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {buildGraph.isPending ? "Atualizando..." : "Atualizar Grafo"}
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Entidades</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.edges}</p>
            <p className="text-xs text-muted-foreground">Conexões</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.critical}</p>
            <p className="text-xs text-muted-foreground">Risco Crítico</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{stats.high}</p>
            <p className="text-xs text-muted-foreground">Risco Alto</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por IP, domínio, agente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filtrar por tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos ({nodes.length})</SelectItem>
            {Object.entries(nodeTypeConfig).map(([k, v]) => {
              const count = stats.byType[k] || 0;
              if (count === 0) return null;
              return <SelectItem key={k} value={k}>{v.label} ({count})</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Entity List */}
        <Card className="lg:col-span-2 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Entidades {filteredNodes.length !== nodes.length && `(${filteredNodes.length} de ${nodes.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {nodesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredNodes.length === 0 ? (
              <div className="text-center py-16 px-4">
                <Network className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">
                  {nodes.length === 0
                    ? 'Nenhuma entidade mapeada. Clique em "Atualizar Grafo" para analisar a rede.'
                    : "Nenhum resultado para o filtro aplicado."}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[520px]">
                <div className="divide-y divide-border/50">
                  {Object.entries(groupedByType).map(([type, typeNodes]) => (
                    <div key={type}>
                      {/* Group header */}
                      <div className="px-4 py-2 bg-muted/30 sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: nodeTypeConfig[type]?.color || "hsl(var(--muted-foreground))" }} />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {nodeTypeConfig[type]?.label || type} ({typeNodes.length})
                          </span>
                        </div>
                      </div>
                      {/* Items */}
                      {typeNodes.map((node: any) => {
                        const risk = getRiskLevel(node.risk_score);
                        const isSelected = selectedNode?.id === node.id;
                        return (
                          <button
                            key={node.id}
                            onClick={() => setSelectedNode(node)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40 ${
                              isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-mono truncate text-foreground">
                                {node.label || node.node_value}
                              </p>
                            </div>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${risk.className}`}>
                              {node.risk_score}
                            </Badge>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Detail Panel */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Detalhes</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedNode ? (
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Tipo</p>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: nodeTypeConfig[selectedNode.node_type]?.color }} />
                    <span className="text-sm font-medium text-foreground">{nodeTypeConfig[selectedNode.node_type]?.label}</span>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Valor</p>
                  <p className="font-mono text-sm break-all text-foreground bg-muted/30 rounded p-2">{selectedNode.node_value}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Nível de Risco</p>
                  {(() => {
                    const risk = getRiskLevel(selectedNode.risk_score);
                    return (
                      <div className="flex items-center gap-3">
                        <span className={`text-2xl font-bold ${
                          selectedNode.risk_score >= 80 ? "text-destructive" :
                          selectedNode.risk_score >= 60 ? "text-orange-400" :
                          selectedNode.risk_score >= 40 ? "text-yellow-400" : "text-green-400"
                        }`}>
                          {selectedNode.risk_score}
                        </span>
                        <div>
                          <span className="text-xs text-muted-foreground">/100</span>
                          <Badge variant="outline" className={`ml-2 text-[10px] ${risk.className}`}>{risk.label}</Badge>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Risk bar */}
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        selectedNode.risk_score >= 80 ? "bg-destructive" :
                        selectedNode.risk_score >= 60 ? "bg-orange-400" :
                        selectedNode.risk_score >= 40 ? "bg-yellow-400" : "bg-green-400"
                      }`}
                      style={{ width: `${selectedNode.risk_score}%` }}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Detectado em</p>
                  <p className="text-sm text-foreground">{new Date(selectedNode.first_seen_at).toLocaleString("pt-BR")}</p>
                </div>

                {selectedNode.last_seen_at && selectedNode.last_seen_at !== selectedNode.first_seen_at && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Última atividade</p>
                    <p className="text-sm text-foreground">{new Date(selectedNode.last_seen_at).toLocaleString("pt-BR")}</p>
                  </div>
                )}

                {connectedNodes.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                      Conexões ({connectedNodes.length})
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {connectedNodes.map((cn: any) => (
                        <button
                          key={cn.id}
                          onClick={() => setSelectedNode(cn)}
                          className="flex items-center gap-2 w-full p-2 rounded-md text-left hover:bg-muted/50 transition-colors"
                        >
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: nodeTypeConfig[cn.node_type]?.color }} />
                          <span className="text-xs truncate text-foreground">{cn.label || cn.node_value}</span>
                          <Badge variant="outline" className="text-[9px] ml-auto shrink-0">{cn.risk_score}</Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <Shield className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Selecione uma entidade para ver detalhes</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Distribution Summary */}
      {Object.keys(stats.byType).length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distribuição por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {Object.entries(stats.byType)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type === filterType ? "all" : type)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors border ${
                      filterType === type ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: nodeTypeConfig[type]?.color }} />
                    <span className="text-muted-foreground">{nodeTypeConfig[type]?.label}:</span>
                    <span className="font-semibold text-foreground">{count}</span>
                  </button>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
