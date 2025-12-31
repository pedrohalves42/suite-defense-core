import { useState } from 'react';
import { useActionCenter } from '@/hooks/useActionCenter';
import { useActionCenterHistory, ActionHistoryItem } from '@/hooks/useActionCenterHistory';
import { ActionCard, ActionCenterSection, EmptyActionCenter } from '@/components/action-center';
import { ActionCenterOverview } from '@/components/action-center/ActionCenterOverview';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, Target, ArrowRight, Clock, History, CheckCircle2, XCircle, Bot, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function HistoryItemCard({ item }: { item: ActionHistoryItem }) {
  const isResolved = item.status === 'resolved';
  const wasAutoExecuted = item.auto_action_executed;
  
  return (
    <Card className="border-l-4" style={{ borderLeftColor: isResolved ? 'hsl(var(--success))' : 'hsl(var(--muted))' }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isResolved ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="font-medium truncate">{item.title}</span>
              <Badge variant={isResolved ? 'default' : 'secondary'} className="shrink-0">
                {isResolved ? 'Resolvido' : 'Ignorado'}
              </Badge>
            </div>
            
            {item.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                {item.description}
              </p>
            )}
            
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {item.agent && (
                <span className="flex items-center gap-1">
                  <span className="font-medium">{item.agent.agent_name}</span>
                  {item.agent.hostname && (
                    <span className="text-muted-foreground">({item.agent.hostname})</span>
                  )}
                </span>
              )}
              
              <span className="flex items-center gap-1">
                {wasAutoExecuted ? (
                  <>
                    <Bot className="h-3 w-3" />
                    <span>Auto-executado</span>
                  </>
                ) : (
                  <>
                    <User className="h-3 w-3" />
                    <span>Manual</span>
                  </>
                )}
              </span>
              
              {item.resolved_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(item.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              )}
            </div>
          </div>
          
          <Badge variant="outline" className="shrink-0 capitalize">
            {item.severity}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ActionCenterDashboard() {
  const [activeTab, setActiveTab] = useState('pending');
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Central de Ações</h1>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
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
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                {totalActions}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Resolvidos
            {historyCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {historyCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending" className="mt-6">
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-8 w-48" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          {!isLoading && data && (
            <div className="space-y-6">
              {/* Overview Cards - Always Visible */}
              <ActionCenterOverview
                urgentCount={data.urgent?.length || 0}
                recommendedCount={data.recommended?.length || 0}
                healthyCount={healthyCount}
                offlineCount={offlineCount}
                totalAgents={totalAgents}
              />

              {/* Empty State - Only when no actions */}
              {totalActions === 0 && (data.informational?.length || 0) === 0 && (
                <EmptyActionCenter 
                  healthyCount={healthyCount}
                  offlineCount={offlineCount}
                  totalAgents={totalAgents}
                />
              )}

              {/* Urgent Actions */}
              {data.urgent && data.urgent.length > 0 && (
                <ActionCenterSection type="urgent" count={data.urgent.length}>
                  {data.urgent.map((item) => (
                    <ActionCard 
                      key={item.item_id} 
                      item={item}
                      onExecuted={() => refetch()}
                    />
                  ))}
                </ActionCenterSection>
              )}

              {/* Recommended Actions */}
              {data.recommended && data.recommended.length > 0 && (
                <ActionCenterSection type="recommended" count={data.recommended.length}>
                  {data.recommended.map((item) => (
                    <ActionCard 
                      key={item.item_id} 
                      item={item}
                      onExecuted={() => refetch()}
                    />
                  ))}
                </ActionCenterSection>
              )}

              {/* Informational Actions */}
              {data.informational && data.informational.length > 0 && (
                <ActionCenterSection type="informational" count={data.informational.length}>
                  {data.informational.map((item) => (
                    <ActionCard 
                      key={item.item_id} 
                      item={item}
                      compact
                      onExecuted={() => refetch()}
                    />
                  ))}
                </ActionCenterSection>
              )}

              {/* Healthy Status Footer - Only when there are actions */}
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
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
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
                    <p className="text-sm text-muted-foreground">
                      Mostrando últimas {historyData.length} ações
                    </p>
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
                    {historyData.map((item) => (
                      <HistoryItemCard key={item.id} item={item} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
