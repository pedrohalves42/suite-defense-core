import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from './useActiveTenant';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';

export interface TenantCompanyData {
  company_name: string;
  cnpj: string;
  phone: string;
  contact_email: string;
}

export interface TenantAddressData {
  address: string;
  city: string;
  state: string;
  zip_code: string;
}

export interface BusinessHoursData {
  enabled: boolean;
  days: string[];
  start: string;
  end: string;
  timezone: string;
}

export interface TenantSetupData {
  company: TenantCompanyData;
  address: TenantAddressData;
  businessHours: BusinessHoursData;
}

export const useTenantSetup = () => {
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  const queryClient = useQueryClient();

  // Check if tenant needs setup
  const { data: needsSetup, isLoading: checkingSetup } = useQuery({
    queryKey: ['tenant-setup-status', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return false;

      const { data, error } = await supabase
        .from('tenants')
        .select('setup_completed')
        .eq('id', activeTenant.id)
        .single();

      if (error) {
        console.error('Error checking tenant setup status:', error);
        return false;
      }

      return data?.setup_completed !== true;
    },
    enabled: !tenantLoading && !!activeTenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get current tenant data for pre-filling the form
  const { data: tenantData } = useQuery({
    queryKey: ['tenant-setup-data', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return null;

      // Get tenant data
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', activeTenant.id)
        .single();

      if (tenantError) {
        console.error('Error fetching tenant data:', tenantError);
        return null;
      }

      // Get tenant settings for business hours
      const { data: settings, error: settingsError } = await supabase
        .from('tenant_settings')
        .select('business_hours')
        .eq('tenant_id', activeTenant.id)
        .maybeSingle();

      if (settingsError && settingsError.code !== 'PGRST116') {
        console.error('Error fetching tenant settings:', settingsError);
      }

      const bh = settings?.business_hours as Record<string, unknown> | null;
      const businessHours: BusinessHoursData | null = bh ? {
        enabled: bh.enabled === true,
        days: Array.isArray(bh.days) ? bh.days : ['mon', 'tue', 'wed', 'thu', 'fri'],
        start: typeof bh.start === 'string' ? bh.start : '08:00',
        end: typeof bh.end === 'string' ? bh.end : '18:00',
        timezone: typeof bh.timezone === 'string' ? bh.timezone : 'America/Sao_Paulo',
      } : null;

      return {
        tenant,
        businessHours,
      };
    },
    enabled: !tenantLoading && !!activeTenant?.id && needsSetup === true,
  });

  // Mutation to save setup data
  const saveSetupMutation = useMutation({
    mutationFn: async (data: TenantSetupData) => {
      if (!activeTenant?.id) throw new Error('No active tenant');

      // Update tenant with company and address data
      const { error: tenantError } = await supabase
        .from('tenants')
        .update({
          company_name: data.company.company_name,
          cnpj: data.company.cnpj || null,
          phone: data.company.phone || null,
          contact_email: data.company.contact_email || null,
          address: data.address.address || null,
          city: data.address.city || null,
          state: data.address.state || null,
          zip_code: data.address.zip_code || null,
          setup_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeTenant.id);

      if (tenantError) throw tenantError;

      // Check if tenant_settings exists
      const { data: existingSettings } = await supabase
        .from('tenant_settings')
        .select('id')
        .eq('tenant_id', activeTenant.id)
        .maybeSingle();

      if (existingSettings) {
        // Update existing
        const { error: settingsError } = await supabase
          .from('tenant_settings')
          .update({
            business_hours: data.businessHours as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', activeTenant.id);

        if (settingsError) throw settingsError;
      } else {
        // Insert new - need to use raw SQL or RPC since insert requires all fields
        const { error: settingsError } = await supabase
          .from('tenant_settings')
          .insert([{
            tenant_id: activeTenant.id,
            business_hours: data.businessHours as unknown as Json,
          }] as any);

        if (settingsError) throw settingsError;
      }

      return true;
    },
    onSuccess: () => {
      toast.success('Configuração inicial concluída com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['tenant-setup-status'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-setup-data'] });
      queryClient.invalidateQueries({ queryKey: ['user-tenants'] });
    },
    onError: (error) => {
      console.error('Error saving tenant setup:', error);
      toast.error('Erro ao salvar configuração. Tente novamente.');
    },
  });

  return {
    needsSetup: needsSetup ?? false,
    loading: tenantLoading || checkingSetup,
    tenantData,
    saveSetup: saveSetupMutation.mutateAsync,
    isSaving: saveSetupMutation.isPending,
  };
};
