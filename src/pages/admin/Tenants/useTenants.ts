import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface TenantUser {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  tenant_id: string;
  tenant_name: string;
}

export function useTenants() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [openMove, setOpenMove] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [targetTenantId, setTargetTenantId] = useState('');

  const { data: tenants, isLoading: loadingTenants } = useQuery({
    queryKey: ['all-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, owner_user_id, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Tenant[];
    },
  });

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['all-users-with-tenants'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-all-users-admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch users');
      }

      const rawUsers = await response.json();
      const groupedMap = new Map<string, TenantUser>();

      rawUsers.forEach((user: TenantUser) => {
        if (groupedMap.has(user.user_id)) {
          const existing = groupedMap.get(user.user_id)!;
          existing.role = `${existing.role}, ${user.role}`;
        } else {
          groupedMap.set(user.user_id, { ...user });
        }
      });

      return Array.from(groupedMap.values());
    },
  });

  const createTenant = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const slug = newTenantName.toLowerCase().replace(/\s+/g, '-') + '-' + crypto.randomUUID().substring(0, 8);

      const { data, error } = await supabase
        .from('tenants')
        .insert({ name: newTenantName, slug, owner_user_id: user.id })
        .select()
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-tenants'] });
      toast({ title: 'Tenant criado com sucesso!' });
      setOpenCreate(false);
      setNewTenantName('');
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao criar tenant', variant: 'destructive' });
    },
  });

  const moveUser = useMutation({
    mutationFn: async () => {
      if (!selectedUser || !targetTenantId) throw new Error('Selecione um usuario e tenant de destino');
      const { error } = await supabase
        .from('user_roles')
        .update({ tenant_id: targetTenantId })
        .eq('user_id', selectedUser.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users-with-tenants'] });
      toast({ title: 'Usuario movido com sucesso!' });
      setOpenMove(false);
      setSelectedUser(null);
      setTargetTenantId('');
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao mover usuario', variant: 'destructive' });
    },
  });

  const getUsersCountByTenant = (tenantId: string) => {
    return users?.filter((u) => u.tenant_id === tenantId).length || 0;
  };

  return {
    tenants, loadingTenants,
    users, loadingUsers,
    openCreate, setOpenCreate,
    openMove, setOpenMove,
    newTenantName, setNewTenantName,
    selectedUser, setSelectedUser,
    targetTenantId, setTargetTenantId,
    createTenant, moveUser,
    getUsersCountByTenant,
  };
}
