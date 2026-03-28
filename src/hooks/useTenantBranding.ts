import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export interface TenantBranding {
  id: string;
  tenant_id: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  company_name: string | null;
  company_cnpj: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
  report_footer_text: string | null;
  report_header_text: string | null;
  custom_sections: Record<string, unknown>[];
}

export const useTenantBranding = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['tenant-branding', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data, error } = await supabase
        .from('tenant_branding')
        .select('id, tenant_id, company_name, company_cnpj, company_email, company_phone, company_website, company_address, logo_url, primary_color, secondary_color, accent_color, report_header_text, report_footer_text, custom_sections, created_at, updated_at')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      if (error) throw error;
      return data as TenantBranding | null;
    },
    enabled: !!tenant?.id,
  });

  const saveBranding = useMutation({
    mutationFn: async (branding: Partial<TenantBranding>) => {
      if (!tenant?.id) throw new Error('No tenant');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...rest } = branding;
      const payload = { ...rest, tenant_id: tenant.id } as Record<string, unknown>;

      // Check if exists
      const { data: existing } = await supabase
        .from('tenant_branding')
        .select('id')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      let data, error;
      if (existing) {
        ({ data, error } = await supabase
          .from('tenant_branding')
          .update(payload)
          .eq('tenant_id', tenant.id)
          .select()
          .single());
      } else {
        ({ data, error } = await supabase
          .from('tenant_branding')
          .insert(payload )
          .select()
          .single());
      }

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-branding'] });
      toast.success('Branding salvo com sucesso');
    },
    onError: (err: Error) => {
      toast.error('Erro ao salvar branding', { description: err.message });
    },
  });

  return { branding: query.data, isLoading: query.isLoading, saveBranding };
};
