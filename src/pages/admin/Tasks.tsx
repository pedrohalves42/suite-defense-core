import { useState } from 'react';
import { useTasks, useTaskStats, useUpdateTaskStatus, type Task, type TaskStatus, type TaskSeverity, type TaskFilters } from '@/hooks/useTasks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ListTodo, 
  AlertOctagon,
  Timer,
  TrendingUp,
  Ban,
  Play,
  Eye,
  XCircle,
  Loader2,
  Brain,
  Bell,
  Shield,
  Crosshair
} from 'lucide-react';
import { formatDistanceToNow, format, ptBR } from '@/lib/date-utils';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';

const severityConfig: Record<TaskSeverity, { label: string; color: string; icon: React.ReactNode }> = {
  critical: { label: 'Crítico', color: 'bg-red-500', icon: <AlertOctagon className="h-4 w-4" /> },
  high: { label: 'Alto', color: 'bg-orange-500', icon: <AlertTriangle className="h-4 w-4" /> },
  medium: { label: 'Médio', color: 'bg-yellow-500', icon: <Timer className="h-4 w-4" /> },
  low: { label: 'Baixo', color: 'bg-blue-500', icon: <TrendingUp className="h-4 w-4" /> },
  info: { label: 'Info', color: 'bg-slate-500', icon: <Eye className="h-4 w-4" /> },
};

const statusConfig: Record<TaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: 'Aberta', color: 'bg-yellow-500', icon: <ListTodo className="h-4 w-4" /> },
  in_progress: { label: 'Em Progresso', color: 'bg-blue-500', icon: <Play className="h-4 w-4" /> },
  blocked: { label: 'Bloqueada', color: 'bg-red-500', icon: <Ban className="h-4 w-4" /> },
  resolved: { label: 'Resolvida', color: 'bg-green-500', icon: <CheckCircle2 className="h-4 w-4" /> },
  ignored: { label: 'Ignorada', color: 'bg-slate-500', icon: <XCircle className="h-4 w-4" /> },
  accepted_risk: { label: 'Risco Aceito', color: 'bg-orange-500', icon: <AlertTriangle className="h-4 w-4" /> },
};

const sourceTypeConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  ai_insight: { label: 'Sugestão IA', icon: <Brain className="h-4 w-4" /> },
  system_alert: { label: 'Alerta', icon: <Bell className="h-4 w-4" /> },
  playbook_execution: { label: 'Plano de Ação', icon: <Shield className="h-4 w-4" /> },
  red_team: { label: 'Teste de Resistência', icon: <Crosshair className="h-4 w-4" /> },
  manual: { label: 'Manual', icon: <ListTodo className="h-4 w-4" /> },
  job: { label: 'Verificação Falha', icon: <AlertTriangle className="h-4 w-4 text-orange-500" /> },
  dlq: { label: 'Erro de Processamento', icon: <AlertOctagon className="h-4 w-4 text-red-500" /> },
  incident_group: { label: 'Grupo de Incidentes', icon: <AlertTriangle className="h-4 w-4" /> },
};

