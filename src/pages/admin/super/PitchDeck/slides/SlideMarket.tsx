import { PitchSlide } from '@/components/pitch/PitchSlide';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Target } from 'lucide-react';

export function SlideMarket() {
  return (
    <PitchSlide slideNumber={4} title="Mercado" subtitle="TAM / SAM / SOM">
      <div className="grid grid-cols-2 gap-8 h-full">
        <div className="space-y-6">
          {[
            { label: 'TAM - Total', value: 'R$ 8 Bi', pct: 100, desc: 'Mercado de cibersegurança PME Brasil' },
            { label: 'SAM - Acessível', value: 'R$ 1.2 Bi', pct: 15, desc: 'PMEs 10-200 funcionários, SP/MG/RJ' },
            { label: 'SOM - Alvo 5 anos', value: 'R$ 50 Mi', pct: 4, desc: '0.6% do SAM - meta conservadora' },
          ].map((m, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-2"><span className="text-lg font-medium">{m.label}</span><span className="text-2xl font-bold text-primary">{m.value}</span></div>
              <Progress value={m.pct} className="h-3" />
              <p className="text-sm text-muted-foreground mt-1">{m.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-center">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-5 h-5" />Segmento Alvo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[['Empresas','10-50 PCs'],['Setores','Comércio, Serviços'],['Região','Sudeste Brasil'],['Ticket Médio','R$ 500-1500/mês']].map(([l,v],i) => (
                <div key={i} className={`flex justify-between items-center py-2 ${i < 3 ? 'border-b' : ''}`}><span>{l}</span><Badge variant="secondary">{v}</Badge></div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PitchSlide>
  );
}
