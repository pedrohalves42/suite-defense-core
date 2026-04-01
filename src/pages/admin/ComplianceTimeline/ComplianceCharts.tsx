import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { ComplianceEvidenceTable } from './ComplianceEvidenceTable';
import type { EvidenceLog } from './useComplianceTimeline';

interface ComplianceChartsProps {
  eventsByDayData: Array<Record<string, any>>;
  eventsByTypeData: Array<{ name: string; value: number }>;
  eventsBySeverityData: Array<{ name: string; value: number; color: string }>;
  filteredLogs: EvidenceLog[];
  isLoading: boolean;
}

export const ComplianceCharts: React.FC<ComplianceChartsProps> = ({
  eventsByDayData, eventsByTypeData, eventsBySeverityData, filteredLogs, isLoading,
}) => (
  <Tabs defaultValue="timeline" className="space-y-4">
    <TabsList>
      <TabsTrigger value="timeline">Timeline</TabsTrigger>
      <TabsTrigger value="distribution">Distribuição</TabsTrigger>
      <TabsTrigger value="table">Tabela</TabsTrigger>
    </TabsList>

    <TabsContent value="timeline">
      <Card>
        <CardHeader>
          <CardTitle>Eventos por Dia</CardTitle>
          <CardDescription>Distribuição temporal de eventos de compliance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={eventsByDayData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" name="Total" strokeWidth={2} />
                <Line type="monotone" dataKey="critical" stroke="hsl(var(--destructive))" name="Crítico" />
                <Line type="monotone" dataKey="high" stroke="hsl(var(--destructive) / 0.7)" name="Alto" />
                <Line type="monotone" dataKey="medium" stroke="hsl(var(--warning))" name="Médio" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="distribution">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Por Tipo de Evento</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventsByTypeData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={80} />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" name="Eventos" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Por Severidade</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={eventsBySeverityData} cx="50%" cy="50%" labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80} dataKey="value">
                    {eventsBySeverityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </TabsContent>

    <TabsContent value="table">
      <ComplianceEvidenceTable filteredLogs={filteredLogs} isLoading={isLoading} />
    </TabsContent>
  </Tabs>
);
