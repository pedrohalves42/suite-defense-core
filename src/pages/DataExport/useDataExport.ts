import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { subDays } from 'date-fns';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { logger } from '@/lib/logger';

export type ExportType = 'agents' | 'scans' | 'jobs' | 'quarantine' | 'audit_logs';
export type DateRange = '7' | '30' | '90' | 'all';
export type ExportFormat = 'csv' | 'excel';

export function useDataExport() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const [exportType, setExportType] = useState<ExportType>('agents');
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [isExporting, setIsExporting] = useState(false);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exportToExcel = async (data: any[], filename: string) => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Dados');
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      worksheet.columns = headers.map(key => ({
        header: key,
        key,
        width: Math.min(50, Math.max(key.length + 2, ...data.map(row => String(row[key] || '').length + 2)))
      }));
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      data.forEach(row => worksheet.addRow(row));
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportData = async () => {
    if (!tenant?.id) {
      toast.error(t('dataExportPage.tenantNotFound'));
      return;
    }
    setIsExporting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any[] = [];
      let filename = '';
      const dateFilter = dateRange === 'all' ? null : subDays(new Date(), parseInt(dateRange)).toISOString();

      switch (exportType) {
        case 'agents': {
          const { data: agentsRaw } = await supabase.rpc('get_agents_list', { p_tenant_id: tenant.id, p_include_archived: true });
          const agentsList = (agentsRaw as unknown as unknown[]) || [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const agentsSorted = dateFilter ? agentsList.filter((a: any) => a.enrolled_at >= dateFilter) : agentsList;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data = agentsSorted.map((a: any) => ({
            'Nome do Agente': a.agent_name, 'Status': a.status,
            'Data de Registro': formatBrazilDateTime(String(a.enrolled_at), 'datetime'),
            'Ultimo Heartbeat': a.last_heartbeat ? formatBrazilDateTime(String(a.last_heartbeat), 'datetime') : 'Nunca',
            'Tenant ID': a.tenant_id,
          }));
          filename = `agentes_${formatBrazilDateTime(new Date(), 'filename')}`;
          break;
        }
        case 'scans': {
          const query = supabase.from('virus_scans')
            .select('id, agent_name, file_path, file_hash, is_malicious, positives, total_scans, scanned_at, virustotal_permalink, tenant_id')
            .eq('tenant_id', tenant.id).order('scanned_at', { ascending: false });
          if (dateFilter) query.gte('scanned_at', dateFilter);
          const { data: scans, error } = await query;
          if (error) throw error;
          data = scans.map(s => ({
            'Agente': s.agent_name, 'Arquivo': s.file_path, 'Hash': s.file_hash,
            'Resultado': s.is_malicious ? 'Malicioso' : 'Limpo',
            'Deteccoes': `${s.positives}/${s.total_scans}`,
            'Data do Scan': formatBrazilDateTime(s.scanned_at, 'datetime'),
            'Link VirusTotal': s.virustotal_permalink || '',
          }));
          filename = `scans_${formatBrazilDateTime(new Date(), 'filename')}`;
          break;
        }
        case 'jobs': {
          const query = supabase.from('jobs')
            .select('id, agent_name, type, status, created_at, delivered_at, completed_at, approved, scheduled_at, is_recurring, tenant_id')
            .eq('tenant_id', tenant.id).order('created_at', { ascending: false });
          if (dateFilter) query.gte('created_at', dateFilter);
          const { data: jobs, error } = await query;
          if (error) throw error;
          data = jobs.map(j => ({
            'Agente': j.agent_name, 'Tipo': j.type, 'Status': j.status,
            'Criado em': formatBrazilDateTime(j.created_at, 'datetime'),
            'Entregue em': j.delivered_at ? formatBrazilDateTime(j.delivered_at, 'datetime') : '-',
            'Concluido em': j.completed_at ? formatBrazilDateTime(j.completed_at, 'datetime') : '-',
            'Aprovado': j.approved ? 'Sim' : 'Nao',
            'Agendado para': j.scheduled_at ? formatBrazilDateTime(j.scheduled_at, 'datetime') : '-',
            'Recorrente': j.is_recurring ? 'Sim' : 'Nao',
          }));
          filename = `jobs_${formatBrazilDateTime(new Date(), 'filename')}`;
          break;
        }
        case 'quarantine': {
          const query = supabase.from('quarantined_files')
            .select('id, agent_name, file_path, file_hash, quarantine_reason, status, quarantined_at, restored_at, tenant_id')
            .eq('tenant_id', tenant.id).order('quarantined_at', { ascending: false });
          if (dateFilter) query.gte('quarantined_at', dateFilter);
          const { data: quarantine, error } = await query;
          if (error) throw error;
          data = quarantine.map(q => ({
            'Agente': q.agent_name, 'Arquivo': q.file_path, 'Hash': q.file_hash,
            'Motivo': q.quarantine_reason, 'Status': q.status,
            'Quarentinado em': formatBrazilDateTime(q.quarantined_at, 'datetime'),
            'Restaurado em': q.restored_at ? formatBrazilDateTime(q.restored_at, 'datetime') : '-',
          }));
          filename = `quarentena_${formatBrazilDateTime(new Date(), 'filename')}`;
          break;
        }
        case 'audit_logs': {
          const query = supabase.from('audit_logs')
            .select('id, action, resource_type, resource_id, success, ip_address, user_agent, created_at, tenant_id')
            .eq('tenant_id', tenant.id).order('created_at', { ascending: false });
          if (dateFilter) query.gte('created_at', dateFilter);
          const { data: logs, error } = await query;
          if (error) throw error;
          data = logs.map(l => ({
            'Acao': l.action, 'Tipo de Recurso': l.resource_type, 'ID do Recurso': l.resource_id || '-',
            'Sucesso': l.success ? 'Sim' : 'Nao', 'Data': formatBrazilDateTime(l.created_at, 'full'),
            'IP': l.ip_address || '-', 'User Agent': l.user_agent || '-',
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

  return {
    exportType, setExportType, dateRange, setDateRange,
    exportFormat, setExportFormat, isExporting, stats, exportData, t,
  };
}
