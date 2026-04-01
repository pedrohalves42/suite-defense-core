import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Activity, AlertTriangle, Shield, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { format } from '@/lib/date-utils';
import type { EvidenceLog } from './useComplianceTimeline';

const EVENT_TYPE_ICONS: Record<string, React.ElementType> = {
  state_transition: Activity,
  policy_violation: AlertTriangle,
  security_event: Shield,
  compliance_check: CheckCircle,
  error: XCircle,
};

function getSeverityBadge(severity: string | null) {
  const sev = severity || 'info';
  const variants: Record<string, 'destructive' | 'secondary' | 'outline' | 'default'> = {
    critical: 'destructive', high: 'destructive', medium: 'secondary', low: 'outline', info: 'default',
  };
  return <Badge variant={variants[sev] || 'default'}>{sev}</Badge>;
}

function getEventIcon(eventType: string) {
  const Icon = EVENT_TYPE_ICONS[eventType] || Activity;
  return <Icon className="h-4 w-4" />;
}

interface Props {
  filteredLogs: EvidenceLog[];
  isLoading: boolean;
}

export const ComplianceEvidenceTable: React.FC<Props> = ({ filteredLogs, isLoading }) => (
  <Card>
    <CardHeader>
      <CardTitle>Registro de Evidências</CardTitle>
      <CardDescription>Mostrando {filteredLogs.length} eventos</CardDescription>
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Clock className="h-12 w-12 mb-4" />
          <p>Nenhum evento encontrado</p>
          <p className="text-sm">Ajuste os filtros ou aguarde novos eventos</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Data/Hora</TableHead>
                <TableHead>Agente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Severidade</TableHead>
                <TableHead>Transição</TableHead>
                <TableHead className="text-right">Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.slice(0, 100).map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(log.created_at), 'dd/MM HH:mm:ss')}
                  </TableCell>
                  <TableCell className="font-medium">{log.agent_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getEventIcon(log.event_type)}
                      <span className="text-sm">{log.event_type}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getSeverityBadge(log.severity)}</TableCell>
                  <TableCell className="text-sm">
                    {log.state_before && log.state_after ? (
                      <span>{log.state_before} → {log.state_after}</span>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {log.evidence_hash.substring(0, 12)}...
                    </code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent>
  </Card>
);
