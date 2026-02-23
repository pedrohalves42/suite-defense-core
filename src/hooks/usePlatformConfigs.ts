import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { toast } from 'sonner';

export const usePlatformConfigs = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const configs = useQuery({
    queryKey: ['platform-configs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('platform_configs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('platform');
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const agentsByPlatform = useQuery({
    queryKey: ['agents-by-platform', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { windows: 0, macos: 0, linux: 0 };
      // ADR-026: Use RPC with explicit tenant_id
      const { data: rawData, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      if (error) throw error;
      const data = (rawData as unknown as Array<{ os_type: string | null }>) || [];
      const counts = { windows: 0, macos: 0, linux: 0 };
      for (const a of data || []) {
        const os = (a.os_type || 'windows').toLowerCase();
        if (os.includes('mac') || os.includes('darwin')) counts.macos++;
        else if (os.includes('linux') || os.includes('ubuntu') || os.includes('centos') || os.includes('debian')) counts.linux++;
        else counts.windows++;
      }
      return counts;
    },
    enabled: !!tenant?.id,
  });

  const savePlatformConfig = useMutation({
    mutationFn: async (config: {
      platform: string;
      is_enabled: boolean;
      install_command_template?: string;
      default_install_path?: string;
      service_name?: string;
    }) => {
      if (!tenant?.id) throw new Error('No tenant');
      const { data, error } = await supabase
        .from('platform_configs')
        .upsert({ ...config, tenant_id: tenant.id }, { onConflict: 'tenant_id,platform' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-configs'] });
      toast.success('Configuração de plataforma salva');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  return { configs, agentsByPlatform, savePlatformConfig };
};
