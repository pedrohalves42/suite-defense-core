import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, RefreshCw, Trash2, CheckCircle, RotateCcw, Eye, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { getJobTypeLabel } from '@/lib/job-labels';

interface DLQEntry {
  id: string;
  original_job_id: string;
  tenant_id: string;
  agent_name: string;
  job_type: string;
  payload: any;
  error_message: string;
  error_count: number;
  retry_count: number;
  max_retries: number;
  status: 'pending' | 'retrying' | 'exhausted' | 'resolved';
  first_failure_at: string;
  last_failure_at: string;
  next_retry_at: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  retrying: { label: 'Retrying', variant: 'default' },
  exhausted: { label: 'Exhausted', variant: 'destructive' },
  resolved: { label: 'Resolved', variant: 'outline' },
};

export default function DeadLetterQueue() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedEntry, setSelectedEntry] = useState<DLQEntry | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const { data: entries, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dlq-entries', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('failed_jobs_dlq')
        .select('*')
        .order('last_failure_at', { ascending: false })
        .limit(100);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DLQEntry[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('failed_jobs_dlq')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolution_notes: notes,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Entry marked as resolved');
      queryClient.invalidateQueries({ queryKey: ['dlq-entries'] });
      setShowResolveDialog(false);
      setResolveNotes('');
    },
    onError: (error) => {
      toast.error(`Failed to resolve: ${error.message}`);
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (entry: DLQEntry) => {
      // Re-create the job via Edge Function
      const { error: jobError } = await supabase.functions.invoke('create-job', {
        body: {
          agent_name: entry.agent_name,
          job_type: entry.job_type,
          payload: entry.payload,
        }
      });
      if (jobError) throw jobError;

      // Update DLQ entry
      const { error: dlqError } = await supabase
        .from('failed_jobs_dlq')
        .update({
          status: 'retrying',
          retry_count: entry.retry_count + 1,
        })
        .eq('id', entry.id);
      if (dlqError) throw dlqError;
    },
    onSuccess: () => {
      toast.success('Job queued for retry');
      queryClient.invalidateQueries({ queryKey: ['dlq-entries'] });
    },
    onError: (error) => {
      toast.error(`Failed to retry: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('failed_jobs_dlq')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Entry deleted');
      queryClient.invalidateQueries({ queryKey: ['dlq-entries'] });
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const statusCounts = entries?.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <AdminPageLayout 
      title="Dead Letter Queue" 
      description="Monitor and manage failed jobs"
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(statusConfig).map(([status, config]) => (
            <Card key={status} className="cursor-pointer hover:bg-accent/50" onClick={() => setStatusFilter(status)}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground capitalize">{config.label}</span>
                  <Badge variant={config.variant}>{statusCounts[status] || 0}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Controls */}
        <div className="flex justify-between items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="retrying">Retrying</SelectItem>
              <SelectItem value="exhausted">Exhausted</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Failed Jobs</CardTitle>
            <CardDescription>Jobs that failed and were moved to the dead letter queue</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : entries?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No failed jobs in the queue</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Job Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Last Failure</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries?.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.agent_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getJobTypeLabel(entry.job_type)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusConfig[entry.status]?.variant || 'secondary'}>
                          {statusConfig[entry.status]?.label || entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={entry.retry_count >= entry.max_retries ? 'text-destructive' : ''}>
                          {entry.retry_count} / {entry.max_retries}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(entry.last_failure_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedEntry(entry);
                              setShowDetailsDialog(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {entry.status !== 'resolved' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => retryMutation.mutate(entry)}
                                disabled={retryMutation.isPending}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedEntry(entry);
                                  setShowResolveDialog(true);
                                }}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {(entry.status === 'exhausted' || entry.status === 'resolved') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(entry.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Job Details</DialogTitle>
            <DialogDescription>
              Failed job information and error details
            </DialogDescription>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Agent</label>
                  <p className="text-sm text-muted-foreground">{selectedEntry.agent_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo de Job</label>
                  <p className="text-sm text-muted-foreground">{getJobTypeLabel(selectedEntry.job_type)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">First Failure</label>
                  <p className="text-sm text-muted-foreground">
                    {new Date(selectedEntry.first_failure_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Error Count</label>
                  <p className="text-sm text-muted-foreground">{selectedEntry.error_count}</p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Error Message</label>
                <div className="mt-1 p-3 bg-destructive/10 rounded-md text-sm font-mono text-destructive">
                  <AlertCircle className="h-4 w-4 inline mr-2" />
                  {selectedEntry.error_message || 'No error message'}
                </div>
              </div>

              {selectedEntry.payload && (
                <div>
                  <label className="text-sm font-medium">Payload</label>
                  <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedEntry.payload, null, 2)}
                  </pre>
                </div>
              )}

              {selectedEntry.resolution_notes && (
                <div>
                  <label className="text-sm font-medium">Resolution Notes</label>
                  <p className="mt-1 p-3 bg-muted rounded-md text-sm">{selectedEntry.resolution_notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Resolved</DialogTitle>
            <DialogDescription>
              Add notes explaining how this issue was resolved
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Resolution notes (optional)"
            value={resolveNotes}
            onChange={(e) => setResolveNotes(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedEntry && resolveMutation.mutate({ id: selectedEntry.id, notes: resolveNotes })}
              disabled={resolveMutation.isPending}
            >
              {resolveMutation.isPending ? 'Resolving...' : 'Mark Resolved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
