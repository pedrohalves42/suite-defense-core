import { PitchSlide } from '@/components/pitch/PitchSlide';
import { Card } from '@/components/ui/card';

interface SlideProductProps {
  metrics?: { successRate: string; activeAgents: number; totalJobs: number } | null;
}

export function SlideProduct({ metrics }: SlideProductProps) {
  const stack = [
    { label: 'Frontend', value: 'React + TypeScript' },
    { label: 'Backend', value: 'Supabase Edge Functions' },
    { label: 'Database', value: 'PostgreSQL + RLS' },
    { label: 'Agent', value: 'PowerShell Windows' },
    { label: 'Auth', value: 'JWT + HMAC' },
    { label: 'AI', value: 'Gemini/GPT Nativo' },
  ];
  const liveMetrics = [
    { label: 'Taxa de Sucesso Jobs', value: `${metrics?.successRate || 0}%` },
    { label: 'Agentes Ativos', value: metrics?.activeAgents || 0 },
    { label: 'Jobs Processados', value: metrics?.totalJobs || 0 },
  ];
  return (
    <PitchSlide slideNumber={5} title="Produto" subtitle="Arquitetura e tecnologia">
      <div className="grid grid-cols-2 gap-8 h-full">
        <div className="space-y-4">
          <h3 className="text-xl font-bold mb-4">Stack Tecnológico</h3>
          <div className="grid grid-cols-2 gap-3">{stack.map((s, i) => <Card key={i} className="p-3"><p className="text-xs text-muted-foreground">{s.label}</p><p className="font-medium text-sm">{s.value}</p></Card>)}</div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xl font-bold mb-4">Métricas de Qualidade (ao vivo)</h3>
          <div className="space-y-4">{liveMetrics.map((m, i) => <Card key={i} className="p-4 bg-primary/5"><div className="flex items-center justify-between"><span className="text-muted-foreground">{m.label}</span><span className="text-2xl font-bold text-primary">{m.value}</span></div></Card>)}</div>
        </div>
      </div>
    </PitchSlide>
  );
}
