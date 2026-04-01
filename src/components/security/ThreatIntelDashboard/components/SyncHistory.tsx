import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useThreatFeedSyncLog } from '@/hooks/useThreatIntel';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { sourceLabels } from '../constants';

export function SyncHistory() {
  const { data: logs, isLoading } = useThreatFeedSyncLog();

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-2">
        {(logs ?? []).map((log: any) => (
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
