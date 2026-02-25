import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, AlertTriangle, Lightbulb, TrendingUp, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function AIInsightsSummary() {
  const { tenant } = useTenant();
  const navigate = useNavigate();

  const { data: insights, isLoading } = useQuery({
    queryKey: ['ai-insights-summary', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const { data, error } = await supabase
        .from('ai_insights')
        .select('id, title, severity, insight_type, created_at, acknowledged')
        .eq('tenant_id', tenant.id)
        .eq('acknowledged', false)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000, // COST-OPT: 60s → 5min
  });

  const { data: stats } = useQuery({
    queryKey: ['ai-insights-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { total: 0, critical: 0, unacknowledged: 0 };

      const { data, error } = await supabase
        .from('ai_insights')
        .select('severity, acknowledged')
        .eq('tenant_id', tenant.id);

      if (error) throw error;

      return {
        total: data?.length || 0,
        critical: data?.filter(i => i.severity === 'critical').length || 0,
        unacknowledged: data?.filter(i => !i.acknowledged).length || 0,
      };
    },
    enabled: !!tenant?.id,
  });

  const getSeverityConfig = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { variant: 'destructive' as const, icon: AlertTriangle, color: 'text-destructive' };
      case 'warning':
        return { variant: 'secondary' as const, icon: AlertTriangle, color: 'text-yellow-500' };
      default:
        return { variant: 'outline' as const, icon: Lightbulb, color: 'text-blue-500' };
    }
  };

  const getInsightTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      anomaly_detection: 'Anomalia',
      optimization: 'Otimização',
      prediction: 'Previsão',
      root_cause: 'Causa Raiz',
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <Card className="border-l-4 border-primary/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Brain className="h-4 w-4 text-primary animate-pulse" />
            Carregando insights da IA...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const hasUnacknowledged = (stats?.unacknowledged || 0) > 0;
  const hasCritical = (stats?.critical || 0) > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
      <Card className={cn(
        "border-l-4 transition-all",
        hasCritical ? "border-destructive bg-destructive/5" : 
        hasUnacknowledged ? "border-primary bg-primary/5" : "border-muted"
      )}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <div className={cn(
                "p-1.5 rounded-lg",
                hasCritical ? "bg-destructive/20" : "bg-primary/20"
              )}>
                <Brain className={cn(
                  "h-4 w-4",
                  hasCritical ? "text-destructive animate-pulse" : "text-primary"
                )} />
              </div>
              Insights da IA
              {hasUnacknowledged && (
                <Badge variant={hasCritical ? "destructive" : "default"} className="ml-2 animate-pulse">
                  {stats?.unacknowledged} novo{stats?.unacknowledged !== 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/admin/ai-insights')}
              className="gap-1 text-xs"
            >
              Ver todos
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!insights || insights.length === 0 ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground py-2">
              <TrendingUp className="h-4 w-4" />
              <span>Nenhum insight pendente. Sistema saudável!</span>
            </div>
          ) : (
            <div className="space-y-2">
              {insights.map((insight, idx) => {
                const config = getSeverityConfig(insight.severity);
                const Icon = config.icon;
                return (
                  <motion.div
                    key={insight.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-start gap-3 p-2 rounded-lg bg-background/50 hover:bg-background transition-colors cursor-pointer"
                    onClick={() => navigate('/admin/ai-insights')}
                  >
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", config.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{insight.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={config.variant} className="text-[10px] px-1.5 py-0">
                          {getInsightTypeLabel(insight.insight_type)}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {formatBrazilDateTime(insight.created_at)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Stats footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
            <span>Total: {stats?.total || 0} insights</span>
            {(stats?.critical || 0) > 0 && (
              <span className="text-destructive font-medium">
                {stats?.critical} crítico{stats?.critical !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
