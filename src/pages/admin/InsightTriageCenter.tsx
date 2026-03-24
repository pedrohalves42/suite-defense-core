import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Brain, CheckCircle, XCircle, AlertTriangle, Clock, ThumbsUp, ThumbsDown, RefreshCw, Filter } from 'lucide-react';
import { formatBrazil } from '@/lib/date-utils';

interface AIInsight {
  id: string;
  insight_type: string;
  severity: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  suggested_action: string | null;
  created_at: string;
  acknowledged: boolean;
  dismissed_at: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
  info: 'bg-muted text-muted-foreground',
};

const INSIGHT_TYPE_LABELS: Record<string, string> = {
  anomaly_detection: 'Detecção de Anomalia',
  root_cause: 'Análise de Causa Raiz',
  optimization: 'Otimização',
  security_threat: 'Ameaça de Segurança',
  compliance: 'Conformidade',
  performance: 'Performance',
};

export default function InsightTriageCenter() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedInsights, setSelectedInsights] = useState<Set<string>>(new Set());
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState('');

  const { data: insights, isLoading } = useQuery({
    queryKey: ['ai-insights-triage', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('ai_insights')
        .select('id, insight_type, severity, title, description, evidence, suggested_action, created_at, acknowledged, dismissed_at')
        .eq('tenant_id', tenant.id)
        .eq('acknowledged', false)
        .is('dismissed_at', null)
        .order('severity', { ascending: true })
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...d,
        suggested_action: d.suggested_action || null,
      })) as AIInsight[];
    },
    enabled: !!tenant?.id,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (insightIds: string[]) => {
      // V-1075 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('ai_insights')
        .update({ acknowledged: true })
        .in('id', insightIds)
        .eq('tenant_id', tenant!.id);
      
      if (error) throw error;
    },
    onSuccess: (_, insightIds) => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights-triage'] });
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      queryClient.invalidateQueries({ queryKey: ['critical-insights-count'] });
      toast.success(`${insightIds.length} insight(s) marcado(s) como revisado(s)`);
      setSelectedInsights(new Set());
    },
    onError: (error) => {
      toast.error('Erro ao processar insights: ' + (error as Error).message);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ insightIds, reason }: { insightIds: string[]; reason: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      // V-1075 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('ai_insights')
        .update({ 
          dismissed_at: new Date().toISOString(),
          dismissed_by: user?.id,
          dismissal_reason: reason 
        })
        .in('id', insightIds)
        .eq('tenant_id', tenant!.id);
      
      if (error) throw error;
    },
    onSuccess: (_, { insightIds }) => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights-triage'] });
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      queryClient.invalidateQueries({ queryKey: ['critical-insights-count'] });
      toast.success(`${insightIds.length} insight(s) dispensado(s)`);
      setSelectedInsights(new Set());
      setDismissDialogOpen(false);
      setDismissReason('');
    },
    onError: (error) => {
      toast.error('Erro ao dispensar insights: ' + (error as Error).message);
    },
  });

  const criticalCount = insights?.filter(i => i.severity === 'critical').length || 0;
  const highCount = insights?.filter(i => i.severity === 'high').length || 0;

  const insightsByType = React.useMemo(() => {
    if (!insights) return {};
    return insights.reduce((acc, insight) => {
      const type = insight.insight_type || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(insight);
      return acc;
    }, {} as Record<string, AIInsight[]>);
  }, [insights]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedInsights);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedInsights(newSelected);
  };

  const selectAllCritical = () => {
    const criticalInsights = insights?.filter(i => i.severity === 'critical') || [];
    setSelectedInsights(new Set(criticalInsights.map(i => i.id)));
  };

  const acknowledgeSelected = () => {
    if (selectedInsights.size === 0) {
      toast.warning('Selecione pelo menos um insight');
      return;
    }
    acknowledgeMutation.mutate(Array.from(selectedInsights));
  };

  const openDismissDialog = () => {
    if (selectedInsights.size === 0) {
      toast.warning('Selecione pelo menos um insight');
      return;
    }
    setDismissDialogOpen(true);
  };

  const confirmDismiss = () => {
    if (!dismissReason.trim()) {
      toast.warning('Informe o motivo da dispensa');
      return;
    }
    dismissMutation.mutate({
      insightIds: Array.from(selectedInsights),
      reason: dismissReason,
    });
  };

  const filteredInsights = insights?.filter(i => {
    if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false;
    if (filterType !== 'all' && i.insight_type !== filterType) return false;
    return true;
  });

  const insightTypes = [...new Set(insights?.map(i => i.insight_type) || [])];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Centro de Triagem de Insights</h1>
          <p className="text-muted-foreground">
            Processe insights críticos da IA com workflow de resolução em lote
          </p>
        </div>
        <Button 
          onClick={() => queryClient.invalidateQueries({ queryKey: ['ai-insights-triage'] })}
          variant="outline"
          size="sm"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-2xl font-bold text-destructive">{criticalCount}</p>
                <p className="text-sm text-muted-foreground">Críticos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold text-orange-500">{highCount}</p>
                <p className="text-sm text-muted-foreground">Alta Prioridade</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{insights?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Total Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{selectedInsights.size}</p>
                <p className="text-sm text-muted-foreground">Selecionados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ações Rápidas</CardTitle>
          <CardDescription>Processe múltiplos insights de uma vez</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={selectAllCritical}>
              <AlertTriangle className="h-4 w-4 mr-2 text-destructive" />
              Selecionar Críticos ({criticalCount})
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setSelectedInsights(new Set(insights?.map(i => i.id) || []))}
            >
              Selecionar Todos ({insights?.length || 0})
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedInsights(new Set())}>
              Limpar Seleção
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Selected Actions */}
      {selectedInsights.size > 0 && (
        <Card className="border-primary">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                <span className="font-medium">{selectedInsights.size} insights selecionados</span>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={acknowledgeSelected}
                  disabled={acknowledgeMutation.isPending}
                >
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Marcar como Revisados
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={openDismissDialog}
                  className="text-orange-600 border-orange-600 hover:bg-orange-50"
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Dispensar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtros:</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={filterSeverity === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterSeverity('all')}
          >
            Todas Severidades
          </Button>
          {['critical', 'high', 'medium', 'low'].map(sev => (
            <Button
              key={sev}
              variant={filterSeverity === sev ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterSeverity(sev)}
            >
              {sev}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('all')}
          >
            Todos Tipos
          </Button>
          {insightTypes.map(type => (
            <Button
              key={type}
              variant={filterType === type ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType(type)}
            >
              {INSIGHT_TYPE_LABELS[type] || type}
            </Button>
          ))}
        </div>
      </div>

      {/* Insights List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Insights Pendentes de Triagem</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Carregando insights...</p>
          ) : !filteredInsights?.length ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium">Todos os insights foram processados!</p>
              <p className="text-muted-foreground">Não há insights pendentes de triagem.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInsights.map(insight => (
                <div
                  key={insight.id}
                  className={`p-4 rounded-lg border ${
                    selectedInsights.has(insight.id) ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={selectedInsights.has(insight.id)}
                      onCheckedChange={() => toggleSelect(insight.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Brain className="h-4 w-4 text-primary" />
                        <span className="font-medium">{insight.title}</span>
                        <Badge className={SEVERITY_COLORS[insight.severity] || 'bg-gray-500'}>
                          {insight.severity}
                        </Badge>
                        <Badge variant="outline">
                          {INSIGHT_TYPE_LABELS[insight.insight_type] || insight.insight_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                      {insight.suggested_action && (
                        <div className="mt-2 p-2 bg-muted rounded text-sm">
                          <span className="font-medium">Ação sugerida:</span> {insight.suggested_action}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatBrazil(insight.created_at, "dd/MM/yyyy 'às' HH:mm")}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => acknowledgeMutation.mutate([insight.id])}
                        disabled={acknowledgeMutation.isPending}
                        title="Marcar como revisado"
                      >
                        <ThumbsUp className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedInsights(new Set([insight.id]));
                          setDismissDialogOpen(true);
                        }}
                        title="Dispensar"
                      >
                        <XCircle className="h-4 w-4 text-orange-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dismiss Dialog */}
      <Dialog open={dismissDialogOpen} onOpenChange={setDismissDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispensar Insights</DialogTitle>
            <DialogDescription>
              Informe o motivo para dispensar {selectedInsights.size} insight(s).
              Esta ação será registrada para auditoria.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ex: Falso positivo, já resolvido manualmente, não aplicável ao nosso contexto..."
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={confirmDismiss}
              disabled={dismissMutation.isPending || !dismissReason.trim()}
            >
              {dismissMutation.isPending ? 'Dispensando...' : 'Confirmar Dispensa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
