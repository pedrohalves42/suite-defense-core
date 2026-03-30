import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { usePitchMetrics } from './hooks/usePitchMetrics';
import { SlideTitle, SlideProblem, SlideSolution, SlideMarket, SlideProduct, SlideTraction, SlideBusinessModel, SlideTeam, SlideFinancial, SlideAsk } from './slides';

const TOTAL_SLIDES = 10;

export default function PitchDeck() {
  const [currentSlide, setCurrentSlide] = useState(1);
  const { data: metrics } = usePitchMetrics();

  const slides: Record<number, React.ReactNode> = {
    1: <SlideTitle />,
    2: <SlideProblem />,
    3: <SlideSolution />,
    4: <SlideMarket />,
    5: <SlideProduct metrics={metrics} />,
    6: <SlideTraction metrics={metrics} />,
    7: <SlideBusinessModel />,
    8: <SlideTeam />,
    9: <SlideFinancial />,
    10: <SlideAsk />,
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Pitch Deck</h1><p className="text-muted-foreground">Apresentação para investidores</p></div>
        <Button onClick={() => window.print()} variant="outline"><Download className="w-4 h-4 mr-2" />Exportar PDF</Button>
      </div>
      <div className="flex items-center gap-2">
        {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
          <button key={i} onClick={() => setCurrentSlide(i + 1)} className={`h-2 flex-1 rounded-full transition-colors ${i + 1 === currentSlide ? 'bg-primary' : i + 1 < currentSlide ? 'bg-primary/50' : 'bg-muted'}`} />
        ))}
      </div>
      <div className="print:break-after-page">{slides[currentSlide]}</div>
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setCurrentSlide(p => Math.max(p - 1, 1))} disabled={currentSlide === 1}><ChevronLeft className="w-4 h-4 mr-2" />Anterior</Button>
        <span className="text-sm text-muted-foreground">{currentSlide} de {TOTAL_SLIDES}</span>
        <Button variant="outline" onClick={() => setCurrentSlide(p => Math.min(p + 1, TOTAL_SLIDES))} disabled={currentSlide === TOTAL_SLIDES}>Próximo<ChevronRight className="w-4 h-4 ml-2" /></Button>
      </div>
      <style>{`@media print { .print\\:break-after-page { break-after: page; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
    </div>
  );
}
