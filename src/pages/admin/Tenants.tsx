import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Building2, Users } from 'lucide-react';
import { format } from 'date-fns';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

interface User {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  tenant_id: string;
  tenant_name: string;
}

export default function Tenants() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [openMove, setOpenMove] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [targetTenantId, setTargetTenantId] = useState('');

  const { data: tenants, isLoading: loadingTenants } = useQuery({
    queryKey: ['all-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
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
      
      const users = await response.json();
      return users;
    },
  });

  const createTenant = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const slug = newTenantName.toLowerCase().replace(/\s+/g, '-') + '-' + crypto.randomUUID().substring(0, 8);

      const { data, error} = await supabase
        .from('tenants')
        .insert({
          name: newTenantName,
          slug,
          owner_user_id: user.id,
        })
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
      if (!selectedUser || !targetTenantId) throw new Error('Selecione um usuário e tenant de destino');

      const { error } = await supabase
        .from('user_roles')
        .update({ tenant_id: targetTenantId })
        .eq('user_id', selectedUser.user_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users-with-tenants'] });
      toast({ title: 'Usuário movido com sucesso!' });
      setOpenMove(false);
      setSelectedUser(null);
      setTargetTenantId('');
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao mover usuário', variant: 'destructive' });
    },
  });

  const getUsersCountByTenant = (tenantId: string) => {
    return users?.filter((u) => u.tenant_id === tenantId).length || 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Gerenciamento de Tenants</h2>
          <p className="text-muted-foreground">Gerencie organizações e mova usuários entre tenants</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={openMove} onOpenChange={setOpenMove}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Users className="h-4 w-4 mr-2" />
                Mover Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mover Usuário entre Tenants</DialogTitle>
                <DialogDescription>
                  Selecione um usuário e o tenant de destino
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Usuário</Label>
                  <Select 
                    value={selectedUser?.user_id} 
                    onValueChange={(value) => {
                      const user = users?.find((u) => u.user_id === value);
                      setSelectedUser(user || null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.map((user) => (
                        <SelectItem key={user.user_id} value={user.user_id}>
                          {user.email} ({user.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tenant de Destino</Label>
                  <Select value={targetTenantId} onValueChange={setTargetTenantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants?.filter((t) => t.id !== selectedUser?.tenant_id).map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id}>
                          {tenant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={() => moveUser.mutate()} 
                  disabled={moveUser.isPending || !selectedUser || !targetTenantId}
                  className="w-full"
                >
                  Mover Usuário
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Tenant
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Tenant</DialogTitle>
                <DialogDescription>
                  Crie uma nova organização/tenant no sistema
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome do Tenant</Label>
                  <Input 
                    placeholder="Minha Organização"
                    value={newTenantName}
                    onChange={(e) => setNewTenantName(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={() => createTenant.mutate()} 
                  disabled={createTenant.isPending || !newTenantName}
                  className="w-full"
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  Criar Tenant
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenants Existentes</CardTitle>
          <CardDescription>Lista de todos os tenants do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingTenants ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Usuários</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants?.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {getUsersCountByTenant(tenant.id)}
                      </div>
                    </TableCell>
                    <TableCell>{format(new Date(tenant.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuários por Tenant</CardTitle>
          <CardDescription>Visualização detalhada de usuários e seus tenants</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Tenant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => {
                  const tenant = tenants?.find((t) => t.id === user.tenant_id);
                  return (
                    <TableRow key={user.user_id}>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.full_name}</TableCell>
                      <TableCell>
                        <span className="capitalize">{user.role}</span>
                      </TableCell>
                      <TableCell>{user.tenant_name || tenant?.name || 'N/A'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
