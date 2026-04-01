import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2 } from 'lucide-react';
import { CONTACT } from '@/constants/config';
import { PERIOD_CONFIG, type BillingPeriod } from '@/components/admin/BillingPeriodSelector';
import type { Plan, PlanDetails } from '../types';

interface PlanCardProps {
  plan: Plan;
  details: PlanDetails;
  isCurrent: boolean;
  billingPeriod: BillingPeriod;
  isCheckoutPending: boolean;
  onCheckout: (planName: string, period: BillingPeriod) => void;
}

export function PlanCard({ plan, details, isCurrent, billingPeriod, isCheckoutPending, onCheckout }: PlanCardProps) {
  const Icon = details.icon;
  const isPopular = details.popular;
  const isPaidPlan = ['starter_compliance', 'business'].includes(plan.name);
  const isEnterprise = plan.name === 'enterprise';

  return (
    <Card
      className={`relative flex flex-col ${
        isPopular ? 'border-primary shadow-lg ring-2 ring-primary/20' : ''
      } ${isCurrent ? 'border-2 border-primary' : ''}`}
    >
      {isPopular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">Mais Popular</Badge>
      )}
      {isCurrent && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" variant="secondary">Plano Atual</Badge>
      )}
      <CardHeader className="pb-2">
        <div className={`w-10 h-10 rounded-lg ${details.bgColor} flex items-center justify-center mb-2`}>
          <Icon className={`h-5 w-5 ${details.color}`} />
        </div>
        <CardTitle className="text-xl capitalize">
          {plan.name === 'starter_compliance' ? 'Starter Compliance' : plan.name}
        </CardTitle>
        <CardDescription className="text-xs">{details.description}</CardDescription>
        <div className="mt-2">
          <span className="text-2xl font-bold">{details.price}</span>
          {details.priceNote && <p className="text-xs text-muted-foreground">{details.priceNote}</p>}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <ul className="space-y-2 mb-4 flex-1">
          {details.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-xs">{feature}</span>
            </li>
          ))}
        </ul>

        {isPaidPlan && !isCurrent ? (
          <div className="space-y-2">
            {billingPeriod !== 'monthly' && (
              <div className="text-center">
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  💰 -{PERIOD_CONFIG[billingPeriod].discountPct}% aplicado
                </span>
              </div>
            )}
            <Button
              className="w-full"
              variant={isPopular ? 'default' : 'secondary'}
              onClick={() => onCheckout(plan.name, billingPeriod)}
              disabled={isCheckoutPending || !plan.stripe_price_id}
            >
              {isCheckoutPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {!plan.stripe_price_id ? 'Configurar Stripe' : 'Começar Trial Grátis'}
            </Button>
          </div>
        ) : isEnterprise ? (
          <Button className="w-full" variant="outline" onClick={() => window.open(CONTACT.WHATSAPP_LINK, '_blank')}>
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
}
