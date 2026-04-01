import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Brain, CheckCircle, XCircle, AlertTriangle, Clock, ThumbsUp, ThumbsDown, RefreshCw, Filter } from 'lucide-react';
import { StatsGrid } from '@/components/ui/stats-grid';
import { SummaryStatCard } from '@/components/ui/summary-stat-card';
import { formatBrazil } from '@/lib/date-utils';
import { useInsightTriageCenter, SEVERITY_COLORS, INSIGHT_TYPE_LABELS } from './useInsightTriageCenter';

export default function InsightTriageCenter() {
  const {
    insights, filteredInsights, isLoading,
    selectedInsights, toggleSelect, selectAllCritical, selectAll, clearSelection,
    filterSeverity, setFilterSeverity, filterType, setFilterType,
    criticalCount, highCount, insightTypes,
    acknowledgeSelected, acknowledgeMutation,
    dismissDialogOpen, setDismissDialogOpen, dismissReason, setDismissReason,
    openDismissDialog, confirmDismiss, dismissMutation,
    refresh, setSelectedInsights,
  } = useInsightTriageCenter();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Centro de Triagem de Insights</h1>
          <p className="text-muted-foreground">
            Processe insights críticos da IA com workflow de resolução em lote
          </p>
        </div>
        <Button onClick={refresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <StatsGrid columns={4}>
        <SummaryStatCard icon={AlertTriangle} value={criticalCount} label="Críticos" accent="destructive" />
        <SummaryStatCard icon={AlertTriangle} value={highCount} label="Alta Prioridade" accent="warning" />
        <SummaryStatCard icon={Brain} value={insights?.length || 0} label="Total Pendentes" accent="muted" />
        <SummaryStatCard icon={CheckCircle} value={selectedInsights.size} label="Selecionados" accent="success" />
      </StatsGrid>

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
            <Button variant="outline" size="sm" onClick={selectAll}>
              Selecionar Todos ({insights?.length || 0})
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Limpar Seleção
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedInsights.size > 0 && (
        <Card className="border-primary">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                <span className="font-medium">{selectedInsights.size} insights selecionados</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={acknowledgeSelected} disabled={acknowledgeMutation.isPending}>
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Marcar como Revisados
                </Button>
                <Button variant="outline" size="sm" onClick={openDismissDialog} className="text-orange-600 border-orange-600 hover:bg-orange-50">
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Dispensar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtros:</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant={filterSeverity === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilterSeverity('all')}>
            Todas Severidades
          </Button>
          {['critical', 'high', 'medium', 'low'].map(sev => (
            <Button key={sev} variant={filterSeverity === sev ? 'default' : 'outline'} size="sm" onClick={() => setFilterSeverity(sev)}>
              {sev}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant={filterType === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilterType('all')}>
            Todos Tipos
          </Button>
          {insightTypes.map(type => (
            <Button key={type} variant={filterType === type ? 'default' : 'outline'} size="sm" onClick={() => setFilterType(type)}>
              {INSIGHT_TYPE_LABELS[type] || type}
            </Button>
          ))}
        </div>
      </div>

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
                      <Button variant="ghost" size="sm" onClick={() => acknowledgeMutation.mutate([insight.id])} disabled={acknowledgeMutation.isPending} title="Marcar como revisado">
                        <ThumbsUp className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedInsights(new Set([insight.id])); setDismissDialogOpen(true); }} title="Dispensar">
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
            <Button onClick={confirmDismiss} disabled={dismissMutation.isPending || !dismissReason.trim()}>
              {dismissMutation.isPending ? 'Dispensando...' : 'Confirmar Dispensa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
