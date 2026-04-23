import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useDebounce } from '@/hooks/useDebounce';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Shield, AlertTriangle, CheckCircle, Trash2, RotateCcw, Search, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { StatsGrid } from '@/components/ui/stats-grid';
import { SummaryStatCard } from '@/components/ui/summary-stat-card';

export default function Quarantine() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'restore' | 'delete'>('restore');
  const itemsPerPage = 10;

  // PERF: Debounce search input to avoid request storms (300ms)
  const debouncedSearch = useDebounce(searchTerm, 300);

  const queryClient = useQueryClient();

  // Fetch quarantined files - filtered by tenant
  // PERF: Column pruning — only select fields actually rendered in the table
  const { data: quarantinedFiles, isLoading } = useQuery({
    queryKey: ['quarantined-files', tenant?.id, page, debouncedSearch, statusFilter],
    queryFn: async () => {
      if (!tenant?.id) return { data: [], count: 0 };

      let query = supabase
        .from('quarantined_files')
        .select(
          'id, file_path, agent_name, status, quarantined_at, tenant_id, virus_scans(positives, total_scans, virustotal_permalink)',
          { count: 'exact' }
        )
        .eq('tenant_id', tenant.id)
        .order('quarantined_at', { ascending: false })
        .range((page - 1) * itemsPerPage, page * itemsPerPage - 1);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (debouncedSearch) {
        query = query.or(`file_path.ilike.%${debouncedSearch}%,agent_name.ilike.%${debouncedSearch}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data, count };
    },
    enabled: !!tenant?.id,
    staleTime: 60_000, // 1 min — quarantine list is not high-frequency telemetry
  });

  const restoreMutation = useMutation({
    mutationFn: async (fileId: string) => {
      // V-1070 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('quarantined_files')
        .update({
          status: 'restored',
          restored_at: new Date().toISOString(),
          restored_by: (await supabase.auth.getUser()).data.user?.id
        })
        .eq('id', fileId)
        .eq('tenant_id', tenant!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarantined-files'] });
      toast.success(t('quarantinePage.restoreSuccess'));
      setActionDialogOpen(false);
    },
    onError: () => {
      toast.error(t('quarantinePage.restoreError'));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      // V-1070 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('quarantined_files')
        .update({ status: 'deleted' })
        .eq('id', fileId)
        .eq('tenant_id', tenant!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarantined-files'] });
      toast.success(t('quarantinePage.deleteSuccess'));
      setActionDialogOpen(false);
    },
    onError: () => {
      toast.error(t('quarantinePage.deleteError'));
    }
  });

  // PERF: Stable callbacks prevent child <Button> nodes from re-rendering on every parent render
  const handleAction = useCallback((file: any, type: 'restore' | 'delete') => {
    setSelectedFile(file);
    setActionType(type);
    setActionDialogOpen(true);
  }, []);

  const confirmAction = useCallback(() => {
    if (!selectedFile) return;

    if (actionType === 'restore') {
      restoreMutation.mutate(selectedFile.id);
    } else {
      deleteMutation.mutate(selectedFile.id);
    }
  }, [selectedFile, actionType, restoreMutation, deleteMutation]);

  const getStatusBadge = (status: string) => {
    const variants = {
      quarantined: { variant: 'destructive' as const, icon: AlertTriangle, text: t('quarantinePage.statusQuarantined') },
      restored: { variant: 'default' as const, icon: CheckCircle, text: t('quarantinePage.statusRestored') },
      deleted: { variant: 'secondary' as const, icon: Trash2, text: t('quarantinePage.statusDeleted') }
    };
    
    const config = variants[status as keyof typeof variants];
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.text}
      </Badge>
    );
  };

  const totalPages = Math.ceil((quarantinedFiles?.count || 0) / itemsPerPage);

  // PERF: Single-pass O(n) status counters (was 3x .filter() iterations on each render)
  const statusCounts = useMemo(() => {
    const acc = { quarantined: 0, restored: 0, deleted: 0 };
    for (const f of quarantinedFiles?.data ?? []) {
      if (f.status === 'quarantined') acc.quarantined++;
      else if (f.status === 'restored') acc.restored++;
      else if (f.status === 'deleted') acc.deleted++;
    }
    return acc;
  }, [quarantinedFiles?.data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            {t('quarantinePage.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('quarantinePage.subtitle')}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <StatsGrid columns={3}>
        <SummaryStatCard
          icon={FileWarning}
          value={statusCounts.quarantined}
          label={t('quarantinePage.quarantined')}
          accent="destructive"
        />
        <SummaryStatCard
          icon={RotateCcw}
          value={statusCounts.restored}
          label={t('quarantinePage.restored')}
          accent="primary"
        />
        <SummaryStatCard
          icon={Trash2}
          value={statusCounts.deleted}
          label={t('quarantinePage.deleted')}
          accent="muted"
        />
      </StatsGrid>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('quarantinePage.filters')}</CardTitle>
          <CardDescription>{t('quarantinePage.filtersDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('quarantinePage.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('quarantinePage.allStatus')}</SelectItem>
                <SelectItem value="quarantined">{t('quarantinePage.statusQuarantined')}</SelectItem>
                <SelectItem value="restored">{t('quarantinePage.statusRestored')}</SelectItem>
                <SelectItem value="deleted">{t('quarantinePage.statusDeleted')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('quarantinePage.files')}</CardTitle>
          <CardDescription>
            {t('quarantinePage.filesDesc', { total: quarantinedFiles?.count || 0 })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">{t('quarantinePage.loading')}</div>
          ) : quarantinedFiles?.data?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileWarning className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>{t('quarantinePage.noFiles')}</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('quarantinePage.fileCol')}</TableHead>
                    <TableHead>{t('quarantinePage.agentCol')}</TableHead>
                    <TableHead>{t('quarantinePage.detectionsCol')}</TableHead>
                    <TableHead>{t('quarantinePage.statusCol')}</TableHead>
                    <TableHead>{t('quarantinePage.dateCol')}</TableHead>
                    <TableHead className="text-right">{t('quarantinePage.actionsCol')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quarantinedFiles?.data?.map((file: any) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-mono text-sm">{file.file_path}</TableCell>
                      <TableCell>{file.agent_name}</TableCell>
                      <TableCell>
                        {file.virus_scans?.[0] && (
                          <Badge variant="outline">
                            {file.virus_scans[0].positives}/{file.virus_scans[0].total_scans}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(file.status)}</TableCell>
                      <TableCell>{formatBrazilDateTime(file.quarantined_at, 'datetime')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {file.status === 'quarantined' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAction(file, 'restore')}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleAction(file, 'delete')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    {t('quarantinePage.previous')}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {t('quarantinePage.pageOf', { current: page, total: totalPages })}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    {t('quarantinePage.next')}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <ConfirmDialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        title={actionType === 'restore' ? t('quarantinePage.restoreFile') : t('quarantinePage.deleteFile')}
        description={actionType === 'restore' ? t('quarantinePage.restoreConfirm') : t('quarantinePage.deleteConfirm')}
        confirmLabel={t('quarantinePage.confirm')}
        cancelLabel={t('quarantinePage.cancel')}
        onConfirm={confirmAction}
        destructive={actionType === 'delete'}
      />
    </div>
  );
}
