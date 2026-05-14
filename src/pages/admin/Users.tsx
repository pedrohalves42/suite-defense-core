import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callGateway } from '@/lib/gateway';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { ChevronLeft, ChevronRight, Mail, UserCheck, UserX, Users as UsersIcon, Filter } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AppRole, isValidRole, assertValidRole } from '@/types/roles';
import { UserWithDetails } from '@/types/user';
import { getRoleBadgeVariant, getUserStatusVariant, getUserStatusText } from '@/lib/badges';
import { PageHeader } from '@/components/ui/page-header';
import { EnterpriseCard } from '@/components/ui/enterprise-card';

const ITEMS_PER_PAGE = 10;

export default function Users() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useSuperAdmin();
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithDetails | null>(null);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-users', isSuperAdmin],
    queryFn: async () => {
      // Super admin sees ALL users from ALL tenants
      if (isSuperAdmin) {
        const result = await callGateway<any>('admin', 'list-all-users-admin');
        return Array.isArray(result) ? result : (result.users || []);
      }

      const result = await callGateway<any>('admin', 'list-users');
      return Array.isArray(result) ? result : (result.users || []);
    },
  });

  const filteredUsers = useMemo(() => {
    if (!usersData) return [];
    
    return (usersData as UserWithDetails[]).filter((user) => {
      const matchesSearch = !searchTerm || 
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [usersData, searchTerm, roleFilter]);

  const paginatedUsers = useMemo(() => {
    return filteredUsers.slice(
      page * ITEMS_PER_PAGE,
      (page + 1) * ITEMS_PER_PAGE
    );
  }, [filteredUsers, page]);

  const totalCount = filteredUsers.length;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      assertValidRole(newRole, 'newRole');
      // API contract: admin:update-user-role with payload { userId, roles: [...] }
      return await callGateway<any>('admin', 'update-user-role', { userId, roles: [newRole] });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      
      if (data?.updated) {
        toast({ title: 'Role atualizada com sucesso!' });
      } else {
        toast({ title: 'Role já estava definida', variant: 'default' });
      }
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao atualizar role', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const updateUserStatus = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      await callGateway('admin', 'update-user-status', { user_id: userId, is_active: isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Status do usuário atualizado!' });
      setStatusDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Erro ao atualizar status', variant: 'destructive' });
    },
  });

  const handleStatusChange = (user: any) => {
    setSelectedUser(user);
    setStatusDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Gerenciar Usuários"
        description="Gerencie os usuários e suas permissões no sistema"
        icon={UsersIcon}
      >
        <Link to="/admin/invites">
          <Button className="btn-enterprise gap-2">
            <Mail className="h-4 w-4" />
            Convidar Usuário
          </Button>
        </Link>
      </PageHeader>

      <EnterpriseCard title="Filtros" description="Busque e filtre os usuários" icon={Filter}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              placeholder="Buscar por nome..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(0);
              }}
              className="input-enterprise"
            />
          </div>
          <div>
            <Select value={roleFilter} onValueChange={(value) => {
              setRoleFilter(value);
              setPage(0);
            }}>
              <SelectTrigger className="input-enterprise">
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
      </EnterpriseCard>

      <EnterpriseCard 
        title="Usuários" 
        description={`Mostrando ${paginatedUsers.length} de ${totalCount} usuários`}
        icon={UsersIcon}
      >
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground/70">Carregando...</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  {isSuperAdmin && <TableHead>Tenant</TableHead>}
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cadastrado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.map((user) => (
                  <TableRow key={user.user_id}>
                    <TableCell>{user.full_name || '-'}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    {isSuperAdmin && (
                      <TableCell>
                        <Badge variant="outline">{user.tenant_name || 'N/A'}</Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getUserStatusVariant(user.is_active)}>
                        {getUserStatusText(user.is_active)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatBrazilDateTime(user.created_at, 'date')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Select
                          value={user.role}
                          onValueChange={(value) => {
                            if (isValidRole(value)) {
                              updateRole.mutate({ 
                                userId: user.user_id, 
                                newRole: value 
                              });
                            }
                          }}
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
                        <Button
                          size="sm"
                          variant={user.is_active ? 'destructive' : 'default'}
                          onClick={() => handleStatusChange(user)}
                        >
                          {user.is_active ? (
                            <><UserX className="h-4 w-4 mr-1" />Desativar</>
                          ) : (
                            <><UserCheck className="h-4 w-4 mr-1" />Ativar</>
                          )}
                        </Button>
                      </div>
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
      </EnterpriseCard>

      <ConfirmDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        title={`${selectedUser?.is_active ? 'Desativar' : 'Ativar'} Usuário`}
        description={`Tem certeza que deseja ${selectedUser?.is_active ? 'desativar' : 'ativar'} o usuário ${selectedUser?.email}?${selectedUser?.is_active ? ' O usuário não poderá mais acessar o sistema.' : ''}`}
        confirmLabel="Confirmar"
        destructive={!!selectedUser?.is_active}
        loading={updateUserStatus.isPending}
        onConfirm={() => {
          if (selectedUser) {
            updateUserStatus.mutate({
              userId: selectedUser.user_id,
              isActive: !selectedUser.is_active,
            });
          }
        }}
      />
    </div>
  );
}
