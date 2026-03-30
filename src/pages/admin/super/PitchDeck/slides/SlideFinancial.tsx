import { PitchSlide } from '@/components/pitch/PitchSlide';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export function SlideFinancial() {
  const scenarios = [
    { name: 'Conservador', growth: '50% a.a.', arr: 'R$ 72.000', highlight: false },
    { name: 'Realista', growth: '100% a.a.', arr: 'R$ 120.000', highlight: true },
    { name: 'Agressivo', growth: '200% a.a.', arr: 'R$ 180.000', highlight: false },
  ];
  const usage = [
    { label: 'Desenvolvimento (Linux/macOS, EDR)', percent: 40 },
    { label: 'Marketing & Vendas', percent: 30 },
    { label: 'Infraestrutura & Cloud', percent: 15 },
    { label: 'Reserva & Legal', percent: 15 },
  ];
  return (
    <PitchSlide slideNumber={9} title="Financeiro" subtitle="Projeções 12 meses">
      <div className="grid grid-cols-2 gap-8 h-full">
        <div className="space-y-6">
          <h3 className="text-xl font-bold">Cenários de Crescimento</h3>
          <div className="space-y-4">
            {scenarios.map((s, i) => (
              <Card key={i} className={`p-4 ${s.highlight ? 'border-primary' : ''}`}>
                <div className="flex items-center justify-between mb-2"><span className="font-medium">{s.name}</span><Badge variant={s.highlight ? 'default' : 'secondary'}>{s.growth}</Badge></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">ARR 12m</span><span className={`font-bold ${s.highlight ? 'text-primary' : ''}`}>{s.arr}</span></div>
              </Card>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <h3 className="text-xl font-bold">Uso do Investimento</h3>
          <div className="space-y-3">
            {usage.map((u, i) => <div key={i}><div className="flex justify-between text-sm mb-1"><span>{u.label}</span><span className="font-bold">{u.percent}%</span></div><Progress value={u.percent} className="h-2" /></div>)}
          </div>
          <Card className="p-4 bg-primary/10 border-primary/30">
            <h4 className="font-bold mb-2">Runway com R$ 100k</h4>
            <p className="text-2xl font-bold text-primary">12-18 meses</p>
            <p className="text-sm text-muted-foreground">até break-even ou próxima rodada</p>
          </Card>
        </div>
      </div>
    </PitchSlide>
  );
}
