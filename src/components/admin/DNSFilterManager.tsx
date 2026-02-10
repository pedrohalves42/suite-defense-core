import { useState } from 'react';
import { useDNSFilter, DNSFilterStatus } from '@/hooks/useDNSFilter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Shield, 
  Download, 
  RefreshCw, 
  Send, 
  CheckCircle2, 
  Clock, 
  WifiOff, 
  AlertCircle,
  Loader2,
  Server,
  Database,
  ShieldCheck,
  ShieldX
} from 'lucide-react';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { motion, AnimatePresence } from 'framer-motion';

export function DNSFilterManager() {
  const {
    isEnabled,
    isLoading,
    agentStatuses,
    stats,
    enableDNSFilter,
    setupDNSFilter,
    setupAllAgents,
    syncBlockedWebsites,
    collectDNSBlocks,
    refetch,
  } = useDNSFilter();

  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

  const handleToggleAgent = (agentId: string) => {
    const newSelected = new Set(selectedAgents);
    if (newSelected.has(agentId)) {
      newSelected.delete(agentId);
    } else {
      newSelected.add(agentId);
    }
    setSelectedAgents(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedAgents.size === agentStatuses.length) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(agentStatuses.map(a => a.agentId)));
    }
  };

  const handleSetupSelected = () => {
    const agentIds = Array.from(selectedAgents);
    setupDNSFilter.mutate(agentIds);
    setSelectedAgents(new Set());
  };

  const handleSyncSelected = () => {
    const agentIds = Array.from(selectedAgents);
    syncBlockedWebsites.mutate(agentIds.length > 0 ? agentIds : undefined);
    setSelectedAgents(new Set());
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (agent: DNSFilterStatus) => {
    if (!agent.isOnline) return <WifiOff className="h-4 w-4 text-muted-foreground" />;
    if (agent.pendingSetup) return <Loader2 className="h-4 w-4 text-info animate-spin" />;
    if (agent.pendingSync) return <Loader2 className="h-4 w-4 text-warning animate-spin" />;
    if (agent.dnsFilterInstalled) return <ShieldCheck className="h-4 w-4 text-success" />;
    return <ShieldX className="h-4 w-4 text-destructive" />;
  };

  const getStatusBadge = (agent: DNSFilterStatus) => {
    if (!agent.isOnline) {
      return <Badge variant="outline" className="bg-muted text-muted-foreground">Offline</Badge>;
    }
    if (agent.pendingSetup) {
      return <Badge variant="outline" className="bg-info/10 text-info border-info/30">Instalando...</Badge>;
    }
    if (agent.pendingSync) {
      return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Sincronizando...</Badge>;
    }
    if (agent.dnsFilterInstalled) {
      return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Protegido</Badge>;
    }
    return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Não instalado</Badge>;
  };

  return (
    <div className="space-y-6" data-testid="dns-filter-manager">
      {/* Feature Toggle Card */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                DNS Filter Local
              </CardTitle>
              <CardDescription>
                Bloqueia acesso a sites proibidos diretamente nos computadores via DNS local
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="dns-filter-toggle" className="text-sm">
                {isEnabled ? 'Habilitado' : 'Desabilitado'}
              </Label>
              <Switch
                id="dns-filter-toggle"
                data-testid="dns-filter-toggle"
                checked={isEnabled}
                onCheckedChange={(checked) => enableDNSFilter.mutate(checked)}
                disabled={enableDNSFilter.isPending}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {!isEnabled && (
        <Alert data-testid="dns-filter-disabled-alert">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>DNS Filter desabilitado</AlertTitle>
          <AlertDescription>
            Ative o DNS Filter acima para habilitar o bloqueio local de websites nos computadores monitorados.
            Isso irá instalar um serviço de DNS local que bloqueia domínios proibidos.
          </AlertDescription>
        </Alert>
      )}

      <AnimatePresence>
        {isEnabled && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4" data-testid="dns-filter-stats">
              <Card data-testid="dns-filter-stats-online">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Server className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{stats.onlineAgents}/{stats.totalAgents}</div>
                      <div className="text-xs text-muted-foreground">Computadores Online</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="dns-filter-stats-installed">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-success/10">
                      <ShieldCheck className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-success">{stats.installedCount}</div>
                      <div className="text-xs text-muted-foreground">DNS Filter Instalado</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="dns-filter-stats-pending">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-warning/10">
                      <Clock className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-warning">{stats.pendingInstallCount + stats.pendingSyncCount}</div>
                      <div className="text-xs text-muted-foreground">Jobs Pendentes</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="dns-filter-stats-synced">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-info/10">
                      <Database className="h-5 w-5 text-info" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-info">{stats.syncedCount}</div>
                      <div className="text-xs text-muted-foreground">Sincronizados (24h)</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Actions Bar */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Ações em Massa</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetch()}
                      data-testid="dns-filter-refresh"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Atualizar
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setupAllAgents.mutate()}
                      disabled={setupAllAgents.isPending || stats.onlineAgents === stats.installedCount}
                      data-testid="dns-filter-install-all"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {setupAllAgents.isPending ? 'Instalando...' : 'Instalar em Todos'}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => syncBlockedWebsites.mutate(undefined)}
                      disabled={syncBlockedWebsites.isPending || stats.onlineAgents === 0}
                      data-testid="dns-filter-sync-all"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {syncBlockedWebsites.isPending ? 'Sincronizando...' : 'Sincronizar Todos'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => collectDNSBlocks.mutate(undefined)}
                      disabled={collectDNSBlocks.isPending || stats.onlineAgents === 0}
                      data-testid="dns-filter-collect-events"
                    >
                      <Database className="h-4 w-4 mr-2" />
                      {collectDNSBlocks.isPending ? 'Coletando...' : 'Coletar Eventos'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedAgents.size > 0 && (
                  <div className="flex items-center gap-4 p-3 mb-4 rounded-lg bg-accent/50 border">
                    <span className="text-sm font-medium">{selectedAgents.size} selecionado(s)</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSetupSelected}
                      disabled={setupDNSFilter.isPending}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Instalar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSyncSelected}
                      disabled={syncBlockedWebsites.isPending}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Sincronizar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedAgents(new Set())}
                    >
                      Limpar
                    </Button>
                  </div>
                )}

                {/* Agent List */}
                <div className="border rounded-lg" data-testid="dns-filter-agent-list">
                  <div className="flex items-center gap-3 p-3 border-b bg-muted/50">
                    <Checkbox
                      checked={selectedAgents.size === agentStatuses.length && agentStatuses.length > 0}
                      onCheckedChange={handleSelectAll}
                      data-testid="dns-filter-select-all"
                    />
                    <span className="text-sm font-medium">Selecionar todos</span>
                  </div>
                  <ScrollArea className="h-[400px]">
                    <div className="divide-y">
                      {agentStatuses.map(agent => (
                        <div
                          key={agent.agentId}
                          data-testid="dns-filter-agent-row"
                          className="flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={selectedAgents.has(agent.agentId)}
                              onCheckedChange={() => handleToggleAgent(agent.agentId)}
                            />
                            {getStatusIcon(agent)}
                            <div>
                              <div className="font-medium text-sm">
                                {agent.displayName || agent.agentName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {agent.lastBlockSyncAt
                                  ? `Sincronizado ${formatDistanceToNow(new Date(agent.lastBlockSyncAt), { addSuffix: true, locale: ptBR })}`
                                  : 'Nunca sincronizado'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(agent)}
                            {agent.isOnline && !agent.dnsFilterInstalled && !agent.pendingSetup && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setupDNSFilter.mutate([agent.agentId])}
                                disabled={setupDNSFilter.isPending}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      {agentStatuses.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground" data-testid="dns-filter-empty-state">
                          Nenhum computador encontrado
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>

            {/* How it works */}
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Como funciona o DNS Filter?</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3 text-sm">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-bold text-primary">1</span>
                    </div>
                    <div>
                      <div className="font-medium">Instalação</div>
                      <div className="text-muted-foreground">
                        Um serviço DNS local é instalado no computador que intercepta todas as consultas DNS.
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-bold text-primary">2</span>
                    </div>
                    <div>
                      <div className="font-medium">Sincronização</div>
                      <div className="text-muted-foreground">
                        A lista de sites bloqueados é sincronizada automaticamente do painel para o computador.
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-bold text-primary">3</span>
                    </div>
                    <div>
                      <div className="font-medium">Bloqueio</div>
                      <div className="text-muted-foreground">
                        Quando um usuário tenta acessar um site bloqueado, o DNS retorna erro e o acesso é impedido.
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
