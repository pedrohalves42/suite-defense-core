import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { useUserRole } from '@/hooks/useUserRole';
import type { TenantSettings } from './types';

const DEFAULT_SETTINGS: Partial<TenantSettings> = {
  alert_email: '',
  alert_webhook_url: '',
  alert_threshold_virus_positive: 1,
  alert_threshold_failed_jobs: 5,
  alert_threshold_offline_agents: 3,
  virustotal_enabled: false,
  stripe_enabled: false,
  enable_email_alerts: true,
  enable_webhook_alerts: false,
  enable_auto_quarantine: false,
  enable_dry_run_mode: false,
};

export function useSettingsData() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant, loading: tenantLoading } = useTenant();
  const { canWrite, loading: roleLoading } = useUserRole();

  const [tenantName, setTenantName] = useState('');
  const [settings, setSettings] = useState<Partial<TenantSettings>>(DEFAULT_SETTINGS);

  const { data: tenantSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['tenant-settings', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data, error } = await supabase
        .from('tenant_settings')
        .select('id, tenant_id, alert_email, alert_webhook_url, enable_email_alerts, enable_webhook_alerts, enable_auto_quarantine, enable_dry_run_mode, virustotal_enabled, dns_local_filter_enabled, alert_threshold_failed_jobs, alert_threshold_offline_agents, alert_threshold_virus_positive, force_human_review_critical, stripe_enabled, business_hours, created_at, updated_at')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from('tenant_settings')
          .insert({ tenant_id: tenant.id })
          .select()
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (insertError) throw insertError;
        return newSettings;
      }
      return data;
    },
    enabled: !!tenant?.id,
  });

  useEffect(() => {
    if (tenantSettings) setSettings(tenantSettings);
  }, [tenantSettings]);

  const updateTenant = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error('Tenant nao encontrado');
      const { error } = await supabase.from('tenants').update({ name: tenantName }).eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      toast({ title: 'Nome do tenant atualizado!' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar tenant', variant: 'destructive' });
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (newSettings: Partial<TenantSettings>) => {
      if (!tenant) throw new Error('Tenant nao encontrado');
      if (newSettings.alert_email && !newSettings.alert_email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        throw new Error('Email invalido');
      }
      if (newSettings.alert_webhook_url && !newSettings.alert_webhook_url.match(/^https?:\/\/.+/)) {
        throw new Error('URL do webhook invalida');
      }
      const { error } = await supabase.from('tenant_settings').update(newSettings).eq('tenant_id', tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      toast({ title: 'Configuracoes atualizadas com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao atualizar configuracoes', variant: 'destructive' });
    },
  });

  const loading = tenantLoading || roleLoading || settingsLoading;

  return {
    tenant, canWrite, loading,
    tenantName, setTenantName,
    settings, setSettings,
    updateTenant, updateSettings,
  };
}
