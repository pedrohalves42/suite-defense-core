import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export const useTenant = () => {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTenant = async () => {
      if (!user) {
        setTenant(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Buscar tenant_id do user_role
        const { data: userRole, error: roleError } = await supabase
          .from('user_roles')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single();

        if (roleError) throw roleError;

        if (!userRole?.tenant_id) {
          setError('Usuário sem tenant associado');
          setLoading(false);
          return;
        }

        // Buscar dados do tenant
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', userRole.tenant_id)
          .single();

        if (tenantError) throw tenantError;

        setTenant(tenantData);
      } catch (err: any) {
        console.error('Erro ao buscar tenant:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTenant();
  }, [user]);

  return { tenant, loading, error };
};
