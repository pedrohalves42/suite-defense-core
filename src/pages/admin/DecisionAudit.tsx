import { useState } from 'react';
import { formatBrazil } from '@/lib/date-utils';
import { 
  Scale, 
  Shield, 
  Download, 
  Filter, 
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useDecisionEvents, useDecisionRules, DecisionEvent } from '@/hooks/useDecisionEvents';
import { DecisionEventDrawer } from '@/components/decisions/DecisionEventDrawer';
import { toast } from 'sonner';

// Type guards for Json fields
interface EvidenceData {
  failure_count?: number;
  error_signature?: string;
  [key: string]: unknown;
}

interface ActionExecuted {
  type: string;
  success: boolean;
}

const getEvidence = (event: DecisionEvent): EvidenceData => {
  if (event.evidence && typeof event.evidence === 'object' && !Array.isArray(event.evidence)) {
    return event.evidence as unknown as EvidenceData;
  }
  return {};
};

const getActionsExecuted = (event: DecisionEvent): ActionExecuted[] => {
  if (Array.isArray(event.actions_executed)) {
    return event.actions_executed as unknown as ActionExecuted[];
  }
  return [];
};

export default function DecisionAudit() {
  const [selectedEvent, setSelectedEvent] = useState<DecisionEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ruleFilter, setRuleFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState('');

  const { data: events, isLoading, refetch, isFetching } = useDecisionEvents({
    ruleCode: ruleFilter !== 'all' ? ruleFilter : undefined,
    limit: 200
  });

  const { data: rules } = useDecisionRules();

  // Filter events by agent name
  const filteredEvents = events?.filter(event => {
    if (!agentFilter) return true;
    return event.agent_name?.toLowerCase().includes(agentFilter.toLowerCase());
  }) || [];

  const handleEventClick = (event: DecisionEvent) => {
    setSelectedEvent(event);
    setDrawerOpen(true);
  };

  const handleExportCSV = () => {
    if (!filteredEvents.length) {
      toast.error('Nenhum evento para exportar');
      return;
    }

    const headers = ['Data/Hora', 'Regra', 'Agente', 'Ação', 'Falhas', 'Erro', 'Ações Executadas'];
    const rows = filteredEvents.map(event => {
      const evidence = getEvidence(event);
      const actions = getActionsExecuted(event);
      return [
        formatBrazil(event.created_at, "yyyy-MM-dd HH:mm:ss"),
        event.rule_code,
        event.agent_name || 'N/A',
        event.action,
        evidence.failure_count || 0,
        evidence.error_signature || '',
        actions.map(a => `${a.type}:${a.success ? 'OK' : 'FAIL'}`).join('; ')
      ];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `decision-audit-${formatBrazil(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();

    toast.success('Exportação concluída');
  };

  const getActionBadgeVariant = (action: string): "default" | "destructive" | "outline" | "secondary" => {
    switch (action) {
      case 'ENTER_SAFE_MODE':
      case 'ISOLATE':
        return 'destructive';
      case 'THROTTLE':
        return 'secondary';
      case 'BLOCK_VERSION':
        return 'outline';
      default:
        return 'default';
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'ENTER_SAFE_MODE':
        return 'SAFE_MODE';
      case 'THROTTLE':
        return 'THROTTLE';
      case 'ISOLATE':
        return 'ISOLATE';
      case 'BLOCK_VERSION':
        return 'BLOCK';
      default:
        return action;
    }
  };

  const getSuccessRate = (event: DecisionEvent) => {
    const actions = getActionsExecuted(event);
    if (!actions.length) return 0;
    const successful = actions.filter(a => a.success).length;
    return Math.round((successful / actions.length) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            Auditoria de Decisões
          </h1>
          <p className="text-muted-foreground mt-1">
            Histórico de decisões automáticas do motor de regras
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportCSV}
            disabled={!filteredEvents.length}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Decisões</p>
                <p className="text-2xl font-bold">{events?.length || 0}</p>
              </div>
              <Scale className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ações Críticas</p>
                <p className="text-2xl font-bold text-destructive">
                  {events?.filter(e => ['ENTER_SAFE_MODE', 'ISOLATE', 'BLOCK_VERSION'].includes(e.action)).length || 0}
                </p>
              </div>
              <Shield className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Regras Ativas</p>
                <p className="text-2xl font-bold">
                  {rules?.filter(r => r.is_enabled).length || 0}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Últimas 24h</p>
                <p className="text-2xl font-bold">
                  {events?.filter(e => {
                    const eventDate = new Date(e.created_at);
                    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return eventDate > dayAgo;
                  }).length || 0}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-xs">
              <Input
                placeholder="Buscar por agente..."
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
              />
            </div>
            <Select value={ruleFilter} onValueChange={setRuleFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por regra" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as regras</SelectItem>
                {rules?.map(rule => (
                  <SelectItem key={rule.code} value={rule.code}>
                    {rule.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Eventos de Decisão</CardTitle>
          <CardDescription>
            Clique em um evento para ver detalhes completos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum evento de decisão encontrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Regra</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Falhas</TableHead>
                  <TableHead>Taxa de Sucesso</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => (
                  <TableRow 
                    key={event.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleEventClick(event)}
                  >
                    <TableCell className="font-mono text-sm">
                      {formatBrazil(event.created_at, "dd/MM HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {event.rule_code}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {event.agent_name || 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(event.action)}>
                        {getActionLabel(event.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">
                        {getEvidence(event).failure_count || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {getActionsExecuted(event).length > 0 ? (
                        <div className="flex items-center gap-2">
                          {getSuccessRate(event) === 100 ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : getSuccessRate(event) > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <span className="text-sm">
                            {getSuccessRate(event)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Event Detail Drawer */}
      <DecisionEventDrawer
        event={selectedEvent}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
