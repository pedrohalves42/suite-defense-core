import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

const ITEMS_PER_PAGE = 10;

export default function Users() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users', page, searchTerm, roleFilter],
    queryFn: async () => {
      // First get all user roles for current tenant
      let rolesQuery = supabase
        .from('user_roles')
        .select('user_id, role', { count: 'exact' });

      if (roleFilter !== 'all') {
        rolesQuery = rolesQuery.eq('role', roleFilter as 'admin' | 'operator' | 'viewer');
      }

      const { data: userRoles, error: rolesError, count } = await rolesQuery;
      
      if (rolesError) throw rolesError;

      // Then get profiles for those users with pagination
      let profilesQuery = supabase
        .from('profiles')
        .select('*')
        .in('user_id', userRoles?.map(ur => ur.user_id) || [])
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (searchTerm) {
        profilesQuery = profilesQuery.or(`full_name.ilike.%${searchTerm}%`);
      }

      const { data: profiles, error: profilesError } = await profilesQuery;
      
      if (profilesError) throw profilesError;

      // Combine the data
      const combined = profiles?.map(profile => ({
        ...profile,
        role: userRoles?.find(ur => ur.user_id === profile.user_id)?.role || 'viewer'
      })) || [];

      return { data: combined, count: count || 0 };
    },
  });

  const totalPages = users?.count ? Math.ceil(users.count / ITEMS_PER_PAGE) : 0;

  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'admin' | 'operator' | 'viewer' }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Role atualizada com sucesso!' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar role', variant: 'destructive' });
    },
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'default';
      case 'operator': return 'secondary';
      case 'viewer': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Gerenciar Usuários</h2>
        <p className="text-muted-foreground">Gerencie os usuários e suas permissões no sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Busque e filtre os usuários</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                placeholder="Buscar por nome..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div>
              <Select value={roleFilter} onValueChange={(value) => {
                setRoleFilter(value);
                setPage(0);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
          <CardDescription>
            Mostrando {users?.data?.length || 0} de {users?.count || 0} usuários
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <>
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Cadastrado em</TableHead>
                  <TableHead className="text-right">Alterar Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.data?.map((user: any) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.full_name || '-'}</TableCell>
                    <TableCell>{user.user_id}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(user.created_at), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="text-right">
                      <Select
                        value={user.role}
                        onValueChange={(value) => 
                          updateRole.mutate({ 
                            userId: user.user_id, 
                            newRole: value as 'admin' | 'operator' | 'viewer' 
                          })
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page + 1} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
