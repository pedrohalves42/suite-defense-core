import { useState } from 'react';
import { useActionCenter } from '@/hooks/useActionCenter';
import { useActionCenterHistory } from '@/hooks/useActionCenterHistory';
import { ActionCard, ActionCenterSection, EmptyActionCenter } from '@/components/action-center';
import { ActionCenterOverview } from '@/components/action-center/ActionCenterOverview';
import { NextBestAction } from '@/components/action-center/NextBestAction';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RefreshCw, Target, ArrowRight, Clock, History, CheckCircle2, XCircle, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { HistoryItemCard } from './components/HistoryItemCard';

export default function ActionCenterDashboard() {
  const [activeTab, setActiveTab] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const { data, isLoading, refetch, isRefetching } = useActionCenter();
  const { data: historyData, isLoading: historyLoading } = useActionCenterHistory();

  const totalActions = (data?.urgent?.length || 0) + (data?.recommended?.length || 0);
  const healthyCount = data?.healthy_count || 0;
  const offlineCount = data?.offline_count || 0;
  const totalAgents = data?.total_agents || 0;
  const historyCount = historyData?.length || 0;

  const lastUpdated = data?.generated_at
    ? formatDistanceToNow(new Date(data.generated_at), { addSuffix: true, locale: ptBR })
    : null;

  const filterItems = (items: typeof data.urgent) => {
    if (!items || !searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(item =>
      item.agent_name?.toLowerCase().includes(term) ||
      item.hostname?.toLowerCase().includes(term) ||
      item.title?.toLowerCase().includes(term) ||
      item.description?.toLowerCase().includes(term) ||
      item.trigger_type?.toLowerCase().includes(term)
    );
  };

  const filteredUrgent = filterItems(data?.urgent);
  const filteredRecommended = filterItems(data?.recommended);
  const filteredInformational = filterItems(data?.informational);

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Central de Ações
            </h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {totalActions > 0 ? (
                <span>{totalActions} {totalActions === 1 ? 'ação pendente' : 'ações pendentes'}</span>
              ) : (
                <span>Gerencie ações de segurança</span>
              )}
              {lastUpdated && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Atualizado {lastUpdated}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/playbooks">
              Ver Playbooks
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Pendentes
            {totalActions > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">{totalActions}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Resolvidos
            {historyCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">{historyCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending" className="mt-6">
          {isLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
              </div>
              <Skeleton className="h-8 w-48" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
              </div>
            </div>
          )}

          {!isLoading && data && (
            <div className="space-y-6">
              {totalActions > 0 && <NextBestAction onExecute={() => refetch()} />}

              <ActionCenterOverview
                urgentCount={data.urgent?.length || 0}
                recommendedCount={data.recommended?.length || 0}
                healthyCount={healthyCount}
                offlineCount={offlineCount}
                totalAgents={totalAgents}
              />

              {totalActions > 0 && (
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por agente, tipo de alerta..." value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
                </div>
              )}

              {totalActions === 0 && (data.informational?.length || 0) === 0 && (
                <EmptyActionCenter healthyCount={healthyCount} offlineCount={offlineCount} totalAgents={totalAgents} />
              )}

              {filteredUrgent && filteredUrgent.length > 0 && (
                <ActionCenterSection type="urgent" count={filteredUrgent.length}>
                  {filteredUrgent.map((item) => (
                    <ActionCard key={item.item_id} item={item} onExecuted={() => refetch()} />
                  ))}
                </ActionCenterSection>
              )}

              {filteredRecommended && filteredRecommended.length > 0 && (
                <ActionCenterSection type="recommended" count={filteredRecommended.length}>
                  {filteredRecommended.map((item) => (
                    <ActionCard key={item.item_id} item={item} onExecuted={() => refetch()} />
                  ))}
                </ActionCenterSection>
              )}

              {filteredInformational && filteredInformational.length > 0 && (
                <ActionCenterSection type="informational" count={filteredInformational.length}>
                  {filteredInformational.map((item) => (
                    <ActionCard key={item.item_id} item={item} compact onExecuted={() => refetch()} />
                  ))}
                </ActionCenterSection>
              )}

              {healthyCount > 0 && totalActions > 0 && (
                <div className="flex items-center justify-center gap-2 text-green-600 py-4 border-t">
                  <span className="text-lg">🟢</span>
                  <span className="text-sm">
                    {healthyCount} {healthyCount === 1 ? 'computador' : 'computadores'} com ambiente estável
                  </span>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          {historyLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          )}

          {!historyLoading && historyData && (
            <div className="space-y-4">
              {historyData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Nenhuma ação resolvida ainda</p>
                  <p className="text-sm">Quando você executar ou ignorar ações, elas aparecerão aqui.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Mostrando últimas {historyData.length} ações</p>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        {historyData.filter(i => i.status === 'resolved').length} resolvidas
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <XCircle className="h-4 w-4" />
                        {historyData.filter(i => i.status === 'ignored').length} ignoradas
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {historyData.map((item) => <HistoryItemCard key={item.id} item={item} />)}
                  </div>
                </>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </TooltipProvider>
  );
}
