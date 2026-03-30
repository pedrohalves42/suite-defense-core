import { PitchSlide } from '@/components/pitch/PitchSlide';
import { Card } from '@/components/ui/card';
import { Users, Server, CreditCard, DollarSign, CheckCircle, Rocket } from 'lucide-react';

interface SlideTracionProps {
  metrics?: { totalTenants: number; totalAgents: number; activeSubs: number; mrr: number } | null;
}

export function SlideTraction({ metrics }: SlideTracionProps) {
  const kpis = [
    { label: 'Tenants', value: metrics?.totalTenants || 0, icon: Users },
    { label: 'Agentes', value: metrics?.totalAgents || 0, icon: Server },
    { label: 'Subscrições', value: metrics?.activeSubs || 0, icon: CreditCard },
    { label: 'MRR', value: `R$ ${metrics?.mrr || 0}`, icon: DollarSign },
  ];
  return (
    <PitchSlide slideNumber={6} title="Tração" subtitle="Validação de mercado">
      <div className="grid grid-cols-4 gap-6 mb-8">
        {kpis.map((item, i) => <Card key={i} className="text-center p-6"><item.icon className="w-8 h-8 mx-auto text-primary mb-2" /><p className="text-3xl font-bold">{item.value}</p><p className="text-sm text-muted-foreground">{item.label}</p></Card>)}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-500" />Marcos Alcançados</h3>
          <ul className="space-y-2 text-sm">
            {['Produto 95% pronto para produção','Primeiro cliente confirmado (trial 45 dias)','Auditoria de segurança completa','RLS multi-tenant validado'].map((t,i) => <li key={i} className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500" />{t}</li>)}
          </ul>
        </Card>
        <Card className="p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Rocket className="w-5 h-5 text-primary" />Próximos Passos</h3>
          <ul className="space-y-2 text-sm">
            {['Primeira venda - Q1 2025','Alertas WhatsApp/Telegram','Agente Linux/macOS','EDR básico (processo monitoring)'].map((t,i) => <li key={i} className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-primary" />{t}</li>)}
          </ul>
        </Card>
      </div>
    </PitchSlide>
  );
}
