import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, Ban } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import type { SecurityLog } from '../useSecurityDashboard';
import { getSeverityColor, getAttackTypeLabel } from '../useSecurityDashboard';

interface SecurityLogTableProps {
  logs: SecurityLog[] | undefined;
  isLoading: boolean;
}

export function SecurityLogTable({ logs, isLoading }: SecurityLogTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Registros de Segurança
        </CardTitle>
        <CardDescription>
          Tentativas de ataque e validações falhadas (atualiza automaticamente a cada 10 segundos)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando logs de seguranca...</div>
        ) : !logs || logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>Nenhum evento de seguranca registrado</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Tipo de Ataque</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {formatBrazilDateTime(log.created_at, 'full')}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.endpoint}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getAttackTypeLabel(log.attack_type)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.ip_address}</TableCell>
                    <TableCell>
                      <Badge variant={getSeverityColor(log.severity) as "default" | "destructive" | "outline" | "secondary"}>
                        {log.severity.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {log.blocked ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400">
                          <Ban className="h-3 w-3 mr-1" />
                          Bloqueado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400">
                          Permitido
                        </Badge>
                      )}
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
}
