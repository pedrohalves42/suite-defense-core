import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { User } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import type { FailedAttempt } from '../useSecurityDashboard';

interface FailedAttemptsTableProps {
  failedAttempts: FailedAttempt[] | undefined;
}

export function FailedAttemptsTable({ failedAttempts }: FailedAttemptsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tentativas de Login Falhadas</CardTitle>
        <CardDescription>Tentativas de login que falharam nas ultimas 24 horas</CardDescription>
      </CardHeader>
      <CardContent>
        {!failedAttempts || failedAttempts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>Nenhuma tentativa falhada registrada</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>User Agent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedAttempts.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell className="font-mono text-xs">
                      {formatBrazilDateTime(attempt.created_at, 'full')}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold">{attempt.ip_address}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {attempt.email || <span className="text-muted-foreground">N/A</span>}
                    </TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={attempt.user_agent}>
                      {attempt.user_agent}
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
