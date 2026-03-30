import { PitchSlide } from '@/components/pitch/PitchSlide';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export function SlideProblem() {
  return (
    <PitchSlide slideNumber={2} title="O Problema" subtitle="PMEs são alvos fáceis">
      <div className="grid grid-cols-2 gap-8 h-full">
        <div className="space-y-6">
          {[
            { title: '60% das PMEs', desc: 'fecham em 6 meses após um ataque cibernético' },
            { title: 'R$ 15.000+', desc: 'custo médio por incidente para pequenas empresas' },
            { title: '43% dos ataques', desc: 'miram pequenas empresas (menos proteção)' },
          ].map((item, i) => (
            <Card key={i} className="bg-destructive/10 border-destructive/30">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <AlertTriangle className="w-8 h-8 text-destructive flex-shrink-0" />
                  <div><h3 className="font-bold text-lg">{item.title}</h3><p className="text-muted-foreground">{item.desc}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex flex-col justify-center space-y-4">
          <h3 className="text-2xl font-bold">Por que PMEs são vulneráveis?</h3>
          <ul className="space-y-3 text-lg">
            {['Soluções enterprise são caras demais (R$ 500+/mês)', 'Falta de equipe técnica dedicada', 'Interfaces complexas em inglês', 'Sem visibilidade sobre riscos'].map((t, i) => (
              <li key={i} className="flex items-center gap-3"><span className="w-2 h-2 rounded-full bg-destructive" />{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </PitchSlide>
  );
}
