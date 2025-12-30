import { useActionCenter } from '@/hooks/useActionCenter';
import { ActionCard, ActionCenterSection, EmptyActionCenter } from '@/components/action-center';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RefreshCw, Target, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ActionCenterDashboard() {
  const { data, isLoading, refetch, isRefetching } = useActionCenter();

  const totalActions = (data?.urgent?.length || 0) + (data?.recommended?.length || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Central de Ações</h1>
            <p className="text-muted-foreground">
              {totalActions > 0 
                ? `${totalActions} ${totalActions === 1 ? 'ação pendente' : 'ações pendentes'}`
                : 'Gerencie ações de segurança prioritárias'
              }
            </p>
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
          <Skeleton className="h-8 w-48" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {!isLoading && data && (
        <div className="space-y-8">
          {/* Empty State */}
          {totalActions === 0 && (data.informational?.length || 0) === 0 && (
            <EmptyActionCenter healthyCount={data.healthy_count} />
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

          {/* Healthy Status Footer */}
          {data.healthy_count > 0 && totalActions > 0 && (
            <div className="flex items-center justify-center gap-2 text-green-600 py-4 border-t">
              <span className="text-lg">🟢</span>
              <span className="text-sm">
                {data.healthy_count} {data.healthy_count === 1 ? 'computador' : 'computadores'} com ambiente estável
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
