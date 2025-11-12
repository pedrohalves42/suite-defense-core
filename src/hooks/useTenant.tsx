import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

export const useTenant = () => {
  const { user } = useAuth();

  const { data: tenant = null, isLoading: loading } = useQuery<Tenant | null>({
    queryKey: ['tenant', user?.id],
    queryFn: async () => {
      if (!user) return null;

      // Get user's tenant_id from user_roles
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (roleError) throw roleError;
      if (!userRole?.tenant_id) return null;

      // Get tenant details
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', userRole.tenant_id)
        .maybeSingle();

      if (tenantError) throw tenantError;
      return tenantData;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 minutes - tenant data rarely changes (APEX optimization)
  });

  return { tenant, loading };
};
