import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, CreditCard, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ExtendedPlan {
  name: string;
  billing_period: string;
  discount_pct: number;
  stripe_price_id: string | null;
  is_active: boolean;
}

export function StripeExtendedPricesSetup() {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<any>(null);

  // Fetch extended plans status
  const { data: extendedPlans = [], isLoading, refetch } = useQuery({
    queryKey: ['extended-plans-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('name, billing_period, discount_pct, stripe_price_id, is_active')
        .neq('billing_period', 'monthly')
        .order('name');
      
      if (error) throw error;
      return data as ExtendedPlan[];
    },
  });

  // Create extended prices mutation
  const createPrices = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-stripe-products-extended');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setLastResult(data);
      refetch();
      toast({
        title: 'Preços Criados com Sucesso',
        description: `${data.created?.length || 0} preços foram criados no Stripe.`,
      });
    },
    onError: (error: Record<string, unknown>) => {
      toast({
        title: 'Erro ao Criar Preços',
        description: error.message || 'Verifique os logs para mais detalhes.',
        variant: 'destructive',
      });
    },
  });

  const missingPrices = extendedPlans.filter(p => !p.stripe_price_id);
  const configuredPrices = extendedPlans.filter(p => p.stripe_price_id);

  const getBillingLabel = (period: string) => {
    const labels: Record<string, string> = {
      '6m': '6 Meses',
      '12m': '12 Meses (Anual)',
      '24m': '24 Meses',
    };
    return labels[period] || period;
  };

  const getPlanLabel = (name: string) => {
    if (name.includes('starter')) return 'Starter';
    if (name.includes('pro')) return 'Pro';
    if (name.includes('scale')) return 'Scale';
    return name;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Configuração de Preços Estendidos (Stripe)
        </CardTitle>
        <CardDescription>
          Configure os preços para períodos de 6, 12 e 24 meses com descontos progressivos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium">{configuredPrices.length} Configurados</p>
              <p className="text-xs text-muted-foreground">Preços ativos no Stripe</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <XCircle className="h-5 w-5 text-orange-500" />
            <div>
              <p className="text-sm font-medium">{missingPrices.length} Pendentes</p>
              <p className="text-xs text-muted-foreground">Aguardando criação</p>
            </div>
          </div>
        </div>

        {/* Warning if missing prices */}
        {missingPrices.length > 0 && (
          <Alert variant="destructive" className="bg-orange-500/10 border-orange-500/50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {missingPrices.length} planos estendidos não possuem preços configurados no Stripe. 
              Clique no botão abaixo para criar automaticamente.
            </AlertDescription>
          </Alert>
        )}

        {/* Action Button */}
        <Button
          onClick={() => createPrices.mutate()}
          disabled={createPrices.isPending || missingPrices.length === 0}
          className="w-full"
        >
          {createPrices.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Criando Preços no Stripe...
            </>
          ) : missingPrices.length === 0 ? (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Todos os Preços Configurados
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Criar {missingPrices.length} Preços no Stripe
            </>
          )}
        </Button>

        {/* Last Result */}
        {lastResult && (
          <Alert className="bg-green-500/10 border-green-500/50">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription>
              <strong>Resultado:</strong> {lastResult.created?.length || 0} preços criados. 
              {lastResult.errors?.length > 0 && (
                <span className="text-orange-500"> ({lastResult.errors.length} erros)</span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Plans Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plano</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Desconto</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {extendedPlans.map((plan) => (
              <TableRow key={`${plan.name}-${plan.billing_period}`}>
                <TableCell className="font-medium">
                  {getPlanLabel(plan.name)}
                </TableCell>
                <TableCell>{getBillingLabel(plan.billing_period)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">-{plan.discount_pct}%</Badge>
                </TableCell>
                <TableCell>
                  {plan.stripe_price_id ? (
                    <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Configurado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-orange-500 border-orange-500">
                      <XCircle className="mr-1 h-3 w-3" />
                      Pendente
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
