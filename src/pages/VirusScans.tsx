import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, ExternalLink, Shield, AlertTriangle, CheckCircle2, FileSearch, TrendingUp } from 'lucide-react';
import { subDays } from 'date-fns';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { ScanFileDialog } from '@/components/ScanFileDialog';
import { SystemScanButton } from '@/components/SystemScanButton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ITEMS_PER_PAGE = 15;

export default function VirusScans() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const [page, setPage] = useState(0);
  const [agentFilter, setAgentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: scans, isLoading } = useQuery({
    queryKey: ['virus-scans', tenant?.id, page, agentFilter, statusFilter, searchTerm, startDate, endDate],
    queryFn: async () => {
      if (!tenant?.id) return { data: [], count: 0 };
      
      let query = supabase
        .from('virus_scans')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .order('scanned_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (agentFilter !== 'all') {
        query = query.eq('agent_name', agentFilter);
      }

      if (statusFilter === 'malicious') {
        query = query.eq('is_malicious', true);
      } else if (statusFilter === 'clean') {
        query = query.eq('is_malicious', false);
      }

      if (searchTerm) {
        query = query.or(`file_path.ilike.%${searchTerm}%,file_hash.ilike.%${searchTerm}%`);
      }

      if (startDate) {
        query = query.gte('scanned_at', new Date(startDate).toISOString());
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte('scanned_at', end.toISOString());
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return { data, count };
    },
    enabled: !!tenant?.id
  });

  const { data: agents } = useQuery({
    queryKey: ['scan-agents', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase
        .from('virus_scans')
        .select('agent_name')
        .eq('tenant_id', tenant.id)
        .order('agent_name');
      
      if (error) throw error;
      
      // Get unique agent names
      const unique = [...new Set(data?.map(s => s.agent_name))];
      return unique;
    },
    enabled: !!tenant?.id
  });

  const totalPages = scans?.count ? Math.ceil(scans.count / ITEMS_PER_PAGE) : 0;

  const { data: trendData } = useQuery({
    queryKey: ['scan-trend', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const last7Days = subDays(new Date(), 7);
      const { data, error } = await supabase
        .from('virus_scans')
        .select('scanned_at, is_malicious')
        .eq('tenant_id', tenant.id)
        .gte('scanned_at', last7Days.toISOString())
        .order('scanned_at');
      
      if (error) throw error;

      const grouped = data.reduce((acc, scan) => {
        const date = new Date(scan.scanned_at).toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = { date, total: 0, malicious: 0 };
        }
        acc[date].total++;
        if (scan.is_malicious) acc[date].malicious++;
        return acc;
      }, {} as Record<string, { date: string; total: number; malicious: number }>);

      return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    },
    enabled: !!tenant?.id
  });


  const getStatusBadge = (ismalicious: boolean | null, positives: number | null) => {
    if (ismalicious === null) {
      return { variant: 'outline' as const, icon: FileSearch, text: t('virusScansPage.unknown') };
    }
    if (ismalicious) {
      return { variant: 'destructive' as const, icon: AlertTriangle, text: `${t('virusScansPage.malicious')} (${positives || 0})` };
    }
    return { variant: 'default' as const, icon: CheckCircle2, text: t('virusScansPage.clean') };
  };

  const ScanDetailsDialog = ({ scan }: { scan: any }) => {
    const status = getStatusBadge(scan.is_malicious, scan.positives);
    const StatusIcon = status.icon;

    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            {t('virusScansPage.details')}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {t('virusScansPage.scanDetails')}
            </DialogTitle>
            <DialogDescription>
              {t('virusScansPage.scanDetailsDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t('virusScansPage.status')}</p>
                <Badge variant={status.variant} className="mt-1">
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {status.text}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t('virusScansPage.computer')}</p>
                <p className="text-sm mt-1 font-mono">{scan.agent_name}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t('virusScansPage.scanDate')}</p>
                <p className="text-sm mt-1">{formatBrazilDateTime(scan.scanned_at, 'full')}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t('virusScansPage.detections')}</p>
                <p className="text-sm mt-1">{scan.positives || 0} / {scan.total_scans || 0}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-muted-foreground">{t('virusScansPage.filePath')}</p>
              <p className="text-sm mt-1 font-mono break-all bg-secondary p-2 rounded">{scan.file_path}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-muted-foreground">{t('virusScansPage.fileHash')}</p>
              <p className="text-sm mt-1 font-mono break-all bg-secondary p-2 rounded">{scan.file_hash}</p>
            </div>

            {scan.virustotal_permalink && (
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">VirusTotal</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(scan.virustotal_permalink, '_blank')}
                  className="w-full"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t('virusScansPage.viewVirusTotal')}
                </Button>
              </div>
            )}

            {scan.scan_result && (
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">{t('virusScansPage.detailedResult')}</p>
                <div className="bg-secondary p-3 rounded max-h-60 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify(scan.scan_result, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{t('virusScansPage.title')}</h1>
              <p className="text-muted-foreground">{t('virusScansPage.subtitle')}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <SystemScanButton />
          <ScanFileDialog />
        </div>
      </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('virusScansPage.filters')}</CardTitle>
            <CardDescription>{t('virusScansPage.filtersDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Input
                  placeholder={t('virusScansPage.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div>
                <Select value={agentFilter} onValueChange={(value) => {
                  setAgentFilter(value);
                  setPage(0);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('virusScansPage.allComputers')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('virusScansPage.allComputers')}</SelectItem>
                    {agents?.map((agent) => (
                      <SelectItem key={agent} value={agent}>
                        {agent}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={statusFilter} onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(0);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('virusScansPage.allStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('virusScansPage.allStatus')}</SelectItem>
                    <SelectItem value="malicious">{t('virusScansPage.maliciousOnly')}</SelectItem>
                    <SelectItem value="clean">{t('virusScansPage.cleanOnly')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Input
                  type="date"
                  placeholder="Data inicial"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div>
                <Input
                  type="date"
                  placeholder="Data final"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm('');
                    setAgentFilter('all');
                    setStatusFilter('all');
                    setStartDate('');
                    setEndDate('');
                    setPage(0);
                  }}
                  className="w-full"
                >
                  {t('virusScansPage.clearFilters')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('virusScansPage.scanResults')}</CardTitle>
            <CardDescription>
              {t('virusScansPage.showing', { shown: scans?.data?.length || 0, total: scans?.count || 0 })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">{t('virusScansPage.loading')}</div>
            ) : scans?.data?.length === 0 ? (
              <div className="text-center py-12">
                <FileSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">{t('virusScansPage.noScansFound')}</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('virusScansPage.dateTime')}</TableHead>
                      <TableHead>{t('virusScansPage.computer')}</TableHead>
                      <TableHead>{t('virusScansPage.file')}</TableHead>
                      <TableHead>{t('virusScansPage.hash')}</TableHead>
                      <TableHead>{t('virusScansPage.status')}</TableHead>
                      <TableHead>{t('virusScansPage.detections')}</TableHead>
                      <TableHead className="text-right">{t('virusScansPage.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scans?.data?.map((scan: any) => {
                      const status = getStatusBadge(scan.is_malicious, scan.positives);
                      const StatusIcon = status.icon;
                      return (
                        <TableRow key={scan.id} className={scan.is_malicious ? 'bg-destructive/5' : ''}>
                          <TableCell className="text-sm">
                            {formatBrazilDateTime(scan.scanned_at, 'datetime')}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{scan.agent_name}</TableCell>
                          <TableCell className="max-w-xs truncate text-sm" title={scan.file_path}>
                            {scan.file_path}
                          </TableCell>
                          <TableCell className="font-mono text-xs max-w-[150px] truncate" title={scan.file_hash}>
                            {scan.file_hash}
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {status.text}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {scan.positives || 0} / {scan.total_scans || 0}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <ScanDetailsDialog scan={scan} />
                            {scan.virustotal_permalink && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(scan.virustotal_permalink, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      {t('virusScansPage.previous')}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {t('virusScansPage.pageOf', { current: page + 1, total: totalPages })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      {t('virusScansPage.next')}
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
      </Card>
    </div>
  );
}
