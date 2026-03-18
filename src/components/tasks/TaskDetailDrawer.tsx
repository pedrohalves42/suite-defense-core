import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  AlertOctagon,
  Timer,
  TrendingUp,
  Eye,
  Play,
  XCircle,
  Ban,
  Brain,
  Bell,
  Shield,
  Crosshair,
  ListTodo,
  RotateCcw,
  Loader2,
  History,
  FileText,
  Package,
  ShieldAlert
} from 'lucide-react';
import { formatDistanceToNow, ptBR, formatBrazil } from '@/lib/date-utils';
import { 
  useUpdateTaskStatus, 
  type Task, 
  type TaskStatus, 
  type TaskSeverity 
} from '@/hooks/useTasks';
import { TaskTimeline } from './TaskTimeline';
import { TaskEvidenceTab } from './TaskEvidenceTab';
import { AcceptRiskDialog } from './AcceptRiskDialog';

interface TaskDetailDrawerProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
}

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
  ai_insight: { label: 'Sugestão IA', icon: <Brain className="h-5 w-5" /> },
  system_alert: { label: 'Alerta do Sistema', icon: <Bell className="h-5 w-5" /> },
  playbook_execution: { label: 'Plano de Ação', icon: <Shield className="h-5 w-5" /> },
  red_team: { label: 'Teste de Resistência', icon: <Crosshair className="h-5 w-5" /> },
  manual: { label: 'Criação Manual', icon: <ListTodo className="h-5 w-5" /> },
  job: { label: 'Verificação Falha', icon: <AlertTriangle className="h-5 w-5" /> },
  dlq: { label: 'Erro de Processamento', icon: <AlertOctagon className="h-5 w-5" /> },
  incident_group: { label: 'Grupo de Incidentes', icon: <AlertTriangle className="h-5 w-5" /> },
};

