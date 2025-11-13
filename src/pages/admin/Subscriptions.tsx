import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  DollarSign, Users, CreditCard, TrendingUp, ExternalLink, 
  Download, Calendar, Loader2, ArrowUpCircle, Clock, AlertTriangle 
} from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

export default function Subscriptions() {
  const { tenant } = useTenant();
  const { subscription, isLoading: subLoading, refetch: refetchSubscription } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch billing history (invoices)
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('list-invoices');
      if (error) throw error;
      return data.invoices || [];
    },
    enabled: !!tenant?.id && subscription?.plan_name !== 'free',
  });

  // Open customer portal
  const openPortal = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, '_blank');
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao abrir portal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const formatMoney = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(cents / 100);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const calculateUsagePercentage = (used: number, limit: number | null) => {
    if (!limit) return 0;
    return Math.min(Math.round((used / limit) * 100), 100);
  };

  const isOnFreePlan = subscription?.plan_name === 'free';
  const isTrialing = subscription?.status === 'trialing';
  const trialDaysRemaining = subscription?.trial_end 
    ? Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  // Calculate features usage
  const maxDevices = subscription?.features?.max_devices?.quota_limit || 0;
  const usedDevices = subscription?.features?.max_devices?.quota_used || 0;
  const devicesPercentage = calculateUsagePercentage(usedDevices, maxDevices);

  const maxScans = subscription?.features?.advanced_scans_daily?.quota_limit;
  const usedScans = subscription?.features?.advanced_scans_daily?.quota_used || 0;
  const scansPercentage = maxScans ? calculateUsagePercentage(usedScans, maxScans) : 0;

  if (subLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Minha Assinatura</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seu plano, uso e faturamento
          </p>
        </div>
        {!isOnFreePlan && (
          <Button
            onClick={() => openPortal.mutate()}
            disabled={openPortal.isPending}
            variant="outline"
          >
            {openPortal.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Gerenciar no Stripe
          </Button>
        )}
      </div>

      {/* Trial Warning */}
      {isTrialing && trialDaysRemaining <= 7 && (
        <Alert className={trialDaysRemaining <= 1 ? "border-destructive bg-destructive/10" : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950"}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {trialDaysRemaining <= 1 ? (
              <strong>⚠️ Seu trial expira amanhã!</strong>
            ) : (
              <strong>Seu trial expira em {trialDaysRemaining} dias</strong>
            )}
            {' '}
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={() => navigate('/admin/plan-upgrade')}
            >
              Escolha um plano agora →
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Current Plan Card */}
      <Card className={isOnFreePlan ? "" : "border-primary"}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl capitalize">{subscription?.plan_name || 'Free'}</CardTitle>
              <CardDescription>
                {isTrialing ? (
                  <span className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4" />
                    Trial - {trialDaysRemaining} dias restantes
                  </span>
                ) : (
                  'Plano Atual'
                )}
              </CardDescription>
            </div>
            <Badge variant={isOnFreePlan ? "outline" : "default"} className="text-lg px-4 py-2">
              {subscription?.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isOnFreePlan && subscription?.device_quantity && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Dispositivos na Assinatura</p>
              <p className="text-3xl font-bold">{subscription.device_quantity}</p>
            </div>
          )}
          
          {subscription?.current_period_end && (
            <div>
              <p className="text-sm text-muted-foreground">Próxima Renovação</p>
              <p className="text-lg font-medium">
                {new Date(subscription.current_period_end).toLocaleDateString('pt-BR')}
              </p>
            </div>
          )}

          {isOnFreePlan && (
            <Button
              onClick={() => navigate('/admin/plan-upgrade')}
              className="w-full mt-4"
            >
              <ArrowUpCircle className="h-4 w-4 mr-2" />
              Fazer Upgrade
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Usage Metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Uso de Dispositivos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{usedDevices}</span>
              <span className="text-muted-foreground">
                {maxDevices ? `de ${maxDevices}` : 'Ilimitado'}
              </span>
            </div>
            {maxDevices > 0 && (
              <Progress value={devicesPercentage} className="h-2" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Scans Avançados (Hoje)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{usedScans}</span>
              <span className="text-muted-foreground">
                {maxScans ? `de ${maxScans}` : 'Ilimitado'}
              </span>
            </div>
            {maxScans && (
              <Progress value={scansPercentage} className="h-2" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Billing History */}
      {!isOnFreePlan && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Faturamento</CardTitle>
            <CardDescription>
              Suas últimas faturas e pagamentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : invoices.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma fatura encontrada
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice: any) => (
                    <TableRow key={invoice.id}>
                      <TableCell>{formatDate(invoice.created)}</TableCell>
                      <TableCell className="font-mono text-sm">{invoice.number}</TableCell>
                      <TableCell className="font-medium">
                        {formatMoney(invoice.amount_due)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          invoice.status === 'paid' ? 'default' :
                          invoice.status === 'open' ? 'secondary' :
                          'destructive'
                        }>
                          {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {invoice.invoice_pdf && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(invoice.invoice_pdf, '_blank')}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
