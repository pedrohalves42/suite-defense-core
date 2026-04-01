import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StuckJob } from './useSystemOperations';

interface StuckJobsTableProps {
  jobs: StuckJob[];
  onCleanup: () => void;
  isPending: boolean;
}

export function StuckJobsTable({ jobs, onCleanup, isPending }: StuckJobsTableProps) {
  if (jobs.length === 0) return null;

  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />Jobs Travados ({jobs.length})
            </CardTitle>
            <CardDescription>Jobs que não completaram no tempo esperado</CardDescription>
          </div>
          <Button variant="destructive" size="sm" onClick={onCleanup} disabled={isPending}>
            <Trash2 className={cn("h-4 w-4 mr-2", isPending && "animate-pulse")} />
            {isPending ? 'Limpando...' : 'Limpar Todos'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Computador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Problema</TableHead>
              <TableHead className="text-right">Tempo Travado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-medium">{job.agent_name}</TableCell>
                <TableCell><Badge variant="outline">{job.type}</Badge></TableCell>
                <TableCell>
                  <Badge variant={job.status === 'delivered' ? 'secondary' : job.status === 'queued' ? 'outline' : 'destructive'}>
                    {job.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="destructive" className="text-xs">{job.stuck_reason.replace('stuck_', '').toUpperCase()}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{Math.round(job.minutes_stuck)} min</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
