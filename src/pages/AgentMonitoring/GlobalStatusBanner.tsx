import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { GlobalStatus } from './types';

interface GlobalStatusBannerProps {
  globalStatus: GlobalStatus;
  totalAgents: number;
  onlineAgents: number;
  offlineAgents: number;
  failedJobs: number;
  successRate: number;
}

export function GlobalStatusBanner({
  globalStatus, totalAgents, onlineAgents, offlineAgents, failedJobs, successRate,
}: GlobalStatusBannerProps) {
  return (
    <Card className={cn(
      "border-2",
      globalStatus === 'healthy' ? "bg-green-500/10 border-green-500/30" :
      globalStatus === 'critical' ? "bg-red-500/10 border-red-500/30" :
      "bg-yellow-500/10 border-yellow-500/30"
    )}>
      <CardContent className="py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-5xl">
              {globalStatus === 'healthy' ? '🟢' :
               globalStatus === 'critical' ? '🔴' : '🟡'}
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                {globalStatus === 'healthy' ? 'Sistema Funcionando Normalmente' :
                 globalStatus === 'critical' ? 'Atenção Necessária' :
                 'Pequenos Ajustes Recomendados'}
              </h2>
              <div className="space-y-1 text-sm text-muted-foreground mt-2">
                {globalStatus === 'healthy' ? (
                  <>
                    <p>✓ Todos os computadores estão conectados</p>
                    <p>✓ Taxa de sucesso das tarefas: {successRate}%</p>
                  </>
                ) : (
                  <>
                    {offlineAgents > 0 && <p>• {offlineAgents} computador(es) offline precisam de verificação</p>}
                    {failedJobs > 0 && <p>• {failedJobs} tarefa(s) falharam recentemente</p>}
                    {successRate < 90 && <p>• Taxa de sucesso abaixo do esperado: {successRate}%</p>}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold">{totalAgents}</p>
            <p className="text-sm text-muted-foreground">computador(es) monitorado(s)</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
