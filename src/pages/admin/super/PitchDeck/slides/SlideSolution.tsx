import { PitchSlide } from '@/components/pitch/PitchSlide';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Brain, Zap } from 'lucide-react';

export function SlideSolution() {
  const solutions = [
    { icon: Shield, title: 'Proteção Completa', items: ['Inventário de software automático', 'Detecção de vulnerabilidades', 'Status de antivírus em tempo real', 'Monitoramento de atividade web', 'Diagnóstico de rede e firewall'] },
    { icon: Brain, title: 'IA Integrada', items: ['Análise inteligente de riscos', 'Recomendações automatizadas', 'Insights proativos', 'Gemini/GPT nativos', 'Sem API keys extras'] },
    { icon: Zap, title: 'Instalação 1-Click', items: ['Deploy em 60 segundos', 'Comando único PowerShell', 'Auto-update inteligente', 'Zero configuração manual', 'Dashboard em português'] },
  ];
  return (
    <PitchSlide slideNumber={3} title="A Solução" subtitle="Segurança simples, inteligente e acessível">
      <div className="grid grid-cols-3 gap-6 h-full">
        {solutions.map(({ icon: Icon, title, items }, i) => (
          <Card key={i} className="bg-primary/5 border-primary/20">
            <CardHeader><Icon className="w-12 h-12 text-primary mb-2" /><CardTitle>{title}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">{items.map((t, j) => <p key={j}>• {t}</p>)}</CardContent>
          </Card>
        ))}
      </div>
    </PitchSlide>
  );
}
