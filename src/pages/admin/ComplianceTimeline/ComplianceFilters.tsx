import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, Search, Calendar } from 'lucide-react';

interface ComplianceFiltersProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  dateRange: string;
  onDateRangeChange: (v: string) => void;
  eventTypeFilter: string;
  onEventTypeChange: (v: string) => void;
  severityFilter: string;
  onSeverityChange: (v: string) => void;
  agentFilter: string;
  onAgentChange: (v: string) => void;
  uniqueEventTypes: string[];
  uniqueAgents: string[];
}

export const ComplianceFilters: React.FC<ComplianceFiltersProps> = ({
  searchTerm, onSearchChange, dateRange, onDateRangeChange,
  eventTypeFilter, onEventTypeChange, severityFilter, onSeverityChange,
  agentFilter, onAgentChange, uniqueEventTypes, uniqueAgents,
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Filter className="h-4 w-4" />
        Filtros
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid gap-4 md:grid-cols-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} className="pl-9" />
        </div>
        <Select value={dateRange} onValueChange={onDateRangeChange}>
          <SelectTrigger>
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Último dia</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={eventTypeFilter} onValueChange={onEventTypeChange}>
          <SelectTrigger><SelectValue placeholder="Tipo de evento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {uniqueEventTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={onSeverityChange}>
          <SelectTrigger><SelectValue placeholder="Severidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="critical">Crítico</SelectItem>
            <SelectItem value="high">Alto</SelectItem>
            <SelectItem value="medium">Médio</SelectItem>
            <SelectItem value="low">Baixo</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={onAgentChange}>
          <SelectTrigger><SelectValue placeholder="Agente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os agentes</SelectItem>
            {uniqueAgents.map(agent => <SelectItem key={agent} value={agent}>{agent}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </CardContent>
  </Card>
);
