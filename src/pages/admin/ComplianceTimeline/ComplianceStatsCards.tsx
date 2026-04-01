import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StatsCardsProps {
  totalEvents: number;
  criticalEvents: number;
  activeAgents: number;
  eventTypes: number;
}

export const ComplianceStatsCards: React.FC<StatsCardsProps> = ({
  totalEvents, criticalEvents, activeAgents, eventTypes,
}) => (
  <div className="grid gap-4 md:grid-cols-4">
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Total de Eventos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{totalEvents}</div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-destructive">Eventos Críticos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-destructive">{criticalEvents}</div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Agentes Ativos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{activeAgents}</div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Tipos de Evento</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{eventTypes}</div>
      </CardContent>
    </Card>
  </div>
);