export default function Tasks() {
  const [selectedTab, setSelectedTab] = useState<string>('active');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  
  const filters: TaskFilters = {
    status: selectedTab === 'active' 
      ? ['open', 'in_progress', 'blocked'] 
      : selectedTab === 'resolved' 
        ? ['resolved', 'ignored'] 
        : undefined,
    severity: severityFilter !== 'all' ? [severityFilter as TaskSeverity] : undefined,
  };

  const { data: tasks, isLoading } = useTasks(filters);
  const { data: stats } = useTaskStats();
  const updateStatus = useUpdateTaskStatus();

  const handleQuickAction = (task: Task, newStatus: TaskStatus) => {
    updateStatus.mutate({ 
      taskId: task.id, 
      status: newStatus,
      closureReason: newStatus === 'resolved' ? 'Resolvido via ação rápida' : undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground">
            Gerencie trabalho pendente de sugestões, alertas e ações
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tarefas Abertas</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.open_count || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.in_progress_count || 0} em progresso
            </p>
          </CardContent>
        </Card>
        
        <Card className={stats?.critical_open ? 'border-red-500' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Críticas</CardTitle>
            <AlertOctagon className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats?.critical_open || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.high_open || 0} alta prioridade
            </p>
          </CardContent>
        </Card>
        
        <Card className={stats?.sla_breached ? 'border-orange-500' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SLA Violado</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats?.sla_breached || 0}</div>
            <p className="text-xs text-muted-foreground">
              Requerem atenção imediata
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.avg_resolution_hours 
                ? `${Math.round(stats.avg_resolution_hours)}h` 
                : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              Para resolução
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="active" className="gap-2">
                    <ListTodo className="h-4 w-4" />
                    Ativas
                    {stats && (stats.open_count + stats.in_progress_count) > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {stats.open_count + stats.in_progress_count}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="resolved" className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Resolvidas
                  </TabsTrigger>
                  <TabsTrigger value="all" className="gap-2">
                    Todas
                  </TabsTrigger>
                </TabsList>

                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Severidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="critical">Crítico</SelectItem>
                    <SelectItem value="high">Alto</SelectItem>
                    <SelectItem value="medium">Médio</SelectItem>
                    <SelectItem value="low">Baixo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Tabs>
          </div>
        </CardHeader>
        
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !tasks || tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold">Nenhuma task pendente</h3>
              <p className="text-sm text-muted-foreground">
                Todas as tasks foram resolvidas ou não há tasks para os filtros selecionados.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {tasks.map((task) => (
                  <TaskRow 
                    key={task.id} 
                    task={task} 
                    onSelect={() => setSelectedTask(task)}
                    onQuickAction={handleQuickAction}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Task Detail Drawer */}
      <TaskDetailDrawer 
        task={selectedTask} 
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  onSelect: () => void;
  onQuickAction: (task: Task, status: TaskStatus) => void;
}

function TaskRow({ task, onSelect, onQuickAction }: TaskRowProps) {
  const severity = severityConfig[task.severity];
  const status = statusConfig[task.status];
  const source = sourceTypeConfig[task.source_type] || { label: task.source_type || 'Desconhecido', icon: <ListTodo className="h-4 w-4" /> };
  const isSlaBreach = !!task.sla_breached_at;
  const isActive = task.status === 'open' || task.status === 'in_progress';

  return (
    <div 
      className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors ${
        isSlaBreach && isActive ? 'border-orange-500 bg-orange-500/5' : ''
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-4 flex-1">
        {/* Severity Badge */}
        <div className={`p-2 rounded-full ${severity.color} text-white`}>
          {severity.icon}
        </div>

        {/* Task Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium truncate">{task.title}</h4>
            {isSlaBreach && isActive && (
              <Badge variant="destructive" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                SLA
              </Badge>
            )}
            {task.requires_human_review && (
              <Badge variant="outline" className="text-xs">
                Revisão Humana
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              {source.icon}
              <span>{source.label}</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <span>
              {formatDistanceToNow(new Date(task.created_at), { 
                addSuffix: true, 
                locale: ptBR 
              })}
            </span>
            {task.due_at && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <span className={isSlaBreach ? 'text-orange-500' : ''}>
                  Prazo: {format(new Date(task.due_at), 'dd/MM HH:mm')}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Status & Actions */}
      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <Badge variant="outline" className="gap-1">
          {status.icon}
          {status.label}
        </Badge>

        {isActive && (
          <div className="flex gap-1">
            {task.status === 'open' && (
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => onQuickAction(task, 'in_progress')}
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
            <Button 
              size="sm" 
              variant="ghost" 
              className="text-green-600"
              onClick={() => onQuickAction(task, 'resolved')}
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
