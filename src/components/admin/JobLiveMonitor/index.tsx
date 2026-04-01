import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Activity, Clock, CheckCircle2, XCircle, Loader2, Wifi, Computer, ArrowRight, RefreshCw } from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-utils';
import { JOB_TYPE_LABELS } from '@/lib/job-labels';
import { getFailureExplanation } from '@/lib/leigo-translator';
import { useSimplifiedMessage } from '@/hooks/useSimplifiedMessage';
import { getJobStatusInfo } from '@/components/admin/JobStatusSimplified';
import { useJobLiveMonitor, type LiveJob } from './useJobLiveMonitor';
import { getJobVisual } from './constants';

function getJobTypeLabel(type: string): string {
  return JOB_TYPE_LABELS[type] || type;
}

interface JobLiveMonitorProps {
  className?: string;
  maxJobs?: number;
  showSummary?: boolean;
  compact?: boolean;
}

export function JobLiveMonitor({ className, maxJobs = 10, showSummary = true, compact = false }: JobLiveMonitorProps) {
  const { jobs, summary, refetch } = useJobLiveMonitor(maxJobs);

  if (compact) {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />Tarefas em Tempo Real
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {summary.running > 0 && (
                <span className="flex items-center gap-1 text-blue-500">
                  <Loader2 className="h-3 w-3 animate-spin" />{summary.running}
                </span>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[200px]">
            <div className="p-3 space-y-2">
              {jobs().length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa recente</p>
              ) : jobs().map(job => <CompactJobCard key={job.id} job={job} />)}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />Acompanhamento de Tarefas</CardTitle>
            <CardDescription>Veja o que está acontecendo nos computadores agora</CardDescription>
          </div>
          <button onClick={() => refetch()} className="p-2 rounded-md hover:bg-accent transition-colors" title="Atualizar">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        {showSummary && (
          <div className="grid grid-cols-4 gap-4 mt-4">
            <SummaryCard icon={Loader2} label="Em andamento" value={summary.running} iconClass="text-blue-500 animate-spin" />
            <SummaryCard icon={Clock} label="Aguardando" value={summary.pending} iconClass="text-amber-500" />
            <SummaryCard icon={CheckCircle2} label="Concluídas" value={summary.completed} iconClass="text-green-500" />
            <SummaryCard icon={XCircle} label="Com problema" value={summary.failed} iconClass="text-red-500" />
          </div>
        )}
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="p-4 space-y-3">
            {jobs().length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Wifi className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-sm">Nenhuma tarefa em andamento</p>
                <p className="text-xs mt-1">Novas tarefas aparecerão aqui automaticamente</p>
              </div>
            ) : jobs().map(job => <JobCard key={job.id} job={job} />)}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ icon: Icon, label, value, iconClass }: { icon: typeof Clock; label: string; value: number; iconClass?: string }) {
  return (
    <div className="text-center p-3 rounded-lg bg-muted/30">
      <Icon className={cn('h-5 w-5 mx-auto mb-1', iconClass)} />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function JobCard({ job }: { job: LiveJob }) {
  const visual = getJobVisual(job.status);
  const Icon = visual.icon;
  const failureInfo = job.failure_class ? getFailureExplanation(job.failure_class) : null;
  const { formatError } = useSimplifiedMessage();
  const simplifiedError = job.error_message ? formatError(job.error_message) : null;
  const statusInfo = getJobStatusInfo(job.status, job.error_message);

  return (
    <div className={cn('p-4 rounded-lg border transition-all', visual.bg, 'hover:shadow-md')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn('p-2 rounded-full', visual.bg)}>
            <Icon className={cn('h-5 w-5', visual.color, visual.spin && 'animate-spin')} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('font-medium text-sm', visual.color)}>{visual.label}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm truncate">{getJobTypeLabel(job.type)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Computer className="h-3 w-3" />
              <span className="truncate">{job.agent_name}</span>
              <span>•</span>
              <span>{formatRelativeTime(job.created_at)}</span>
              {statusInfo.description && <span className="text-muted-foreground/70" title={statusInfo.description}>— {statusInfo.description}</span>}
            </div>
            {job.status === 'failed' && (failureInfo || simplifiedError) && (
              <div className="mt-2 p-2 rounded bg-red-500/5 border border-red-500/10">
                {failureInfo ? (
                  <>
                    <p className="text-xs font-medium text-red-500">{failureInfo.icon} {failureInfo.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{failureInfo.explanation}</p>
                  </>
                ) : simplifiedError && (
                  <>
                    <p className="text-xs font-medium text-red-500">{simplifiedError.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{simplifiedError.description}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {(job.status === 'queued' || job.status === 'delivered') && (
          <div className="w-16"><Progress value={visual.progress} className="h-1.5" /></div>
        )}
      </div>
    </div>
  );
}

function CompactJobCard({ job }: { job: LiveJob }) {
  const visual = getJobVisual(job.status);
  const Icon = visual.icon;
  return (
    <div className={cn('flex items-center gap-2 p-2 rounded-md', visual.bg)}>
      <Icon className={cn('h-4 w-4 flex-shrink-0', visual.color, visual.spin && 'animate-spin')} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{getJobTypeLabel(job.type)}</p>
        <p className="text-xs text-muted-foreground truncate">{job.agent_name}</p>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">{formatRelativeTime(job.created_at)}</span>
    </div>
  );
}

export default JobLiveMonitor;
