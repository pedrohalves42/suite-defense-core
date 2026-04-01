import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, RefreshCw, Target, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSyncThreatFeeds } from '@/hooks/useThreatIntel';
import { StatsOverview } from './components/StatsOverview';
import { SeverityBreakdown } from './components/SeverityBreakdown';
import { SourceBreakdown } from './components/SourceBreakdown';
import { IndicatorsList } from './components/IndicatorsList';
import { MatchesList } from './components/MatchesList';
import { SyncHistory } from './components/SyncHistory';

export function ThreatIntelDashboard() {
  const syncMutation = useSyncThreatFeeds();

  const handleSync = () => {
    toast.info('Sincronizando feeds de ameaças...');
    syncMutation.mutate(undefined, {
      onSuccess: () => toast.success('Feeds sincronizados com sucesso!'),
      onError: (err) => toast.error(`Erro ao sincronizar: ${err.message}`),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Threat Intelligence
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoramento de indicadores de comprometimento (IoCs) via feeds globais
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncMutation.isPending} variant="default">
          {syncMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sincronizar Feeds
        </Button>
      </div>

      <StatsOverview />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SeverityBreakdown />
        <SourceBreakdown />
      </div>

      <Tabs defaultValue="indicators" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="indicators">
            <Target className="h-4 w-4 mr-2" />
            Indicadores
          </TabsTrigger>
          <TabsTrigger value="matches">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Matches
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="h-4 w-4 mr-2" />
            Histórico de Sync
          </TabsTrigger>
        </TabsList>

        <TabsContent value="indicators">
          <Card>
            <CardHeader>
              <CardTitle>Indicadores de Comprometimento (IoCs)</CardTitle>
              <CardDescription>Hashes de malware, URLs maliciosas e IPs de C2 dos feeds Abuse.ch</CardDescription>
            </CardHeader>
            <CardContent><IndicatorsList /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matches">
          <Card>
            <CardHeader>
              <CardTitle>Matches na Frota</CardTitle>
              <CardDescription>IoCs encontrados nos endpoints monitorados</CardDescription>
            </CardHeader>
            <CardContent><MatchesList /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Sincronização</CardTitle>
              <CardDescription>Registro de todas as sincronizações com feeds externos</CardDescription>
            </CardHeader>
            <CardContent><SyncHistory /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ThreatIntelDashboard;
