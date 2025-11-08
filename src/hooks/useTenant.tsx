import { useEffect, useState } from 'react';
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
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTenant = async () => {
      if (!user) {
        setTenant(null);
        setLoading(false);
        return;
      }

      try {
        // Get user's tenant_id from user_roles
        const { data: userRole, error: roleError } = await supabase
          .from('user_roles')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single();

        if (roleError) throw roleError;

        if (userRole?.tenant_id) {
          // Get tenant details
          const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', userRole.tenant_id)
            .single();

          if (tenantError) throw tenantError;
          setTenant(tenantData);
        }
      } catch (error) {
        console.error('Error fetching tenant:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTenant();
  }, [user]);

  return { tenant, loading };
};
