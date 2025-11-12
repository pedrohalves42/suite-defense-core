import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Zap, Crown } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';

interface Plan {
  id: string;
  name: string;
  max_users: number;
  max_agents: number | null;
  max_scans_per_month: number | null;
}

interface CurrentSubscription {
  subscription_plans: Plan;
}

export default function PlanUpgrade() {
  const { tenant, loading: tenantLoading } = useTenant();

  // Buscar plano atual
  const { data: currentSubscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: ['current-subscription', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');

      const { data, error } = await supabase
        .from('tenant_subscriptions')
        .select(`
          subscription_plans (
            id,
            name,
            max_users,
            max_agents,
            max_scans_per_month
          )
        `)
        .eq('tenant_id', tenant.id)
        .single();

      if (error) throw error;
      return data as CurrentSubscription;
    },
    enabled: !!tenant?.id,
  });

  // Buscar todos os planos disponíveis
  const { data: allPlans = [] } = useQuery({
    queryKey: ['all-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('max_users', { ascending: true });

      if (error) throw error;
      return data as Plan[];
    },
  });

  const currentPlanName = currentSubscription?.subscription_plans.name;

  const planDetails = {
    free: {
      icon: Zap,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      price: 'Grátis',
      description: 'Perfeito para começar',
      features: [
        'Até 2 usuários',
        'Até 5 agentes',
        '100 scans por mês',
        'Suporte por email',
        'Dashboard básico',
      ],
    },
    pro: {
      icon: Crown,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      price: 'R$ 99/mês',
      description: 'Para equipes em crescimento',
      features: [
        'Até 10 usuários',
        'Até 50 agentes',
        '1000 scans por mês',
        'Suporte prioritário',
        'Dashboard avançado',
        'Relatórios customizados',
        'API access',
      ],
      popular: true,
    },
    enterprise: {
      icon: Crown,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      price: 'Customizado',
      description: 'Para grandes organizações',
      features: [
        'Usuários ilimitados',
        'Agentes ilimitados',
        'Scans ilimitados',
        'Suporte 24/7',
        'Dashboard enterprise',
        'White label',
        'SLA garantido',
        'Onboarding dedicado',
      ],
    },
  };

  if (tenantLoading || subscriptionLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Carregando planos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Planos e Preços</h1>
        <p className="text-muted-foreground mt-1">
          Escolha o plano ideal para sua equipe
        </p>
      </div>

      {currentPlanName && (
        <Card>
          <CardHeader>
            <CardTitle>Plano Atual</CardTitle>
            <CardDescription>
              Você está no plano <Badge variant="secondary">{currentPlanName}</Badge>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {allPlans.map((plan) => {
          const details = planDetails[plan.name as keyof typeof planDetails];
          const Icon = details.icon;
          const isCurrent = plan.name === currentPlanName;
          const isPopular = 'popular' in details && details.popular;

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
                <div className="mt-4">
                  <span className="text-3xl font-bold">{details.price}</span>
                </div>
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
                <Button
                  className="w-full"
                  variant={isCurrent ? 'outline' : isPopular ? 'default' : 'secondary'}
                  disabled={isCurrent}
                >
                  {isCurrent ? 'Plano Atual' : plan.name === 'enterprise' ? 'Contatar Vendas' : 'Fazer Upgrade'}
                </Button>
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
          <Button variant="outline">Falar com Vendas</Button>
        </CardContent>
      </Card>
    </div>
  );
}
