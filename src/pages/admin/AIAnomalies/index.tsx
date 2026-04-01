import { useRolePermissions } from '@/hooks/useRolePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle, Eye, Search, Filter, Brain } from 'lucide-react';
import { formatBrazil } from '@/lib/date-utils';
import { useAIAnomalies } from './useAIAnomalies';
import { SEVERITY_CONFIG, ANOMALY_TYPE_LABELS } from './constants';

export default function AIAnomalies() {
  const { can } = useRolePermissions();
  const {
    loading, filter, setFilter,
    selectedAnomaly, setSelectedAnomaly,
    resolution, setResolution, reviewing,
    filteredAnomalies, stats, handleReview,
  } = useAIAnomalies();

  if (!can('view_ai_decisions')) {
    return (
      <div className="p-6">
        <Card><CardContent className="pt-6"><p className="text-muted-foreground text-center">Você não tem permissão para visualizar anomalias de IA.</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Brain className="h-6 w-6" />Anomalias de IA</h1>
        <p className="text-muted-foreground">Monitore comportamentos anômalos detectados nas respostas de IA</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{stats.total}</div><p className="text-sm text-muted-foreground">Total de Anomalias</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-red-600">{stats.critical}</div><p className="text-sm text-muted-foreground">Críticas</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-yellow-600">{stats.warning}</div><p className="text-sm text-muted-foreground">Avisos</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-orange-600">{stats.pending}</div><p className="text-sm text-muted-foreground">Pendentes de Revisão</p></CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Filter className="h-4 w-4" />Filtros</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} className="pl-9" />
              </div>
            </div>
            <Select value={filter.severity} onValueChange={(v) => setFilter({ ...filter, severity: v })}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Severidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
                <SelectItem value="warning">Aviso</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filter.type} onValueChange={(v) => setFilter({ ...filter, type: v })}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(ANOMALY_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filter.reviewed} onValueChange={(v) => setFilter({ ...filter, reviewed: v })}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="reviewed">Revisados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severidade</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Detectado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" /></TableCell></TableRow>
              ) : filteredAnomalies.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma anomalia encontrada</TableCell></TableRow>
              ) : (
                filteredAnomalies.map((anomaly) => {
                  const config = SEVERITY_CONFIG[anomaly.severity];
                  const Icon = config.icon;
                  return (
                    <TableRow key={anomaly.id}>
                      <TableCell><Badge className={config.color}><Icon className="h-3 w-3 mr-1" />{config.label}</Badge></TableCell>
                      <TableCell>{ANOMALY_TYPE_LABELS[anomaly.anomaly_type] || anomaly.anomaly_type}</TableCell>
                      <TableCell className="font-mono text-sm">{anomaly.function_name}</TableCell>
                      <TableCell className="max-w-[300px] truncate">{anomaly.context?.description || '-'}</TableCell>
                      <TableCell>{formatBrazil(anomaly.detected_at, "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell>
                        {anomaly.reviewed_at ? (
                          <Badge variant="outline" className="bg-green-50"><CheckCircle className="h-3 w-3 mr-1 text-green-600" />Revisado</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-orange-50"><AlertTriangle className="h-3 w-3 mr-1 text-orange-600" />Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedAnomaly(anomaly); setResolution(anomaly.resolution || ''); }}>
                          <Eye className="h-4 w-4 mr-1" />Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedAnomaly} onOpenChange={() => setSelectedAnomaly(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Anomalia</DialogTitle>
            <DialogDescription>Revise os detalhes e adicione uma resolução se necessário</DialogDescription>
          </DialogHeader>
          {selectedAnomaly && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">Tipo</label><p className="text-sm text-muted-foreground">{ANOMALY_TYPE_LABELS[selectedAnomaly.anomaly_type] || selectedAnomaly.anomaly_type}</p></div>
                <div><label className="text-sm font-medium">Severidade</label><Badge className={SEVERITY_CONFIG[selectedAnomaly.severity].color}>{SEVERITY_CONFIG[selectedAnomaly.severity].label}</Badge></div>
                <div><label className="text-sm font-medium">Função</label><p className="text-sm font-mono">{selectedAnomaly.function_name}</p></div>
                <div><label className="text-sm font-medium">Detectado em</label><p className="text-sm">{formatBrazil(selectedAnomaly.detected_at, "dd/MM/yyyy HH:mm:ss")}</p></div>
              </div>
              <div><label className="text-sm font-medium">Contexto</label><pre className="mt-1 p-3 bg-muted rounded text-xs overflow-auto max-h-[200px]">{JSON.stringify(selectedAnomaly.context, null, 2)}</pre></div>
              <div><label className="text-sm font-medium">Resolução</label><Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Descreva a análise e ação tomada..." rows={3} className="mt-1" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAnomaly(null)}>Cancelar</Button>
            <Button onClick={handleReview} disabled={reviewing}>{reviewing ? 'Salvando...' : 'Marcar como Revisado'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
