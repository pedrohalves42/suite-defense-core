import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
      toast.error('Tenant nao identificado');
      return;
    }

    setIsExporting(true);

    try {
      let data: any[] = [];
      let filename = '';
      const columns: string[] = [];

      // Calculate date filter
      const dateFilter = dateRange === 'all' 
        ? null 
        : subDays(new Date(), parseInt(dateRange)).toISOString();

      // Fetch data based on type
      switch (exportType) {
        case 'agents': {
          // ADR-026: Use RPC with explicit tenant_id
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
        toast.error('Nenhum dado disponivel para exportar');
        return;
      }

      // Export based on format
      if (exportFormat === 'csv') {
        exportToCSV(data, filename);
      } else {
        await exportToExcel(data, filename);
      }

      toast.success(`${data.length} registros exportados com sucesso!`);
    } catch (error) {
      logger.error('Error exporting data', error);
      toast.error('Erro ao exportar dados');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;

    // Get headers from first object
    const headers = Object.keys(data[0]);
    
    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape quotes and wrap in quotes if contains comma or newline
          const stringValue = String(value || '');
          if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      )
    ].join('\n');

    // Add BOM for Excel UTF-8 support
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
      
      // Add columns with auto-width
      worksheet.columns = headers.map(key => ({
        header: key,
        key: key,
        width: Math.min(50, Math.max(
          key.length + 2,
          ...data.map(row => String(row[key] || '').length + 2)
        ))
      }));

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add data rows
      data.forEach(row => worksheet.addRow(row));
    }

    // Generate and download file
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
    { value: 'agents', label: 'Agentes', count: stats?.agents || 0, icon: CheckCircle },
    { value: 'scans', label: 'Scans de Virus', count: stats?.scans || 0, icon: FileText },
    { value: 'jobs', label: 'Jobs', count: stats?.jobs || 0, icon: Calendar },
    { value: 'quarantine', label: 'Quarentena', count: stats?.quarantine || 0, icon: Download },
    { value: 'audit_logs', label: 'Logs de Auditoria', count: stats?.auditLogs || 0, icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-3xl font-bold">Exportacao de Dados</h2>
          <p className="text-muted-foreground">
            Exporte dados para analise offline e integracao com ferramentas de BI
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
          <CardTitle>Configuracao de Exportacao</CardTitle>
          <CardDescription>
            Selecione o tipo de dados, periodo e formato para exportar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Export Type */}
            <div className="space-y-2">
              <Label>Tipo de Dados</Label>
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

            {/* Date Range */}
            <div className="space-y-2">
              <Label>Periodo</Label>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Ultimos 7 dias</SelectItem>
                  <SelectItem value="30">Ultimos 30 dias</SelectItem>
                  <SelectItem value="90">Ultimos 90 dias</SelectItem>
                  <SelectItem value="all">Todos os registros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label>Formato</Label>
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

          {/* Export Button */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {exportType === 'agents' && `${stats?.agents || 0} agentes disponiveis`}
              {exportType === 'scans' && `${stats?.scans || 0} scans disponiveis`}
              {exportType === 'jobs' && `${stats?.jobs || 0} jobs disponiveis`}
              {exportType === 'quarantine' && `${stats?.quarantine || 0} arquivos em quarentena`}
              {exportType === 'audit_logs' && `${stats?.auditLogs || 0} logs de auditoria`}
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
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Exportar {exportFormat === 'csv' ? 'CSV' : 'Excel'}
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
            <CardTitle className="text-base">Formato CSV</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>? Compativel com Excel, Google Sheets e outras ferramentas</p>
            <p>? Tamanho de arquivo menor</p>
            <p>? Ideal para importacao em bancos de dados</p>
            <p>? Codificacao UTF-8 com BOM para suporte completo de caracteres</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Formato Excel (XLSX)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>? Formato nativo do Microsoft Excel</p>
            <p>? Colunas com largura automatica</p>
            <p>? Preserva formatacao e tipos de dados</p>
            <p>? Ideal para analise avancada e graficos</p>
          </CardContent>
        </Card>
      </div>

      {/* Use Cases */}
      <Card>
        <CardHeader>
          <CardTitle>Casos de Uso</CardTitle>
          <CardDescription>Como utilizar os dados exportados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Analise Offline
              </h4>
              <p className="text-sm text-muted-foreground">
                Abra os dados no Excel ou Google Sheets para criar graficos personalizados e relatorios
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Integracao BI
              </h4>
              <p className="text-sm text-muted-foreground">
                Importe para Power BI, Tableau, Looker ou outras ferramentas de Business Intelligence
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Conformidade
              </h4>
              <p className="text-sm text-muted-foreground">
                Mantenha backups dos dados de auditoria para atender requisitos de compliance
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
