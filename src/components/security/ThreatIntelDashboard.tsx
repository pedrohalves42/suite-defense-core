import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Shield,
  Globe,
  AlertTriangle,
  RefreshCw,
  Target,
  Activity,
  Clock,
  Loader2,
  FileWarning,
  Link2,
  Hash,
  Server,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  useThreatIntelStats,
  useThreatIndicators,
  useThreatMatches,
  useThreatFeedSyncLog,
  useSyncThreatFeeds,
} from '@/hooks/useThreatIntel';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  unknown: 'bg-muted text-muted-foreground border-border',
};

const typeIcons: Record<string, React.ReactNode> = {
  file_hash_sha256: <Hash className="h-4 w-4" />,
  file_hash_md5: <Hash className="h-4 w-4" />,
  file_hash_sha1: <Hash className="h-4 w-4" />,
  url: <Link2 className="h-4 w-4" />,
  ip_address: <Server className="h-4 w-4" />,
  domain: <Globe className="h-4 w-4" />,
  email: <FileWarning className="h-4 w-4" />,
  cve: <AlertTriangle className="h-4 w-4" />,
};

const sourceLabels: Record<string, string> = {
  abuse_ch_malwarebazaar: 'MalwareBazaar',
  abuse_ch_urlhaus: 'URLhaus',
  abuse_ch_feodotracker: 'Feodo Tracker',
  alienvault_otx: 'AlienVault OTX',
  virustotal: 'VirusTotal',
  manual: 'Manual',
  internal: 'Internal',
};

function StatsOverview() {
  const { data: stats, isLoading } = useThreatIntelStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-6 h-24" />
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Indicadores Ativos',
      value: stats?.total_indicators ?? 0,
      icon: <Target className="h-5 w-5 text-primary" />,
      color: 'text-primary',
    },
    {
      label: 'Matches Abertos',
      value: stats?.open_matches ?? 0,
      icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
      color: 'text-destructive',
    },
    {
      label: 'Matches (24h)',
      value: stats?.total_matches_24h ?? 0,
      icon: <Activity className="h-5 w-5 text-orange-400" />,
      color: 'text-orange-400',
    },
    {
      label: 'Último Sync',
      value: stats?.last_sync?.completed_at
        ? formatDistanceToNow(new Date(stats.last_sync.completed_at), { addSuffix: true, locale: ptBR })
        : 'Nunca',
      icon: <Clock className="h-5 w-5 text-muted-foreground" />,
      color: 'text-muted-foreground',
      small: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.color} ${card.small ? 'text-base' : ''}`}>
                    {card.value}
                  </p>
                </div>
                {card.icon}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function SeverityBreakdown() {
  const { data: stats } = useThreatIntelStats();
  const bySeverity = stats?.by_severity ?? {};
  const total = Object.values(bySeverity).reduce((a, b) => a + b, 0);

  const severityOrder = ['critical', 'high', 'medium', 'low', 'unknown'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Distribuição por Severidade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {severityOrder.map(sev => {
          const count = bySeverity[sev] ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={sev} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <Badge variant="outline" className={severityColors[sev]}>
                  {sev.toUpperCase()}
                </Badge>
                <span className="text-muted-foreground">{count}</span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SourceBreakdown() {
  const { data: stats } = useThreatIntelStats();
  const bySource = stats?.by_source ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Feeds Ativos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(bySource).map(([source, count]) => (
          <div key={source} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{sourceLabels[source] ?? source}</span>
            <Badge variant="secondary">{count}</Badge>
          </div>
        ))}
        {Object.keys(bySource).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum feed sincronizado ainda. Clique em "Sincronizar Feeds" para começar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function IndicatorsList() {
  const { data: indicators, isLoading } = useThreatIndicators({ limit: 100 });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-2">
        {(indicators ?? []).map((ind: Record<string, unknown>) => (
          <Card key={ind.id as string} className="border-border/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {typeIcons[ind.indicator_type as string] ?? <Target className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate">{ind.indicator_value as string}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {(ind.indicator_type as string).replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${severityColors[ind.severity as string] ?? ''}`}>
                      {(ind.severity as string).toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {sourceLabels[ind.source as string] ?? ind.source as string}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Confiança: {ind.confidence_score as number}%
                </div>
              </div>
              {((ind.tags as string[]) ?? []).length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {(ind.tags as string[]).slice(0, 5).map((tag: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {(indicators ?? []).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum indicador de ameaça encontrado.</p>
            <p className="text-sm">Sincronize os feeds para começar a monitorar.</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function MatchesList() {
  const { data: matches, isLoading } = useThreatMatches();

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-2">
        {(matches ?? []).map((match: Record<string, unknown>) => (
          <Card key={match.id as string} className="border-destructive/20">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{match.match_context as string}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Agent: {match.agent_id as string}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={severityColors[match.severity as string] ?? ''}>
                    {(match.severity as string).toUpperCase()}
                  </Badge>
                  <Badge variant={match.status === 'open' ? 'destructive' : 'secondary'}>
                    {match.status as string}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {(matches ?? []).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-30 text-green-500" />
            <p>Nenhum match de ameaça encontrado na frota.</p>
            <p className="text-sm">Seus endpoints estão limpos!</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function SyncHistory() {
  const { data: logs, isLoading } = useThreatFeedSyncLog();

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-2">
        {(logs ?? []).map((log: Record<string, unknown>) => (
          <Card key={log.id as string} className="border-border/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {log.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : log.status === 'failed' ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <span className="text-sm font-medium">
                    {sourceLabels[log.feed_source as string] ?? log.feed_source as string}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {log.status === 'completed' && (
                    <>
                      <span>+{log.indicators_new as number} novos</span>
                      <span>{log.indicators_updated as number} atualizados</span>
                    </>
                  )}
                  {log.sync_completed_at && (
                    <span>
                      {formatDistanceToNow(new Date(log.sync_completed_at as string), { addSuffix: true, locale: ptBR })}
                    </span>
                  )}
                </div>
              </div>
              {log.error_message && (
                <p className="text-xs text-destructive mt-1">{log.error_message as string}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

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
      {/* Header */}
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
        <Button
          onClick={handleSync}
          disabled={syncMutation.isPending}
          variant="default"
        >
          {syncMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sincronizar Feeds
        </Button>
      </div>

      {/* Stats */}
      <StatsOverview />

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SeverityBreakdown />
        <SourceBreakdown />
      </div>

      {/* Detailed Tabs */}
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
              <CardDescription>
                Hashes de malware, URLs maliciosas e IPs de C2 dos feeds Abuse.ch
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IndicatorsList />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matches">
          <Card>
            <CardHeader>
              <CardTitle>Matches na Frota</CardTitle>
              <CardDescription>
                IoCs encontrados nos endpoints monitorados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MatchesList />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Sincronização</CardTitle>
              <CardDescription>
                Registro de todas as sincronizações com feeds externos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SyncHistory />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ThreatIntelDashboard;
