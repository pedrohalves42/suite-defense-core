import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, Clock, Unlock } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import type { BlockedIP } from '../useSecurityDashboard';
import type { UseMutationResult } from '@tanstack/react-query';

interface BlockedIPsTableProps {
  blockedIPs: BlockedIP[] | undefined;
  unblockIPMutation: UseMutationResult<void, Error, string>;
}

export function BlockedIPsTable({ blockedIPs, unblockIPMutation }: BlockedIPsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>IPs Bloqueados</CardTitle>
        <CardDescription>Enderecos IP temporariamente bloqueados por tentativas de ataque</CardDescription>
      </CardHeader>
      <CardContent>
        {!blockedIPs || blockedIPs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>Nenhum IP bloqueado no momento</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP</TableHead>
                  <TableHead>Bloqueado em</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blockedIPs.map((block) => (
                  <TableRow key={block.id}>
                    <TableCell className="font-mono text-sm font-semibold">{block.ip_address}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatBrazilDateTime(block.created_at, 'full')}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {formatBrazilDateTime(block.blocked_until, 'full')}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{block.reason}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unblockIPMutation.mutate(block.ip_address)}
                        disabled={unblockIPMutation.isPending}
                      >
                        <Unlock className="h-3 w-3 mr-1" />
                        Desbloquear
                      </Button>
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
