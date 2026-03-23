import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Loader2, Search, AlertTriangle, Globe, Monitor, Shield, ShieldAlert, ShieldCheck, ChevronDown, ChevronUp, ExternalLink, Info, Ban, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/* ─── Friendly labels ─── */
const typeLabels: Record<string, { label: string; description: string; icon: typeof Globe }> = {
  agent: { label: "Computadores", description: "Máquinas da sua rede monitoradas", icon: Monitor },
  domain: { label: "Sites Externos", description: "Endereços de sites acessados ou detectados", icon: Globe },
  ip: { label: "Endereços IP", description: "IPs de servidores acessados", icon: Globe },
  process: { label: "Programas", description: "Softwares detectados nas máquinas", icon: Shield },
  hash: { label: "Arquivos Analisados", description: "Impressões digitais de arquivos verificados", icon: Shield },
  user: { label: "Usuários", description: "Contas de usuários detectadas", icon: Monitor },
  file: { label: "Arquivos", description: "Arquivos monitorados", icon: Shield },
  cve: { label: "Vulnerabilidades", description: "Falhas de segurança conhecidas", icon: AlertTriangle },
};

/* ─── Source explanations for non-technical users ─── */
const sourceExplanations: Record<string, { name: string; reason: string }> = {
  abuse_ch_urlhaus: {
    name: "URLhaus (Abuse.ch)",
    reason: "Este endereço foi reportado como distribuidor de malware (vírus) por pesquisadores de segurança do mundo todo.",
  },
  abuse_ch_feodotracker: {
    name: "Feodo Tracker (Abuse.ch)",
    reason: "Este IP é usado por criminosos para controlar computadores infectados (servidor de comando e controle).",
  },
  abuse_ch_malwarebazaar: {
    name: "MalwareBazaar (Abuse.ch)",
    reason: "Este arquivo foi identificado como malware (software malicioso) por múltiplos laboratórios de segurança.",
  },
  alienvault_otx: {
    name: "AlienVault OTX",
    reason: "Identificado como ameaça pela comunidade global de inteligência de ameaças AlienVault.",
  },
  virustotal: {
    name: "VirusTotal",
    reason: "Detectado como malicioso por múltiplos antivírus no VirusTotal.",
  },
  cybershield_network: {
    name: "Rede CyberShield",
    reason: "Detectado pela análise de comportamento da rede CyberShield.",
  },
  internal: {
    name: "Detecção Interna",
    reason: "Identificado pela análise comportamental do agente instalado na máquina.",
  },
  edr_detection: {
    name: "Detecção EDR",
    reason: "O sistema de proteção detectou comportamento suspeito neste item.",
  },
  network_telemetry: {
    name: "Análise de Rede",
    reason: "Detectado pela análise do tráfego de rede dos computadores monitorados.",
  },
};

function getRiskInfo(score: number) {
  if (score >= 80) return {
    level: "danger" as const,
    label: "Perigoso",
    emoji: "🔴",
    description: "Pode representar uma ameaça à segurança",
    badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
    barClass: "bg-destructive",
    textClass: "text-destructive",
  };
  if (score >= 60) return {
    level: "warning" as const,
    label: "Atenção",
    emoji: "🟠",
    description: "Requer análise — pode ser suspeito",
    badgeClass: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    barClass: "bg-orange-400",
    textClass: "text-orange-400",
  };
  if (score >= 40) return {
    level: "caution" as const,
    label: "Moderado",
    emoji: "🟡",
    description: "Risco baixo, mas vale monitorar",
    badgeClass: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    barClass: "bg-yellow-400",
    textClass: "text-yellow-400",
  };
  return {
    level: "safe" as const,
    label: "Seguro",
    emoji: "🟢",
    description: "Sem risco identificado",
    badgeClass: "bg-green-500/15 text-green-400 border-green-500/30",
    barClass: "bg-green-400",
    textClass: "text-green-400",
  };
}

