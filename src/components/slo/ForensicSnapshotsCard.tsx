import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useForensicSnapshots } from '@/hooks/useForensicSnapshots';
import { Camera, Clock, Server, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow, formatBrazilDateTime, ptBR } from '@/lib/date-utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

const TRIGGER_REASON_LABELS: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  'slo_violation': { label: 'Violação SLO', variant: 'destructive' },
  'security_alert': { label: 'Alerta de Segurança', variant: 'destructive' },
  'manual': { label: 'Manual', variant: 'secondary' },
  'scheduled': { label: 'Agendado', variant: 'outline' },
  'anomaly_detected': { label: 'Anomalia Detectada', variant: 'destructive' }
};

export function ForensicSnapshotsCard() {
  const { data: snapshots, isLoading } = useForensicSnapshots();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          Snapshots Forenses
        </CardTitle>
        <CardDescription>
          Capturas de estado do sistema para análise
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!snapshots?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum snapshot forense registrado</p>
            <p className="text-sm">Snapshots são criados automaticamente em violações de SLO</p>
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.slice(0, 5).map((snapshot) => {
              const triggerInfo = TRIGGER_REASON_LABELS[snapshot.trigger_reason] || {
                label: snapshot.trigger_reason,
                variant: 'secondary' as const
              };

              return (
                <div 
                  key={snapshot.id}
                  className="p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-sm truncate max-w-[200px]">
                        {snapshot.agent_id.slice(0, 8)}...
                      </span>
                    </div>
                    <Badge variant={triggerInfo.variant}>
                      {triggerInfo.label}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>
                        {formatDistanceToNow(new Date(snapshot.created_at), {
                          addSuffix: true,
                          locale: ptBR
                        })}
                      </span>
                    </div>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          Ver Detalhes
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Snapshot Forense</DialogTitle>
                          <DialogDescription>
                            Capturado em {formatBrazilDateTime(snapshot.created_at, 'full')}
                          </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="max-h-[60vh]">
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-medium mb-2">Configuração</h4>
                              <pre className="p-3 rounded bg-muted text-xs overflow-x-auto">
                                {JSON.stringify(snapshot.config_snapshot, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <h4 className="font-medium mb-2">Processos</h4>
                              <pre className="p-3 rounded bg-muted text-xs overflow-x-auto">
                                {JSON.stringify(snapshot.process_snapshot, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <h4 className="font-medium mb-2">Rede</h4>
                              <pre className="p-3 rounded bg-muted text-xs overflow-x-auto">
                                {JSON.stringify(snapshot.network_snapshot, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <h4 className="font-medium mb-2">Liveness do Sistema</h4>
                              <pre className="p-3 rounded bg-muted text-xs overflow-x-auto">
                                {JSON.stringify(snapshot.system_liveness_snapshot, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
