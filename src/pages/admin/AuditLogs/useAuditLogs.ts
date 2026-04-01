import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { toast } from 'sonner';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { exportAuditLogsWithIntegrity, generateExportCertificate } from '@/lib/audit-integrity';
import { logger } from '@/lib/logger';

const ITEMS_PER_PAGE = 20;

export const actionLabels: Record<string, string> = {
  'agent_enrolled': 'Computador Cadastrado',
  'agent_enrollment_failed': 'Falha no Cadastro',
  'job_created': 'Tarefa Criada',
  'job_creation_denied': 'Tarefa Negada',
  'login': 'Login Realizado',
  'logout': 'Logout',
  'update_role': 'Permissão Alterada',
  'create': 'Criação',
  'update': 'Atualização',
  'delete': 'Exclusão',
  'cleanup_agent': 'Limpeza de Computador',
};

export const resourceLabels: Record<string, string> = {
  'agent': 'Computador',
  'user': 'Usuário',
  'job': 'Tarefa',
  'enrollment_key': 'Chave de Instalação',
  'security_event': 'Evento de Segurança',
  'report': 'Relatório',
};

export const getActionLabel = (action: string) => actionLabels[action] || action;
export const getResourceLabel = (resource: string) => resourceLabels[resource] || resource;

export function useAuditLogs() {
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const searchTerm = useDebounce(searchInput, 500);
  const [isExporting, setIsExporting] = useState(false);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs', activeTenant?.id, page, actionFilter, userFilter, searchTerm],
    queryFn: async () => {
      if (!activeTenant?.id) return { data: [], count: 0 };
      
      let query = supabase
        .from('audit_logs')
        .select('*, actor:profiles!audit_logs_actor_id_fkey(full_name)', { count: 'exact' })
        .eq('tenant_id', activeTenant.id)
        .order('created_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (actionFilter !== 'all') query = query.eq('action', actionFilter);
      if (userFilter && userFilter !== 'all') query = query.eq('actor_id', userFilter);
      if (searchTerm) query = query.or(`action.ilike.%${searchTerm}%,resource_type.ilike.%${searchTerm}%`);

      const { data: logsData, error, count } = await query;
      if (error) throw error;
      return { data: logsData, count };
    },
  });

  const { data: users } = useQuery({
    queryKey: ['audit-users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles_public').select('user_id, full_name');
      if (error) throw error;
      return data;
    },
  });

  const totalPages = logs?.count ? Math.ceil(logs.count / ITEMS_PER_PAGE) : 0;

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      if (!activeTenant?.id) { toast.error('Tenant não selecionado'); return; }
      
      let query = supabase
        .from('audit_logs')
        .select('*, actor:profiles!audit_logs_actor_id_fkey(full_name)')
        .eq('tenant_id', activeTenant.id)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (actionFilter !== 'all') query = query.eq('action', actionFilter);
      if (userFilter && userFilter !== 'all') query = query.eq('actor_id', userFilter);
      if (searchTerm) query = query.or(`action.ilike.%${searchTerm}%,resource_type.ilike.%${searchTerm}%`);

      const { data, error } = await query;
      if (error) throw error;

      const headers = ['Data/Hora', 'Usuário', 'Ação', 'Recurso', 'ID Recurso', 'Resultado', 'IP'];
      const rows = (data || []).map((log: any) => [
        formatBrazilDateTime(log.created_at, 'full'),
        log.actor?.full_name || 'Sistema',
        getActionLabel(log.action),
        getResourceLabel(log.resource_type),
        log.resource_id || '-',
        log.success ? 'Sucesso' : 'Falha',
        log.ip_address || '-',
      ]);
      
      const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success(`Exportado ${data?.length || 0} registros`);
    } catch (error) {
      logger.error('Export error:', error);
      toast.error('Erro ao exportar logs');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCertificate = async () => {
    if (!activeTenant?.id) return;
    try {
      const result = await exportAuditLogsWithIntegrity(
        activeTenant.id,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        new Date()
      );
      const cert = generateExportCertificate(result);
      const blob = new Blob([cert], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-certificate-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      toast.success('Certificado exportado');
    } catch {
      toast.error('Erro ao exportar certificado');
    }
  };

  return {
    activeTenant, tenantLoading,
    logs, isLoading, users,
    page, setPage, totalPages,
    actionFilter, setActionFilter,
    userFilter, setUserFilter,
    searchInput, setSearchInput,
    isExporting, handleExportCSV, handleExportCertificate,
    getActionLabel, getResourceLabel,
  };
}
