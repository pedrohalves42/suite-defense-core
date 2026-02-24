import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, FileText, Calendar, CheckCircle, Loader2 } from 'lucide-react';
import { subDays } from 'date-fns';
import { formatBrazilDateTime } from '@/lib/date-utils';
import ExcelJS from 'exceljs';
import { logger } from '@/lib/logger';

type ExportType = 'agents' | 'scans' | 'jobs' | 'quarantine' | 'audit_logs';
type DateRange = '7' | '30' | '90' | 'all';
type ExportFormat = 'csv' | 'excel';

export default function DataExport() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const [exportType, setExportType] = useState<ExportType>('agents');
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [isExporting, setIsExporting] = useState(false);

  // Statistics
  const { data: stats } = useQuery({
    queryKey: ['export-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const [agents, scans, jobs, quarantine, auditLogs] = await Promise.all([
        supabase.rpc('get_agents_list', { p_tenant_id: tenant.id, p_include_archived: true }),
        supabase.from('virus_scans').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabase.from('quarantined_files').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
      ]);

      return {
        agents: ((agents.data as unknown[]) || []).length,
        scans: scans.count || 0,
        jobs: jobs.count || 0,
        quarantine: quarantine.count || 0,
        auditLogs: auditLogs.count || 0,
      };
    },
    enabled: !!tenant?.id,
  });

  const exportData = async () => {
    if (!tenant?.id) {
      toast.error(t('dataExportPage.tenantNotFound'));
      return;
    }

    setIsExporting(true);

    try {
      let data: any[] = [];
      let filename = '';

      const dateFilter = dateRange === 'all' 
        ? null 
        : subDays(new Date(), parseInt(dateRange)).toISOString();

      switch (exportType) {
        case 'agents': {
          const { data: agentsRaw, error: agentsErr } = await supabase.rpc('get_agents_list', {
            p_tenant_id: tenant.id,
            p_include_archived: true,
          });
          const agentsList = (agentsRaw as unknown as Array<Record<string, unknown>>) || [];
          const agentsSorted = dateFilter 
            ? agentsList.filter((a: any) => a.enrolled_at >= dateFilter)
            : agentsList;

          data = agentsSorted.map((a: any) => ({
            'Nome do Agente': a.agent_name,
            'Status': a.status,
            'Data de Registro': formatBrazilDateTime(a.enrolled_at, 'datetime'),
            'Ultimo Heartbeat': a.last_heartbeat 
              ? formatBrazilDateTime(a.last_heartbeat, 'datetime')
              : 'Nunca',
            'Tenant ID': a.tenant_id,
          }));

          filename = `agentes_${formatBrazilDateTime(new Date(), 'filename')}`;
          break;
        }

        case 'scans': {
          const query = supabase
            .from('virus_scans')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('scanned_at', { ascending: false });

          if (dateFilter) query.gte('scanned_at', dateFilter);

          const { data: scans, error } = await query;
          if (error) throw error;

          data = scans.map(s => ({
            'Agente': s.agent_name,
            'Arquivo': s.file_path,
            'Hash': s.file_hash,
            'Resultado': s.is_malicious ? 'Malicioso' : 'Limpo',
            'Deteccoes': `${s.positives}/${s.total_scans}`,
            'Data do Scan': formatBrazilDateTime(s.scanned_at, 'datetime'),
            'Link VirusTotal': s.virustotal_permalink || '',
          }));

          filename = `scans_${formatBrazilDateTime(new Date(), 'filename')}`;
          break;
        }

        case 'jobs': {
          const query = supabase
            .from('jobs')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: false });

          if (dateFilter) query.gte('created_at', dateFilter);

          const { data: jobs, error } = await query;
          if (error) throw error;

          data = jobs.map(j => ({
            'Agente': j.agent_name,
            'Tipo': j.type,
            'Status': j.status,
            'Criado em': formatBrazilDateTime(j.created_at, 'datetime'),
            'Entregue em': j.delivered_at 
              ? formatBrazilDateTime(j.delivered_at, 'datetime')
              : '-',
            'Concluido em': j.completed_at 
              ? formatBrazilDateTime(j.completed_at, 'datetime')
              : '-',
            'Aprovado': j.approved ? 'Sim' : 'Nao',
            'Agendado para': j.scheduled_at 
              ? formatBrazilDateTime(j.scheduled_at, 'datetime')
              : '-',
            'Recorrente': j.is_recurring ? 'Sim' : 'Nao',
          }));

          filename = `jobs_${formatBrazilDateTime(new Date(), 'filename')}`;
          break;
        }

        case 'quarantine': {
          const query = supabase
            .from('quarantined_files')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('quarantined_at', { ascending: false });

          if (dateFilter) query.gte('quarantined_at', dateFilter);

          const { data: quarantine, error } = await query;
          if (error) throw error;

          data = quarantine.map(q => ({
            'Agente': q.agent_name,
            'Arquivo': q.file_path,
            'Hash': q.file_hash,
            'Motivo': q.quarantine_reason,
            'Status': q.status,
            'Quarentinado em': formatBrazilDateTime(q.quarantined_at, 'datetime'),
            'Restaurado em': q.restored_at 
              ? formatBrazilDateTime(q.restored_at, 'datetime')
              : '-',
          }));

          filename = `quarentena_${formatBrazilDateTime(new Date(), 'filename')}`;
          break;
        }

        case 'audit_logs': {
          const query = supabase
            .from('audit_logs')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: false });

          if (dateFilter) query.gte('created_at', dateFilter);

          const { data: logs, error } = await query;
          if (error) throw error;

          data = logs.map(l => ({
            'Acao': l.action,
            'Tipo de Recurso': l.resource_type,
            'ID do Recurso': l.resource_id || '-',
            'Sucesso': l.success ? 'Sim' : 'Nao',
            'Data': formatBrazilDateTime(l.created_at, 'full'),
            'IP': l.ip_address || '-',
            'User Agent': l.user_agent || '-',
          }));

          filename = `logs_auditoria_${formatBrazilDateTime(new Date(), 'filename')}`;
          break;
        }
      }

      if (data.length === 0) {
        toast.error(t('dataExportPage.noDataAvailable'));
        return;
      }

      if (exportFormat === 'csv') {
        exportToCSV(data, filename);
      } else {
        await exportToExcel(data, filename);
      }

      toast.success(t('dataExportPage.exportSuccess', { count: data.length }));
    } catch (error) {
      logger.error('Error exporting data', error);
      toast.error(t('dataExportPage.exportError'));
    } finally {
      setIsExporting(false);
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          const stringValue = String(value || '');
          if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
  };

  const exportToExcel = async (data: any[], filename: string) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Dados');

    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      worksheet.columns = headers.map(key => ({
        header: key,
        key: key,
        width: Math.min(50, Math.max(
          key.length + 2,
          ...data.map(row => String(row[key] || '').length + 2)
        ))
      }));

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      data.forEach(row => worksheet.addRow(row));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportOptions = [
    { value: 'agents', label: t('dataExportPage.agents'), count: stats?.agents || 0, icon: CheckCircle },
    { value: 'scans', label: t('dataExportPage.virusScans'), count: stats?.scans || 0, icon: FileText },
    { value: 'jobs', label: t('dataExportPage.jobs'), count: stats?.jobs || 0, icon: Calendar },
    { value: 'quarantine', label: t('dataExportPage.quarantine'), count: stats?.quarantine || 0, icon: Download },
    { value: 'audit_logs', label: t('dataExportPage.auditLogs'), count: stats?.auditLogs || 0, icon: FileText },
  ];

  const getAvailableText = () => {
    switch (exportType) {
      case 'agents': return t('dataExportPage.agentsAvailable', { count: stats?.agents || 0 });
      case 'scans': return t('dataExportPage.scansAvailable', { count: stats?.scans || 0 });
      case 'jobs': return t('dataExportPage.jobsAvailable', { count: stats?.jobs || 0 });
      case 'quarantine': return t('dataExportPage.quarantineAvailable', { count: stats?.quarantine || 0 });
      case 'audit_logs': return t('dataExportPage.auditLogsAvailable', { count: stats?.auditLogs || 0 });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-3xl font-bold">{t('dataExportPage.title')}</h2>
          <p className="text-muted-foreground">
            {t('dataExportPage.subtitle')}
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {exportOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Card key={option.value} className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">{option.count}</Badge>
                </div>
                <CardTitle className="text-sm">{option.label}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* Export Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dataExportPage.exportConfig')}</CardTitle>
          <CardDescription>
            {t('dataExportPage.exportConfigDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{t('dataExportPage.dataType')}</Label>
              <Select value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {exportOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({option.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('dataExportPage.period')}</Label>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t('dataExportPage.last7Days')}</SelectItem>
                  <SelectItem value="30">{t('dataExportPage.last30Days')}</SelectItem>
                  <SelectItem value="90">{t('dataExportPage.last90Days')}</SelectItem>
                  <SelectItem value="all">{t('dataExportPage.allRecords')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('dataExportPage.format')}</Label>
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      CSV (Excel/Google Sheets)
                    </div>
                  </SelectItem>
                  <SelectItem value="excel">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      Excel (XLSX)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {getAvailableText()}
            </div>
            <Button 
              onClick={exportData} 
              disabled={isExporting}
              size="lg"
              className="gap-2"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('dataExportPage.exporting')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {t('dataExportPage.exportBtn', { format: exportFormat === 'csv' ? 'CSV' : 'Excel' })}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Information Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dataExportPage.csvFormat')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>✓ {t('dataExportPage.csvFeature1')}</p>
            <p>✓ {t('dataExportPage.csvFeature2')}</p>
            <p>✓ {t('dataExportPage.csvFeature3')}</p>
            <p>✓ {t('dataExportPage.csvFeature4')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dataExportPage.excelFormat')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>✓ {t('dataExportPage.excelFeature1')}</p>
            <p>✓ {t('dataExportPage.excelFeature2')}</p>
            <p>✓ {t('dataExportPage.excelFeature3')}</p>
            <p>✓ {t('dataExportPage.excelFeature4')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Use Cases */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dataExportPage.useCases')}</CardTitle>
          <CardDescription>{t('dataExportPage.useCasesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                {t('dataExportPage.offlineAnalysis')}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t('dataExportPage.offlineAnalysisDesc')}
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {t('dataExportPage.biIntegration')}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t('dataExportPage.biIntegrationDesc')}
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {t('dataExportPage.compliance')}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t('dataExportPage.complianceDesc')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
