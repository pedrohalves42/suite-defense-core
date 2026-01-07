import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTaskStats, useOpenTasksCount } from '@/hooks/useTasks';
import { useNavigate } from 'react-router-dom';
import { 
  ListTodo, 
  AlertOctagon, 
  Clock, 
  ArrowRight,
  Loader2 
} from 'lucide-react';

export function TasksSummaryCard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useTaskStats();
  const { data: openCount } = useOpenTasksCount();

  const hasUrgentWork = (stats?.critical_open || 0) > 0 || (stats?.sla_breached || 0) > 0;

  return (
    <Card className={hasUrgentWork ? 'border-red-500' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ListTodo className="h-4 w-4" />
          Trabalho Pendente
        </CardTitle>
        {openCount ? (
          <Badge variant={hasUrgentWork ? 'destructive' : 'secondary'}>
            {openCount} {openCount === 1 ? 'task' : 'tasks'}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Critical and High Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <AlertOctagon className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-2xl font-bold text-red-500">{stats?.critical_open || 0}</p>
                  <p className="text-xs text-muted-foreground">Críticas</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold text-orange-500">{stats?.sla_breached || 0}</p>
                  <p className="text-xs text-muted-foreground">SLA Violado</p>
                </div>
              </div>
            </div>

            {/* Status breakdown */}
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Abertas</span>
                <span>{stats?.open_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Em progresso</span>
                <span>{stats?.in_progress_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Bloqueadas</span>
                <span>{stats?.blocked_count || 0}</span>
              </div>
            </div>

            {/* Resolution Time */}
            {stats?.avg_resolution_hours && (
              <div className="pt-2 border-t text-xs text-muted-foreground">
                <span>Tempo médio de resolução: </span>
                <span className="font-medium">{Math.round(stats.avg_resolution_hours)}h</span>
              </div>
            )}

            {/* Action Button */}
            <Button 
              onClick={() => navigate('/admin/tasks')} 
              className="w-full mt-2"
              variant={hasUrgentWork ? 'default' : 'outline'}
              size="sm"
            >
              Ver Central de Tarefas
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
