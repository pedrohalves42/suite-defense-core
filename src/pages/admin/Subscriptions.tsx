import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, Users, CreditCard, TrendingUp } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';

export default function Subscriptions() {
  const { tenant } = useTenant();

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['all-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_subscriptions')
        .select(`
          *,
          tenants(name),
          subscription_plans(name, price_per_device)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const activeSubscriptions = subscriptions.filter((s: any) => 
    ['active', 'trialing'].includes(s.status)
  );

  const totalDevices = activeSubscriptions.reduce((sum: number, s: any) => 
    sum + (s.device_quantity || 0), 0
  );

  const mrr = activeSubscriptions.reduce((sum: number, s: any) => {
    const pricePerDevice = s.subscription_plans?.price_per_device || 0;
    const quantity = s.device_quantity || 0;
    return sum + (pricePerDevice * quantity);
  }, 0);

  const formatMoney = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(cents / 100);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assinaturas</h1>
        <p className="text-muted-foreground mt-1">
          Visão geral das assinaturas e receita
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(mrr)}</div>
            <p className="text-xs text-muted-foreground">
              Receita recorrente mensal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSubscriptions.length}</div>
            <p className="text-xs text-muted-foreground">
              Total de {subscriptions.length} assinaturas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dispositivos Totais</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDevices}</div>
            <p className="text-xs text-muted-foreground">
              Dispositivos monitorados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {subscriptions.length > 0 
                ? Math.round((activeSubscriptions.length / subscriptions.length) * 100)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Trial para pago
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todas as Assinaturas</CardTitle>
          <CardDescription>
            Lista completa de assinaturas e seu status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Dispositivos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor/Mês</TableHead>
                <TableHead>Próximo Pagamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((sub: any) => {
                const value = (sub.subscription_plans?.price_per_device || 0) * (sub.device_quantity || 0);
                return (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">{sub.tenants?.name}</TableCell>
                    <TableCell className="capitalize">{sub.subscription_plans?.name}</TableCell>
                    <TableCell>{sub.device_quantity || 0}</TableCell>
                    <TableCell>
                      <Badge variant={
                        sub.status === 'active' ? 'default' :
                        sub.status === 'trialing' ? 'secondary' :
                        sub.status === 'past_due' ? 'destructive' :
                        'outline'
                      }>
                        {sub.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatMoney(value)}</TableCell>
                    <TableCell>
                      {sub.current_period_end 
                        ? new Date(sub.current_period_end).toLocaleDateString('pt-BR')
                        : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
