import { PitchSlide } from '@/components/pitch/PitchSlide';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle } from 'lucide-react';

export function SlideAsk() {
  return (
    <PitchSlide slideNumber={10} title="Ask" subtitle="Oportunidade de investimento">
      <div className="flex flex-col items-center justify-center h-full space-y-8">
        <div className="text-center"><h2 className="text-5xl font-bold text-primary mb-4">R$ 100.000</h2><p className="text-xl text-muted-foreground">por 10-12.5% equity</p></div>
        <div className="grid grid-cols-2 gap-8 w-full max-w-3xl">
          <Card className="p-6">
            <h3 className="font-bold text-lg mb-4">Valuation</h3>
            <div className="space-y-3">
              {[['Pre-money','R$ 700k - R$ 1M'],['Post-money','R$ 800k - R$ 1.1M'],['Metodologia','3 métodos']].map(([l,v],i) => <div key={i} className="flex justify-between"><span className="text-muted-foreground">{l}</span><span className="font-bold">{v}</span></div>)}
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="font-bold text-lg mb-4">Retorno Potencial</h3>
            <div className="space-y-3">
              {[['Exit 3 anos (5x)','R$ 500k'],['Exit 5 anos (10x)','R$ 1M'],['Tipo','Equity / SAFE']].map(([l,v],i) => <div key={i} className="flex justify-between"><span className="text-muted-foreground">{l}</span><span className={`font-bold ${i < 2 ? 'text-primary' : ''}`}>{v}</span></div>)}
            </div>
          </Card>
        </div>
        <div className="flex gap-4 mt-4">
          {['Produto Validado','Cliente Confirmado','Arquitetura Escalável'].map((t,i) => <Badge key={i} variant="outline" className="text-lg px-4 py-2"><CheckCircle className="w-4 h-4 mr-2 text-green-500" />{t}</Badge>)}
        </div>
      </div>
    </PitchSlide>
  );
}
