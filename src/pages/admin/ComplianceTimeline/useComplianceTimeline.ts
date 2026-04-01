import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, ptBR } from '@/lib/date-utils';
import { subDays } from 'date-fns';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface EvidenceLog {
  id: string;
  agent_id: string | null;
  agent_name: string;
  agent_version: string | null;
  event_type: string;
  event_data: any;
  evidence_hash: string;
  severity: string | null;
  state_before: string | null;
  state_after: string | null;
  created_at: string;
  tenant_id: string;
}

export function useComplianceTimeline() {
  const { tenant } = useTenant();
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7');

  const { data: evidenceLogs = [], isLoading, refetch } = useQuery({
    queryKey: ['evidence-logs', tenant?.id, dateRange],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const startDate = subDays(new Date(), parseInt(dateRange));
      const { data, error } = await supabase
        .from('agent_evidence_logs')
        .select('id, agent_id, agent_name, agent_version, event_type, event_data, evidence_hash, severity, state_before, state_after, created_at, tenant_id')
        .eq('tenant_id', tenant.id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as EvidenceLog[];
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });

  const uniqueAgents = useMemo(() => {
    const agents = new Set(evidenceLogs.map(log => log.agent_name));
    return Array.from(agents).sort();
  }, [evidenceLogs]);

  const uniqueEventTypes = useMemo(() => {
    const types = new Set(evidenceLogs.map(log => log.event_type));
    return Array.from(types).sort();
  }, [evidenceLogs]);

  const filteredLogs = useMemo(() => {
    return evidenceLogs.filter(log => {
      const matchesSearch =
        log.agent_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.event_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.evidence_hash.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesEventType = eventTypeFilter === 'all' || log.event_type === eventTypeFilter;
      const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
      const matchesAgent = agentFilter === 'all' || log.agent_name === agentFilter;
      return matchesSearch && matchesEventType && matchesSeverity && matchesAgent;
    });
  }, [evidenceLogs, searchTerm, eventTypeFilter, severityFilter, agentFilter]);

  const eventsByDayData = useMemo(() => {
    const days = parseInt(dateRange, 10);
    const data: Record<string, { date: string; total: number; critical: number; high: number; medium: number; low: number; info: number }> = {};
    for (let i = 0; i < days; i++) {
      const date = format(subDays(new Date(), i), 'dd/MM');
      data[date] = { date, total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    }
    filteredLogs.forEach(log => {
      const date = format(new Date(log.created_at), 'dd/MM');
      if (data[date]) {
        data[date].total++;
        const severity = log.severity || 'info';
        if (data[date][severity] !== undefined) {
          data[date][severity]++;
        }
      }
    });
    return Object.values(data).reverse();
  }, [filteredLogs, dateRange]);

  const eventsByTypeData = useMemo(() => {
    const types: Record<string, number> = {};
    filteredLogs.forEach(log => {
      types[log.event_type] = (types[log.event_type] || 0) + 1;
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [filteredLogs]);

  const eventsBySeverityData = useMemo(() => {
    const severities: Record<string, number> = {};
    filteredLogs.forEach(log => {
      const severity = log.severity || 'info';
      severities[severity] = (severities[severity] || 0) + 1;
    });
    return Object.entries(severities).map(([name, value]) => ({
      name, value,
      color: SEVERITY_COLORS[name] || 'hsl(var(--muted))'
    }));
  }, [filteredLogs]);

  const exportCSV = () => {
    const headers = ['Data/Hora', 'Agente', 'Tipo', 'Severidade', 'Estado Anterior', 'Estado Posterior', 'Hash'];
    const rows = filteredLogs.map(log => [
      format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss'),
      log.agent_name,
      log.event_type,
      log.severity || 'info',
      log.state_before || '-',
      log.state_after || '-',
      log.evidence_hash.substring(0, 16) + '...'
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `compliance-timeline-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso');
  };

  const exportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();

      const { loadLogoForPDF, addLogoToPDF } = await import('@/lib/pdfLogoHelper');
      const logoDataUrl = await loadLogoForPDF();
      addLogoToPDF(doc, logoDataUrl, 22, 6, 16);
      doc.setFontSize(16);
      doc.setTextColor(0, 100, 180);
      doc.text('Relatório de Compliance - Timeline de Evidências', 36, 20);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, 28);
      doc.text(`Período: Últimos ${dateRange} dias`, 14, 34);
      doc.text(`Total de eventos: ${filteredLogs.length}`, 14, 40);

      const criticalCount = filteredLogs.filter(l => l.severity === 'critical').length;
      const highCount = filteredLogs.filter(l => l.severity === 'high').length;

      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text('Resumo de Severidade:', 14, 52);

      doc.setFontSize(10);
      doc.setTextColor(200, 0, 0);
      doc.text(`• Crítico: ${criticalCount}`, 20, 60);
      doc.setTextColor(255, 100, 0);
      doc.text(`• Alto: ${highCount}`, 20, 66);
      doc.setTextColor(0);

      const tableData = filteredLogs.slice(0, 100).map(log => [
        format(new Date(log.created_at), 'dd/MM HH:mm'),
        log.agent_name.substring(0, 15),
        log.event_type.substring(0, 20),
        log.severity || 'info',
        log.state_before?.substring(0, 10) || '-',
        log.state_after?.substring(0, 10) || '-'
      ]);

      autoTable(doc, {
        head: [['Data', 'Agente', 'Tipo', 'Severidade', 'De', 'Para']],
        body: tableData,
        startY: 75,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [0, 100, 180] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 180, 290);
      }

      doc.save(`compliance-timeline-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('PDF exportado com sucesso');
    } catch (error) {
      logger.error('Failed to load PDF library:', error);
      toast.error('Erro ao carregar biblioteca de PDF');
    }
  };

  return {
    searchTerm, setSearchTerm,
    eventTypeFilter, setEventTypeFilter,
    severityFilter, setSeverityFilter,
    agentFilter, setAgentFilter,
    dateRange, setDateRange,
    filteredLogs, isLoading, refetch,
    uniqueAgents, uniqueEventTypes,
    eventsByDayData, eventsByTypeData, eventsBySeverityData,
    exportCSV, exportPDF,
  };
}

export const SEVERITY_COLORS: Record<string, string> = {
  critical: 'hsl(var(--destructive))',
  high: 'hsl(var(--destructive) / 0.8)',
  medium: 'hsl(var(--warning))',
  low: 'hsl(var(--muted-foreground))',
  info: 'hsl(var(--primary))',
};
