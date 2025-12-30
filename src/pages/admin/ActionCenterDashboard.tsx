import { useActionCenter } from '@/hooks/useActionCenter';
import { ActionCard, ActionCenterSection, EmptyActionCenter } from '@/components/action-center';
import { ActionCenterOverview } from '@/components/action-center/ActionCenterOverview';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RefreshCw, Target, ArrowRight, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ActionCenterDashboard() {
  const { data, isLoading, refetch, isRefetching } = useActionCenter();

  const totalActions = (data?.urgent?.length || 0) + (data?.recommended?.length || 0);
  const healthyCount = data?.healthy_count || 0;
  const offlineCount = data?.offline_count || 0;
  const totalAgents = data?.total_agents || 0;

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
    </div>
  );
}
