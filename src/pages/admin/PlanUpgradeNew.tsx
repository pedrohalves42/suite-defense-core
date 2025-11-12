import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Zap, Crown, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useTenant } from '@/hooks/useTenant';

interface Plan {
  id: string;
  name: string;
  max_users: number;
  max_agents: number | null;
  max_scans_per_month: number | null;
  price_per_device: number;
  max_devices: number;
  stripe_price_id: string | null;
}

export default function PlanUpgradeNew() {
  const { toast } = useToast();
  const { subscription, refetch: refetchSubscription } = useSubscription();
  const { tenant } = useTenant();
  const [deviceQuantities, setDeviceQuantities] = useState<Record<string, number>>({
    starter: 1,
    pro: 1,
  });

  // Fetch all available plans
  const { data: allPlans = [] } = useQuery({
    queryKey: ['all-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_per_device', { ascending: true });

      if (error) throw error;
      return data as Plan[];
    },
  });

  // Create checkout session
  const createCheckout = useMutation({
    mutationFn: async ({ planName, deviceQuantity }: { planName: string; deviceQuantity: number }) => {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { planName, deviceQuantity },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        toast({
          title: 'Redirecionando para o checkout',
          description: 'Você será redirecionado para completar o pagamento.',
        });
        // Redirect in the same tab for better UX (avoids popup blockers)
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar checkout',
        description: error.message,
        variant: 'destructive',
      });
    },
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
        toast({
          title: 'Redirecionando para o portal',
          description: 'Você será redirecionado para gerenciar sua assinatura.',
        });
        // Redirect in the same tab for better UX
        window.location.href = data.url;
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

  const currentPlanName = subscription?.plan_name || 'free';
  const isSubscribed = subscription?.subscribed || false;

  const planDetails = {
    free: {
      icon: Zap,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      description: 'Perfeito para começar',
      features: [
        'Até 5 dispositivos',
        '2 scans avançados por dia',
        'Dashboard básico',
        'Suporte por email',
      ],
    },
    starter: {
      icon: Zap,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      description: 'Ideal para pequenas empresas',
      features: [
        'Até 30 dispositivos',
        '2 scans avançados por dia',
        'Dashboard avançado',
        'Suporte por email',
        '30 dias de trial gratuito',
      ],
      popular: true,
    },
    pro: {
      icon: Crown,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      description: 'Para equipes em crescimento',
      features: [
        'Até 200 dispositivos',
        'Scans avançados ilimitados',
        'Dashboard avançado com analytics',
        'Suporte prioritário',
        'API access',
        'Relatórios customizados',
        '30 dias de trial gratuito',
      ],
    },
    enterprise: {
      icon: Crown,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      description: 'Para grandes organizações',
      features: [
        'Dispositivos ilimitados',
        'Scans ilimitados',
        'Todas as features Pro',
        'Suporte 24/7',
        'SLA garantido',
        'Onboarding dedicado',
      ],
    },
  };

  const formatPrice = (priceInCents: number) => {
    return `R$ ${(priceInCents / 100).toFixed(2)}`;
  };

  const calculateTotal = (planName: string, plan: Plan) => {
    const quantity = deviceQuantities[planName] || 1;
    return formatPrice(plan.price_per_device * quantity);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Planos e Preços</h1>
        <p className="text-muted-foreground mt-1">
          Escolha o plano ideal para sua equipe
        </p>
      </div>

      {isSubscribed && subscription && (
        <Card className="border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Plano Atual: {subscription.plan_name.toUpperCase()}</CardTitle>
                <CardDescription>
                  {subscription.device_quantity} dispositivo(s) • Status: {subscription.status}
                </CardDescription>
                {subscription.trial_end && new Date(subscription.trial_end) > new Date() && (
                  <Badge variant="secondary" className="mt-2">
                    Trial até {new Date(subscription.trial_end).toLocaleDateString('pt-BR')}
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => openPortal.mutate()}
                disabled={openPortal.isPending}
              >
                {openPortal.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Gerenciar Assinatura
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {allPlans.map((plan) => {
          const details = planDetails[plan.name as keyof typeof planDetails];
          if (!details) return null;

          const Icon = details.icon;
          const isCurrent = plan.name === currentPlanName;
          const isPopular = 'popular' in details && details.popular;
          const isPaidPlan = plan.name === 'starter' || plan.name === 'pro';
          const quantity = deviceQuantities[plan.name] || 1;

          return (
            <Card
              key={plan.id}
              className={`relative ${
                isPopular ? 'border-primary shadow-lg scale-105' : ''
              } ${isCurrent ? 'border-2 border-primary' : ''}`}
            >
              {isPopular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Mais Popular
                </Badge>
              )}
              {isCurrent && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" variant="secondary">
                  Plano Atual
                </Badge>
              )}
              <CardHeader>
                <div className={`w-12 h-12 rounded-lg ${details.bgColor} flex items-center justify-center mb-4`}>
                  <Icon className={`h-6 w-6 ${details.color}`} />
                </div>
                <CardTitle className="text-2xl capitalize">{plan.name}</CardTitle>
                <CardDescription>{details.description}</CardDescription>
                
                {isPaidPlan ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <Label htmlFor={`quantity-${plan.name}`}>Quantidade de Dispositivos</Label>
                      <Input
                        id={`quantity-${plan.name}`}
                        type="number"
                        min={1}
                        max={plan.max_devices}
                        value={quantity}
                        onChange={(e) => setDeviceQuantities({
                          ...deviceQuantities,
                          [plan.name]: Math.min(Math.max(1, parseInt(e.target.value) || 1), plan.max_devices)
                        })}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Máximo: {plan.max_devices} dispositivos
                      </p>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground">
                        {formatPrice(plan.price_per_device)}/dispositivo/mês
                      </p>
                      <p className="text-3xl font-bold mt-1">
                        {calculateTotal(plan.name, plan)}/mês
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <span className="text-3xl font-bold">
                      {plan.name === 'enterprise' ? 'Customizado' : 'Grátis'}
                    </span>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {details.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                {isPaidPlan && !isCurrent ? (
                  <Button
                    className="w-full"
                    variant={isPopular ? 'default' : 'secondary'}
                    onClick={() => createCheckout.mutate({ 
                      planName: plan.name, 
                      deviceQuantity: quantity 
                    })}
                    disabled={createCheckout.isPending}
                  >
                    {createCheckout.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Assinar Agora
                  </Button>
                ) : plan.name === 'enterprise' ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => window.open('https://wa.me/5534984432835', '_blank')}
                  >
                    Falar com Vendas
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled={isCurrent}>
                    {isCurrent ? 'Plano Atual' : 'Grátis'}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Precisa de mais?</CardTitle>
          <CardDescription>
            Entre em contato para planos customizados ou recursos adicionais
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline"
            onClick={() => window.open('https://wa.me/5534984432835', '_blank')}
          >
            Falar com Vendas
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