export default function SecurityGraph() {
  const { tenant } = useTenant();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ danger: true, warning: true });
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
      toast.success(`Análise concluída: ${data.nodes_created} itens encontrados`);
    },
    onError: (err: any) => toast.error("Erro ao analisar: " + err.message),
  });

  const autoBlock = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("auto-block-threats");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["blocked-websites"] });
      if (data.blocked === 0 && data.already_blocked > 0) {
        toast.info(`Todos os ${data.already_blocked} itens perigosos já estão bloqueados.`);
      } else if (data.blocked > 0) {
        toast.success(
          `${data.blocked} domínio(s) bloqueado(s) e sincronizado(s) com ${data.synced_agents} computador(es).`
        );
      } else {
        toast.info("Nenhum domínio/IP perigoso encontrado para bloquear.");
      }
    },
    onError: (err: any) => toast.error("Erro ao bloquear: " + err.message),
  });

  const { data: nodes = [], isLoading: nodesLoading } = useQuery({
    queryKey: ["security-graph-nodes", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_graph_nodes")
        .select("id, tenant_id, node_type, node_value, label, risk_score, first_seen_at, last_seen_at, metadata")
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
        .select("id, source_node_id, target_node_id, relationship")
        .eq("tenant_id", tenant!.id)
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const filteredNodes = useMemo(() => {
    if (!searchTerm) return nodes;
    const term = searchTerm.toLowerCase();
    return nodes.filter((n: any) =>
      (n.label || "").toLowerCase().includes(term) ||
      (n.node_value || "").toLowerCase().includes(term)
    );
  }, [nodes, searchTerm]);

  // Group by risk level
  const riskGroups = useMemo(() => {
    const groups = {
      danger: [] as any[],
      warning: [] as any[],
      caution: [] as any[],
      safe: [] as any[],
    };
    filteredNodes.forEach((n: any) => {
      const risk = getRiskInfo(n.risk_score);
      groups[risk.level].push(n);
    });
    return groups;
  }, [filteredNodes]);

  const connectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    const connectedIds = new Set<string>();
    edges.forEach((e: any) => {
      if (e.source_node_id === selectedNode.id) connectedIds.add(e.target_node_id);
      if (e.target_node_id === selectedNode.id) connectedIds.add(e.source_node_id);
    });
    return nodes.filter((n: any) => connectedIds.has(n.id));
  }, [selectedNode, edges, nodes]);

  const dangerCount = riskGroups.danger.length;
  const warningCount = riskGroups.warning.length;
  const safeCount = riskGroups.caution.length + riskGroups.safe.length;

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const getTypeLabel = (type: string) => typeLabels[type]?.label || type;
  const getTypeIcon = (type: string) => {
    const Icon = typeLabels[type]?.icon || Globe;
    return <Icon className="h-3.5 w-3.5" />;
  };

  const riskGroupConfig = [
    {
      key: "danger",
      title: "🔴 Itens Perigosos",
      subtitle: "Podem representar ameaças — verifique com atenção",
      items: riskGroups.danger,
      headerClass: "bg-destructive/10 border-destructive/20",
      countClass: "text-destructive",
    },
    {
      key: "warning",
      title: "🟠 Itens que Precisam de Atenção",
      subtitle: "Podem ser suspeitos — recomendamos análise",
      items: riskGroups.warning,
      headerClass: "bg-orange-500/10 border-orange-500/20",
      countClass: "text-orange-400",
    },
    {
      key: "caution",
      title: "🟡 Itens Moderados",
      subtitle: "Risco baixo, monitorados automaticamente",
      items: riskGroups.caution,
      headerClass: "bg-yellow-500/10 border-yellow-500/20",
      countClass: "text-yellow-400",
    },
    {
      key: "safe",
      title: "🟢 Itens Seguros",
      subtitle: "Sem risco detectado",
      items: riskGroups.safe,
      headerClass: "bg-green-500/10 border-green-500/20",
      countClass: "text-green-400",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Mapa de Segurança
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão geral de tudo que foi detectado na sua rede
          </p>
        </div>
        <Button
          onClick={() => buildGraph.mutate()}
          disabled={buildGraph.isPending || !tenant?.id}
          size="sm"
        >
          {buildGraph.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {buildGraph.isPending ? "Analisando..." : "Analisar Rede"}
        </Button>
      </div>

      {/* Summary Cards — plain language */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-destructive/20">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-destructive shrink-0" />
            <div>
              <p className="text-2xl font-bold text-destructive">{dangerCount}</p>
              <p className="text-xs text-muted-foreground">Itens perigosos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-orange-400 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-orange-400">{warningCount}</p>
              <p className="text-xs text-muted-foreground">Precisam de atenção</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-green-400 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-green-400">{safeCount}</p>
              <p className="text-xs text-muted-foreground">Seguros</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Explanation for layperson */}
      {nodes.length > 0 && dangerCount > 0 && (
        <Alert className="border-destructive/30 bg-destructive/5">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-sm">
            <strong>{dangerCount} {dangerCount === 1 ? 'item perigoso foi encontrado' : 'itens perigosos foram encontrados'}</strong> na sua rede.
            São sites ou endereços que podem ser maliciosos. Clique em cada item para ver mais detalhes.
          </AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por site, computador ou endereço..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Grouped List */}
        <div className="lg:col-span-2 space-y-3">
          {nodesLoading ? (
            <Card className="border-border/50">
              <CardContent className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                <span className="text-muted-foreground">Carregando dados...</span>
              </CardContent>
            </Card>
          ) : nodes.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="text-center py-16 px-4">
                <Shield className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="font-medium text-foreground mb-1">Nenhum dado para mostrar</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Clique em "Analisar Rede" para o sistema verificar todos os sites, IPs e computadores da sua rede.
                </p>
                <Button onClick={() => buildGraph.mutate()} disabled={buildGraph.isPending} size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Analisar Rede
                </Button>
              </CardContent>
            </Card>
          ) : (
            riskGroupConfig.map(({ key, title, subtitle, items, headerClass }) => {
              if (items.length === 0) return null;
              const isOpen = expandedGroups[key] ?? false;
              return (
                <Collapsible key={key} open={isOpen} onOpenChange={() => toggleGroup(key)}>
                  <Card className={`border-border/50 overflow-hidden`}>
                    <CollapsibleTrigger className="w-full">
                      <div className={`flex items-center justify-between px-4 py-3 ${headerClass} border-b cursor-pointer hover:opacity-90 transition-opacity`}>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-foreground">{title} ({items.length})</p>
                          <p className="text-xs text-muted-foreground">{subtitle}</p>
                        </div>
                        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ScrollArea className={items.length > 8 ? "h-[360px]" : ""}>
                        <div className="divide-y divide-border/30">
                          {items.map((node: any) => {
                            const risk = getRiskInfo(node.risk_score);
                            const isSelected = selectedNode?.id === node.id;
                            return (
                              <button
                                key={node.id}
                                onClick={() => setSelectedNode(node)}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 ${
                                  isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"
                                }`}
                              >
                                <div className="shrink-0 text-muted-foreground">
                                  {getTypeIcon(node.node_type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm truncate text-foreground">
                                    {node.label || node.node_value}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {(() => {
                                      const meta = node.metadata as any;
                                      const src = meta?.source;
                                      if (src && sourceExplanations[src]) {
                                        return sourceExplanations[src].name;
                                      }
                                      return getTypeLabel(node.node_type);
                                    })()}
                                  </p>
                                </div>
                                <Badge variant="outline" className={`text-[10px] shrink-0 ${risk.badgeClass}`}>
                                  {risk.label}
                                </Badge>
                              </button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })
          )}
        </div>

        {/* Detail Panel */}
        <Card className="border-border/50 h-fit sticky top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Detalhes do Item</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedNode ? (() => {
              const risk = getRiskInfo(selectedNode.risk_score);
              return (
                <div className="space-y-5">
                  {/* What is it */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">O que é</p>
                    <div className="flex items-center gap-2 mb-1">
                      {getTypeIcon(selectedNode.node_type)}
                      <span className="text-sm font-medium text-foreground">{getTypeLabel(selectedNode.node_type)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {typeLabels[selectedNode.node_type]?.description}
                    </p>
                  </div>

                  {/* Address/value */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Endereço</p>
                    <p className="text-sm break-all text-foreground bg-muted/30 rounded-md p-2.5 font-mono">
                      {selectedNode.node_value}
                    </p>
                  </div>

                  {/* Risk — human-readable */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Nível de Perigo</p>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{risk.emoji}</span>
                      <span className={`text-lg font-bold ${risk.textClass}`}>{risk.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{risk.description}</p>
                    {/* Simple visual bar */}
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${risk.barClass}`}
                        style={{ width: `${selectedNode.risk_score}%` }}
                      />
                    </div>
                  </div>

                  {/* WHY it's dangerous — the key missing info */}
                  {(() => {
                    const meta = selectedNode.metadata as any;
                    const src = meta?.source;
                    const sourceInfo = src ? sourceExplanations[src] : null;
                    if (!sourceInfo && selectedNode.risk_score < 60) return null;
                    return (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-destructive/80 mb-1.5 font-semibold">
                          ⚠️ Por que é perigoso?
                        </p>
                        <p className="text-sm text-foreground leading-relaxed">
                          {sourceInfo?.reason || "Este item apresentou comportamento suspeito detectado pela análise automática de segurança."}
                        </p>
                        {sourceInfo && (
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Fonte: <span className="font-medium">{sourceInfo.name}</span>
                            {meta?.confidence && <> · Confiança: {meta.confidence}%</>}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* When */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Quando foi detectado</p>
                    <p className="text-sm text-foreground">
                      {new Date(selectedNode.first_seen_at).toLocaleString("pt-BR")}
                    </p>
                  </div>

                  {/* Connections */}
                  {connectedNodes.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                        Ligado a ({connectedNodes.length})
                      </p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {connectedNodes.map((cn: any) => {
                          const cnRisk = getRiskInfo(cn.risk_score);
                          return (
                            <button
                              key={cn.id}
                              onClick={() => setSelectedNode(cn)}
                              className="flex items-center gap-2 w-full p-2 rounded-md text-left hover:bg-muted/50 transition-colors"
                            >
                              {getTypeIcon(cn.node_type)}
                              <span className="text-xs truncate text-foreground flex-1">{cn.label || cn.node_value}</span>
                              <span className="text-[10px]">{cnRisk.emoji}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })() : (
              <div className="text-center py-10">
                <Info className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  Clique em um item da lista para ver os detalhes aqui
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom summary */}
      {nodes.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <strong>O que é este mapa?</strong> O sistema analisa automaticamente todos os sites, endereços IP e computadores
                  que aparecem na sua rede e classifica cada um por nível de perigo.
                </p>
                <p>
                  Itens marcados como <span className="text-destructive font-medium">Perigosos</span> foram encontrados
                  em bases de dados de ameaças conhecidas. Itens <span className="text-green-400 font-medium">Seguros</span> são
                  recursos normais da sua rede.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
