import { PitchSlide } from '@/components/pitch/PitchSlide';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function SlideBusinessModel() {
  const plans = [
    { name: 'Starter Compliance', price: 'R$ 499/mês', devices: '10 PCs base (+R$39/extra)', features: 'RMM + EDR + Compliance básico', highlight: false },
    { name: 'Business', price: 'R$ 899/mês', devices: '20 PCs base (+R$24/extra)', features: '+ Scans ilimitados, Relatórios, Analytics', highlight: true },
    { name: 'Enterprise / MSP', price: 'A partir de R$ 2.000/mês', devices: '+200 PCs / Ilimitado', features: '+ SLA, Multi-tenant, API, White label', highlight: false },
  ];
  const unitEcon = [{ label: 'LTV/CAC', value: '12x' }, { label: 'Gross Margin', value: '80%+' }, { label: 'Churn Target', value: '<5%' }, { label: 'Payback', value: '3-4 meses' }];

  return (
    <PitchSlide slideNumber={7} title="Modelo de Negócio" subtitle="SaaS B2B com unit economics saudáveis">
      <div className="grid grid-cols-2 gap-8 h-full">
        <div className="space-y-6">
          <h3 className="text-xl font-bold">Planos de Preço</h3>
          {plans.map((plan, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between mb-2"><span className="font-bold">{plan.name}</span><Badge variant={plan.highlight ? 'default' : 'secondary'}>{plan.price}</Badge></div>
              <p className="text-sm text-muted-foreground">{plan.devices} - {plan.features}</p>
            </Card>
          ))}
        </div>
        <div className="space-y-6">
          <h3 className="text-xl font-bold">Unit Economics</h3>
          <div className="space-y-4">{unitEcon.map((u, i) => <div key={i} className="flex items-center justify-between p-4 bg-primary/5 rounded-lg"><span>{u.label}</span><span className="text-2xl font-bold text-primary">{u.value}</span></div>)}</div>
        </div>
      </div>
    </PitchSlide>
  );
}
