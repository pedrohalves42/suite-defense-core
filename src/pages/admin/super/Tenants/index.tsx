import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building2, Users, Activity, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { useTenants } from './useTenants';

export default function SuperAdminTenants() {
  const {
    tenantsWithStats, tenantsLoading, totalCount, totalPages,
    page, setPage, plans, tenantFeatures, totalStats,
    updateSubscription, PAGE_SIZE,
  } = useTenants();

  const getPlanBadge = (planName: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      free: 'secondary', pro: 'default', enterprise: 'destructive',
    };
    return <Badge variant={variants[planName] || 'outline'}>{planName.toUpperCase()}</Badge>;
  };

  if (tenantsLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Carregando dados dos tenants...</p>
          </div>
        </div>
      </div>
    );
  }

  if (tenantsWithStats.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Nenhum tenant encontrado no sistema.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Gerenciamento de Tenants</h1>
        <p className="text-muted-foreground">Visualize e gerencie todos os tenants e suas assinaturas</p>
      </div>

      <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          <strong>Super Admin:</strong> Voce tem acesso total para visualizar e modificar assinaturas de todos os tenants.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground">Organizacoes ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Usuarios</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">Usuarios em todos os tenants</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Computadores</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats?.totalAgents || 0}</div>
            <p className="text-xs text-muted-foreground">Computadores protegidos</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todos os Tenants</CardTitle>
          <CardDescription>Visualize e altere os planos de assinatura de cada tenant</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Tenant</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plano Atual</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Computadores</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Alterar Plano</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenantsWithStats.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                  <TableCell>
                    {tenant.subscription ? getPlanBadge(tenant.subscription.subscription_plans.name) : <Badge variant="outline">Sem Plano</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const maxUsers = tenantFeatures?.[tenant.id] ?? tenant.subscription?.subscription_plans.max_users ?? 0;
                        const isOverLimit = maxUsers !== null && (tenant.user_count ?? 0) > maxUsers;
                        return (
                          <span className={isOverLimit ? 'text-red-600 font-semibold' : ''}>
                            {tenant.user_count}/{maxUsers === null ? 'ilimitado' : maxUsers}
                          </span>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={(tenant.agent_count ?? 0) > (tenant.subscription?.subscription_plans.max_agents || 999) ? 'text-red-600 font-semibold' : ''}>
                      {tenant.agent_count}/{tenant.subscription?.subscription_plans.max_agents || 'ilimitado'}
                    </span>
                  </TableCell>
                  <TableCell>{formatBrazilDateTime(tenant.created_at, 'date')}</TableCell>
                  <TableCell>
                    <Select
                      value={tenant.subscription?.plan_id}
                      onValueChange={(value) => updateSubscription.mutate({ tenantId: tenant.id, planId: value })}
                      disabled={updateSubscription.isPending}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans?.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>{plan.name.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-4 border-t">
              <div className="text-sm text-muted-foreground">
                Mostrando {page * PAGE_SIZE + 1} a {Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount} tenants
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                  <ChevronLeft className="h-4 w-4 mr-1" />Anterior
                </Button>
                <div className="text-sm text-muted-foreground">Pagina {page + 1} de {totalPages}</div>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                  Proxima<ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