export function TaskDetailDrawer({ task, open, onClose }: TaskDetailDrawerProps) {
  const [closureReason, setClosureReason] = useState('');
  const [acceptRiskDialogOpen, setAcceptRiskDialogOpen] = useState(false);
  const updateStatus = useUpdateTaskStatus();

  if (!task) return null;

  const severity = severityConfig[task.severity];
  const status = statusConfig[task.status];
  const source = sourceTypeConfig[task.source_type];
  const isActive = task.status === 'open' || task.status === 'in_progress';
  const isSlaBreach = !!task.sla_breached_at;

  const handleStatusChange = (newStatus: TaskStatus) => {
    updateStatus.mutate({
      taskId: task.id,
      status: newStatus,
      closureReason: newStatus === 'resolved' || newStatus === 'ignored' || newStatus === 'accepted_risk' ? closureReason : undefined,
    }, {
      onSuccess: () => {
        setClosureReason('');
        if (newStatus === 'resolved' || newStatus === 'ignored' || newStatus === 'accepted_risk') {
          onClose();
        }
      }
    });
  };

  const handleAcceptRisk = (justification: string, expiryDate: Date) => {
    updateStatus.mutate({
      taskId: task.id,
      status: 'accepted_risk' as TaskStatus,
      closureReason: justification,
      closureEvidence: {
        type: 'risk_acceptance',
        expiry_date: expiryDate.toISOString(),
        accepted_at: new Date().toISOString(),
      },
    }, {
      onSuccess: () => {
        setAcceptRiskDialogOpen(false);
        onClose();
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-[540px] sm:max-w-[540px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${severity.color} text-white`}>
              {severity.icon}
            </div>
            <div>
              <SheetTitle>{task.title}</SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                {source.icon}
                <span>{source.label}</span>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1">
              {status.icon}
              {status.label}
            </Badge>
            <Badge variant="secondary">{severity.label}</Badge>
            {isSlaBreach && isActive && (
              <Badge variant="destructive" className="gap-1 animate-pulse">
                <Clock className="h-3 w-3" />
                SLA Violado
              </Badge>
            )}
            {task.requires_human_review && (
              <Badge variant="outline">Revisão Humana Requerida</Badge>
            )}
            {task.auto_generated && (
              <Badge variant="outline">Auto-gerada</Badge>
            )}
          </div>

          <Separator />

          {/* Tabs for different sections */}
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details" className="gap-2">
                <FileText className="h-4 w-4" />
                Detalhes
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-2">
                <History className="h-4 w-4" />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="evidence" className="gap-2">
                <Package className="h-4 w-4" />
                Evidências
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 mt-4">
              {/* Description */}
              {task.description && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Descrição</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                  </CardContent>
                </Card>
              )}

              {/* Timeline Info */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Informações</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Criada:</span>
                    <span>{formatBrazil(task.created_at, "dd/MM/yyyy 'às' HH:mm")}</span>
                  </div>
                  {task.due_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Prazo SLA:</span>
                      <span className={isSlaBreach ? 'text-destructive font-medium' : ''}>
                        {formatBrazil(task.due_at, "dd/MM/yyyy 'às' HH:mm")}
                        {isSlaBreach && ' (Violado)'}
                      </span>
                    </div>
                  )}
                  {task.closed_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fechada:</span>
                      <span>{formatBrazil(task.closed_at, "dd/MM/yyyy 'às' HH:mm")}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Idade:</span>
                    <span>
                      {formatDistanceToNow(new Date(task.created_at), { locale: ptBR })}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Closure Info (if closed) */}
              {task.closure_reason && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Razão do Fechamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{task.closure_reason}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Histórico de Eventos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TaskTimeline taskId={task.id} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="evidence" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Pacote de Evidências
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TaskEvidenceTab taskId={task.id} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Separator />

          {/* Actions */}
          {isActive ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="closure-reason">Razão do Fechamento (opcional)</Label>
                <Textarea
                  id="closure-reason"
                  placeholder="Descreva o que foi feito para resolver ou por que está ignorando..."
                  value={closureReason}
                  onChange={(e) => setClosureReason(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex flex-col gap-2">
                {task.status === 'open' && (
                  <Button 
                    onClick={() => handleStatusChange('in_progress')}
                    disabled={updateStatus.isPending}
                    className="w-full"
                    variant="outline"
                  >
                    {updateStatus.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Iniciar Trabalho
                  </Button>
                )}
                
                <Button 
                  onClick={() => handleStatusChange('resolved')}
                  disabled={updateStatus.isPending}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {updateStatus.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Marcar como Resolvida
                </Button>

                <Button 
                  onClick={() => handleStatusChange('ignored')}
                  disabled={updateStatus.isPending}
                  className="w-full"
                  variant="outline"
                >
                  {updateStatus.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Ignorar (com justificativa)
                </Button>

                <Button 
                  onClick={() => setAcceptRiskDialogOpen(true)}
                  disabled={updateStatus.isPending}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                >
                  <ShieldAlert className="h-4 w-4 mr-2" />
                  Aceitar Risco
                </Button>

                <Button 
                  onClick={() => handleStatusChange('blocked')}
                  disabled={updateStatus.isPending}
                  className="w-full"
                  variant="destructive"
                >
                  {updateStatus.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Ban className="h-4 w-4 mr-2" />
                  )}
                  Marcar como Bloqueada
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Button 
                onClick={() => handleStatusChange('open')}
                disabled={updateStatus.isPending}
                className="w-full"
                variant="outline"
              >
                {updateStatus.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                Reabrir Task
              </Button>
            </div>
          )}
        </div>

        {/* Accept Risk Dialog */}
        <AcceptRiskDialog
          task={task}
          open={acceptRiskDialogOpen}
          onClose={() => setAcceptRiskDialogOpen(false)}
          onConfirm={handleAcceptRisk}
          isPending={updateStatus.isPending}
        />
      </SheetContent>
    </Sheet>
  );
}
