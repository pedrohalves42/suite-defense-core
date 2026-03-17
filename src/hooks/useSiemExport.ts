import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export type SiemFormat = 'cef' | 'syslog' | 'json';

export interface SiemExportConfig {
  id: string;
  tenant_id: string;
  format: SiemFormat;
  is_active: boolean;
  webhook_url: string | null;
  include_event_types: string[];
  batch_size: number;
  export_interval_minutes: number;
  last_export_at: string | null;
}

export interface SiemExportHistoryEntry {
  id: string;
  events_exported: number;
  format: string;
  status: string;
  error_message: string | null;
  exported_at: string;
}

export const useSiemExport = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const configs = useQuery({
    queryKey: ['siem-configs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('siem_export_configs')
        .select('id, tenant_id, format, is_active, webhook_url, include_event_types, batch_size, export_interval_minutes, last_export_at')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SiemExportConfig[];
    },
    enabled: !!tenant?.id,
  });

  const history = useQuery({
    queryKey: ['siem-history', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('siem_export_history')
        .select('id, events_exported, format, status, error_message, exported_at')
        .eq('tenant_id', tenant.id)
        .order('exported_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as SiemExportHistoryEntry[];
    },
    enabled: !!tenant?.id,
  });

  const saveConfig = useMutation({
    mutationFn: async (config: Partial<SiemExportConfig> & { format: SiemFormat }) => {
      if (!tenant?.id) throw new Error('No tenant');
      const { data, error } = await supabase
        .from('siem_export_configs')
        .upsert({ ...config, tenant_id: tenant.id }, { onConflict: 'tenant_id,format' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['siem-configs'] });
      toast.success('Configuração SIEM salva');
    },
  });

  const exportNow = useMutation({
    mutationFn: async (params: { format: SiemFormat; since?: string }) => {
      const { data, error } = await supabase.functions.invoke('siem-export', {
        body: { format: params.format, since: params.since },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['siem-history'] });
      // Trigger download
      if (typeof data === 'string') {
        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cybershield-siem-${vars.format}-${Date.now()}.${vars.format === 'json' ? 'json' : 'log'}`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(`Exportação ${vars.format.toUpperCase()} concluída`);
    },
    onError: (err: Error) => {
      toast.error('Erro na exportação SIEM', { description: err.message });
    },
  });

  return {
    configs: configs.data || [],
    history: history.data || [],
    isLoading: configs.isLoading,
    saveConfig,
    exportNow,
  };
};
