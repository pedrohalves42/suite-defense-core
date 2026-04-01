import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Loader2, Search, AlertTriangle, Shield, ShieldAlert, ShieldCheck, ChevronDown, ChevronUp, Info, Ban, Globe } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSecurityGraph } from './useSecurityGraph';
import { typeLabels, sourceExplanations, getRiskInfo, riskGroupConfig } from './constants';

const getTypeLabel = (type: string) => typeLabels[type]?.label || type;
const getTypeIcon = (type: string) => {
  const Icon = typeLabels[type]?.icon || Globe;
  return <Icon className="h-3.5 w-3.5" />;
};

export default function SecurityGraph() {
  const {
    tenant, searchTerm, setSearchTerm, selectedNode, setSelectedNode,
    expandedGroups, toggleGroup, buildGraph, autoBlock,
    nodes, nodesLoading, riskGroups, connectedNodes,
    dangerCount, warningCount, safeCount,
  } = useSecurityGraph();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Mapa de Segurança
          </h1>
          <p className="text-sm text-muted-foreground">Visão geral de tudo que foi detectado na sua rede</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => autoBlock.mutate()} disabled={autoBlock.isPending || !tenant?.id || dangerCount === 0} size="sm" variant="destructive">
            {autoBlock.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
            {autoBlock.isPending ? 'Bloqueando...' : `Bloquear Perigosos (${dangerCount})`}
          </Button>
          <Button onClick={() => buildGraph.mutate()} disabled={buildGraph.isPending || !tenant?.id} size="sm" variant="outline">
            {buildGraph.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {buildGraph.isPending ? 'Analisando...' : 'Analisar Rede'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-destructive/20">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-destructive shrink-0" />
            <div><p className="text-2xl font-bold text-destructive">{dangerCount}</p><p className="text-xs text-muted-foreground">Itens perigosos</p></div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-orange-400 shrink-0" />
            <div><p className="text-2xl font-bold text-orange-400">{warningCount}</p><p className="text-xs text-muted-foreground">Precisam de atenção</p></div>
          </CardContent>
        </Card>
        <Card className="border-green-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-green-400 shrink-0" />
            <div><p className="text-2xl font-bold text-green-400">{safeCount}</p><p className="text-xs text-muted-foreground">Seguros</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Danger alert */}
      {nodes.length > 0 && dangerCount > 0 && (
        <Alert className="border-destructive/30 bg-destructive/5">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-sm flex items-center justify-between">
            <span>
              <strong>{dangerCount} {dangerCount === 1 ? 'item perigoso foi encontrado' : 'itens perigosos foram encontrados'}</strong> na sua rede.
              Use o botão <strong>"Bloquear Perigosos"</strong> acima para bloquear automaticamente o acesso a esses sites/IPs em todos os computadores.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por site, computador ou endereço..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
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
                <p className="text-sm text-muted-foreground mb-4">Clique em "Analisar Rede" para o sistema verificar todos os sites, IPs e computadores da sua rede.</p>
                <Button onClick={() => buildGraph.mutate()} disabled={buildGraph.isPending} size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />Analisar Rede
                </Button>
              </CardContent>
            </Card>
          ) : (
            riskGroupConfig.map(({ key, title, subtitle, headerClass }) => {
              const items = riskGroups[key as keyof typeof riskGroups];
              if (items.length === 0) return null;
              const isOpen = expandedGroups[key] ?? false;
              return (
                <Collapsible key={key} open={isOpen} onOpenChange={() => toggleGroup(key)}>
                  <Card className="border-border/50 overflow-hidden">
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
                      <ScrollArea className={items.length > 8 ? 'h-[360px]' : ''}>
                        <div className="divide-y divide-border/30">
                          {items.map((node) => {
                            const risk = getRiskInfo(node.risk_score);
                            const isSelected = selectedNode?.id === node.id;
                            return (
                              <button key={node.id} onClick={() => setSelectedNode(node)}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}>
                                <div className="shrink-0 text-muted-foreground">{getTypeIcon(node.node_type)}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm truncate text-foreground">{node.label || node.node_value}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {(() => {
                                      const meta = (node.metadata ?? {}) as Record<string, string>;
                                      const src = meta?.source;
                                      if (src && sourceExplanations[src]) return sourceExplanations[src].name;
                                      return getTypeLabel(node.node_type);
                                    })()}
                                  </p>
                                </div>
                                <Badge variant="outline" className={`text-[10px] shrink-0 ${risk.badgeClass}`}>{risk.label}</Badge>
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
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">O que é</p>
                    <div className="flex items-center gap-2 mb-1">
                      {getTypeIcon(selectedNode.node_type)}
                      <span className="text-sm font-medium text-foreground">{getTypeLabel(selectedNode.node_type)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{typeLabels[selectedNode.node_type]?.description}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Endereço</p>
                    <p className="text-sm break-all text-foreground bg-muted/30 rounded-md p-2.5 font-mono">{selectedNode.node_value}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Nível de Perigo</p>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{risk.emoji}</span>
                      <span className={`text-lg font-bold ${risk.textClass}`}>{risk.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{risk.description}</p>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${risk.barClass}`} style={{ width: `${selectedNode.risk_score}%` }} />
                    </div>
                  </div>
                  {(() => {
                    const meta = (selectedNode.metadata ?? {}) as Record<string, string>;
                    const src = meta?.source;
                    const sourceInfo = src ? sourceExplanations[src] : null;
                    if (!sourceInfo && selectedNode.risk_score < 60) return null;
                    return (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-destructive/80 mb-1.5 font-semibold">⚠️ Por que é perigoso?</p>
                        <p className="text-sm text-foreground leading-relaxed">{sourceInfo?.reason || 'Este item apresentou comportamento suspeito detectado pela análise automática de segurança.'}</p>
                        {sourceInfo && <p className="text-[11px] text-muted-foreground mt-2">Fonte: <span className="font-medium">{sourceInfo.name}</span>{meta?.confidence && <> · Confiança: {meta.confidence}%</>}</p>}
                      </div>
                    );
                  })()}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Quando foi detectado</p>
                    <p className="text-sm text-foreground">{new Date(selectedNode.first_seen_at).toLocaleString('pt-BR')}</p>
                  </div>
                  {connectedNodes.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Ligado a ({connectedNodes.length})</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {connectedNodes.map((cn) => {
                          const cnRisk = getRiskInfo(cn.risk_score);
                          return (
                            <button key={cn.id} onClick={() => setSelectedNode(cn)}
                              className="flex items-center gap-2 w-full p-2 rounded-md text-left hover:bg-muted/50 transition-colors">
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
                <p className="text-sm text-muted-foreground">Clique em um item da lista para ver os detalhes aqui</p>
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
                <p><strong>O que é este mapa?</strong> O sistema analisa automaticamente todos os sites, endereços IP e computadores que aparecem na sua rede e classifica cada um por nível de perigo.</p>
                <p>Itens marcados como <span className="text-destructive font-medium">Perigosos</span> foram encontrados em bases de dados de ameaças conhecidas. Itens <span className="text-green-400 font-medium">Seguros</span> são recursos normais da sua rede.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
