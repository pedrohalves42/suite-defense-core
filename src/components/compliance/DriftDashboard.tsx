import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingDown, TrendingUp, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

/**
 * DriftDashboard — CMP-004 mitigation
 * Displays active compliance drift events with severity and score
 */

interface DriftEvent {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  drift_score: number;
  detected_at: string;
  resolved_at: string | null;
  current_value: unknown;
  expected_value: unknown;
}

const severityConfig = {
  low: { color: 'text-info', bg: 'bg-info/10', border: 'border-info/30', label: 'Baixo' },
  medium: { color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', label: 'Médio' },
  high: { color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', label: 'Alto' },
  critical: { color: 'text-destructive', bg: 'bg-destructive/20', border: 'border-destructive/50', label: 'Crítico' },
} as const;

export function DriftDashboard() {
  const adaptiveInterval = useAdaptivePolling(5_000);
  const { tenant } = useTenant();

  const { data: events, isLoading } = useQuery({
    queryKey: ['drift-events', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('drift_events')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('detected_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as DriftEvent[];
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const activeEvents = (events || []).filter((e) => !e.resolved_at);
  const resolvedEvents = (events || []).filter((e) => e.resolved_at);
  const totalScore = activeEvents.reduce((sum, e) => sum + e.drift_score, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Drift de Compliance</CardTitle>
          </div>
          {totalScore > 0 ? (
            <Badge
              variant="outline"
              className={
                totalScore >= 15
                  ? 'border-destructive/50 text-destructive'
                  : totalScore >= 10
                    ? 'border-warning/50 text-warning'
                    : 'border-info/50 text-info'
              }
            >
              Score: {totalScore}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-cta-positive/30 text-cta-positive">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Sem desvios
            </Badge>
          )}
        </div>
        <CardDescription>
          Monitoramento automático de desvios de compliance em relação ao baseline.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/50 p-3 text-center">
            <p className="text-2xl font-bold tabular-nums text-foreground">{activeEvents.length}</p>
            <p className="text-[11px] text-muted-foreground">Ativos</p>
          </div>
          <div className="rounded-lg border border-border/50 p-3 text-center">
            <p className="text-2xl font-bold tabular-nums text-foreground">{resolvedEvents.length}</p>
            <p className="text-[11px] text-muted-foreground">Resolvidos</p>
          </div>
          <div className="rounded-lg border border-border/50 p-3 text-center">
            <p className="text-2xl font-bold tabular-nums text-foreground">{totalScore}</p>
            <p className="text-[11px] text-muted-foreground">Score Total</p>
          </div>
        </div>

        {/* Active Events */}
        {activeEvents.length > 0 ? (
          <ScrollArea className="max-h-64">
            <div className="space-y-2">
              {activeEvents.map((event) => {
                const config = severityConfig[event.severity] || severityConfig.low;
                return (
                  <div
                    key={event.id}
                    className={`flex items-start gap-3 rounded-lg border ${config.border} ${config.bg} p-3`}
                  >
                    <ShieldAlert className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={`text-[10px] ${config.color} ${config.border}`}>
                          {config.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          Score: {event.drift_score}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">{event.description}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Detectado {formatDistanceToNow(new Date(event.detected_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Nenhum desvio de compliance ativo. O sistema está em conformidade com o baseline.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
