import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { toast } from 'sonner';

export const useItsmIntegrations = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const integrations = useQuery({
    queryKey: ['itsm-integrations', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('itsm_integrations')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const tickets = useQuery({
    queryKey: ['itsm-tickets', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('itsm_tickets')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const saveIntegration = useMutation({
    mutationFn: async (integration: {
      provider: string;
      display_name: string;
      base_url: string;
      project_key?: string;
      auth_type?: string;
      credentials_encrypted: Record<string, string>;
      default_issue_type?: string;
      default_priority?: string;
      auto_create_on_alert?: boolean;
      auto_create_severity_threshold?: string;
    }) => {
      if (!tenant?.id) throw new Error('No tenant');
      const { data, error } = await supabase
        .from('itsm_integrations')
        .insert({ ...integration, tenant_id: tenant.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['itsm-integrations'] });
      toast.success('Integração ITSM salva com sucesso');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const createTicket = useMutation({
    mutationFn: async (params: {
      integration_id: string;
      summary: string;
      description?: string;
      priority?: string;
      source_type: string;
      source_id?: string;
      agent_id?: string;
      agent_name?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('create-itsm-ticket', {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['itsm-tickets'] });
      toast.success(`Ticket ${data.external_key} criado com sucesso`);
    },
    onError: (err) => toast.error(`Erro ao criar ticket: ${err.message}`),
  });

  const toggleIntegration = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('itsm_integrations')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['itsm-integrations'] });
      toast.success('Integração atualizada');
    },
  });

  return { integrations, tickets, saveIntegration, createTicket, toggleIntegration };
};
