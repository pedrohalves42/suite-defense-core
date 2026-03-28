import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Bell } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatBrazilDateTime } from '@/lib/date-utils';
import type { NotificationLog } from './types';
import { CHANNEL_ICONS, CHANNEL_LABELS } from './types';

interface NotificationHistoryTabProps {
  logs: NotificationLog[];
}

export default function NotificationHistoryTab({ logs }: NotificationHistoryTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de Notificações</CardTitle>
        <CardDescription>Últimas 50 notificações enviadas</CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma notificação enviada ainda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canal</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const Icon = CHANNEL_ICONS[log.channel_type] || Bell;
                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {CHANNEL_LABELS[log.channel_type] || log.channel_type}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.recipient.slice(0, 20)}...
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {log.message_preview}
                    </TableCell>
                    <TableCell>
                      {log.status === 'sent' ? (
                        <Badge variant="outline" className="text-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Enviado
                        </Badge>
                      ) : log.status === 'failed' ? (
                        <Badge variant="outline" className="text-red-600">
                          <XCircle className="h-3 w-3 mr-1" />
                          Falhou
                        </Badge>
                      ) : (
                        <Badge variant="outline">{log.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatBrazilDateTime(log.created_at, 'short')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
