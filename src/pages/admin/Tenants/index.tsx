import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Building2, Users } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { useTenants } from './useTenants';

export default function Tenants() {
  const {
    tenants, loadingTenants,
    users, loadingUsers,
    openCreate, setOpenCreate,
    openMove, setOpenMove,
    newTenantName, setNewTenantName,
    selectedUser, setSelectedUser,
    targetTenantId, setTargetTenantId,
    createTenant, moveUser,
    getUsersCountByTenant,
  } = useTenants();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Empresas Cadastradas</h2>
          <p className="text-muted-foreground">Gerencie organizações e mova usuários entre empresas</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={openMove} onOpenChange={setOpenMove}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Users className="h-4 w-4 mr-2" />
                Mover Usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mover Usuário entre Empresas</DialogTitle>
                <DialogDescription>Selecione um usuário e a empresa de destino</DialogDescription>
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
                    <SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
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
                  <Label>Empresa de Destino</Label>
                  <Select value={targetTenantId} onValueChange={setTargetTenantId}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                    <SelectContent>
                      {tenants?.filter((t) => t.id !== selectedUser?.tenant_id).map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
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
                Nova Empresa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Empresa</DialogTitle>
                <DialogDescription>Cadastre uma nova organização no sistema</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome da Empresa</Label>
                  <Input
                    placeholder="Nome da Empresa"
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
                  Criar Empresa
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Empresas</CardTitle>
          <CardDescription>Lista de todas as empresas cadastradas</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingTenants ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Identificador</TableHead>
                  <TableHead>Usuários</TableHead>
                  <TableHead>Cadastrado em</TableHead>
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
                    <TableCell>{formatBrazilDateTime(tenant.created_at, 'datetime')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuários por Empresa</CardTitle>
          <CardDescription>Visualização detalhada dos usuários e suas empresas</CardDescription>
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
                  <TableHead>Permissão</TableHead>
                  <TableHead>Empresa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => {
                  const tenant = tenants?.find((t) => t.id === user.tenant_id);
                  return (
                    <TableRow key={user.user_id}>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.full_name}</TableCell>
                      <TableCell><span className="capitalize">{user.role}</span></TableCell>
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
