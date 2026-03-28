import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { 
  Zap, Shield, AlertTriangle, CheckCircle2, Loader2, 
  PlayCircle, Settings2, Info 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionConfig {
  id: string;
  action_type: string;
  description: string;
  risk_level: string;
  requires_approval: boolean;
  is_enabled: boolean;
  max_executions_per_day: number;
}

export function AutoApprovalPanel() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [expandedConfig, setExpandedConfig] = useState(false);

  const { data: configs, isLoading: configsLoading } = useQuery({
    queryKey: ['ai-action-configs-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_action_configs')
        .select('id, action_type, description, risk_level, requires_approval, is_enabled, max_executions_per_day, failure_threshold, circuit_breaker_enabled, created_at, updated_at')
        .order('risk_level', { ascending: true });
      if (error) throw error;
      return data as ActionConfig[];
    },
  });

  const { data: pendingCounts } = useQuery({
    queryKey: ['pending-by-type', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_actions')
        .select('action_type')
        .eq('status', 'pending');
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data?.forEach(a => {
        counts[a.action_type] = (counts[a.action_type] || 0) + 1;
      });
      return counts;
    },
    enabled: !!tenant?.id,
  });

  const autoApproveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('auto_approve_safe_actions', {
        p_tenant_id: tenant?.id || null,
      });
      if (error) throw error;
      return data as { approved_count: number; categories: string[]; message: string };
    },
    onSuccess: (data) => {
      toast.success(`${data.approved_count} ações auto-aprovadas`, {
        description: `Categorias: ${data.categories?.join(', ') || 'nenhuma'}`,
      });
      queryClient.invalidateQueries({ queryKey: ['ai-actions-pending'] });
      queryClient.invalidateQueries({ queryKey: ['pending-by-type'] });
      queryClient.invalidateQueries({ queryKey: ['action-center'] });
    },
    onError: (error) => {
      toast.error('Erro ao auto-aprovar', { description: error.message });
    },
  });

  const toggleApprovalMutation = useMutation({
    mutationFn: async ({ id, requires_approval }: { id: string; requires_approval: boolean }) => {
      // V-1062 FIX: Add tenant_id filter
      const { error } = await (supabase
        .from('ai_action_configs')
        .update({ requires_approval })
        .eq('id', id)
        .eq('tenant_id', tenant?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-action-configs-all'] });
      queryClient.invalidateQueries({ queryKey: ['ai-action-configs'] });
      toast.success('Configuração atualizada');
    },
  });

  const totalPending = Object.values(pendingCounts || {}).reduce((a, b) => a + b, 0);
  const safeCategories = configs?.filter(c => !c.requires_approval && c.is_enabled) || [];
  const safePending = safeCategories.reduce((sum, c) => sum + (pendingCounts?.[c.action_type] || 0), 0);

  const riskColors: Record<string, string> = {
    low: 'text-green-600 bg-green-500/10 border-green-500/30',
    medium: 'text-yellow-600 bg-yellow-500/10 border-yellow-500/30',
    high: 'text-red-600 bg-red-500/10 border-red-500/30',
    critical: 'text-red-700 bg-red-600/10 border-red-600/30',
  };

  const riskIcons: Record<string, typeof Shield> = {
    low: CheckCircle2,
    medium: AlertTriangle,
    high: Shield,
    critical: Shield,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Auto-Aprovação por Categoria
            </CardTitle>
            <CardDescription className="mt-1">
              Categorias de baixo risco são aprovadas automaticamente. {totalPending > 0 && (
                <span className="font-medium text-foreground">{safePending} de {totalPending} pendentes são auto-aprováveis.</span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedConfig(!expandedConfig)}
            >
              <Settings2 className="h-4 w-4 mr-1" />
              {expandedConfig ? 'Ocultar' : 'Configurar'}
            </Button>
            <Button
              onClick={() => autoApproveMutation.mutate()}
              disabled={autoApproveMutation.isPending || safePending === 0}
              size="sm"
              className="gap-2"
            >
              {autoApproveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Auto-aprovar ({safePending})
            </Button>
          </div>
        </div>
      </CardHeader>

      {expandedConfig && (
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Info className="h-4 w-4" />
              Categorias com "Auto" ativado não precisam de aprovação manual.
              Categorias de alto risco sempre exigem revisão humana.
            </div>

            {configsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <div className="grid gap-2">
                {configs?.map((config) => {
                  const RiskIcon = riskIcons[config.risk_level] || Info;
                  const pending = pendingCounts?.[config.action_type] || 0;
                  const isHighRisk = config.risk_level === 'high' || config.risk_level === 'critical';

                  return (
                    <div
                      key={config.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        !config.is_enabled && "opacity-50"
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={cn("p-1.5 rounded border", riskColors[config.risk_level])}>
                          <RiskIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono">{config.action_type}</code>
                            <Badge variant="outline" className="text-[10px] px-1.5">
                              {config.risk_level}
                            </Badge>
                            {pending > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5">
                                {pending} pendente{pending > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{config.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-3">
                        <Label htmlFor={`auto-${config.id}`} className="text-xs whitespace-nowrap">
                          Auto
                        </Label>
                        <Switch
                          id={`auto-${config.id}`}
                          checked={!config.requires_approval}
                          disabled={isHighRisk || !config.is_enabled || toggleApprovalMutation.isPending}
                          onCheckedChange={(checked) => {
                            toggleApprovalMutation.mutate({
                              id: config.id,
                              requires_approval: !checked,
                            });
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
