import { PitchSlide } from '@/components/pitch/PitchSlide';
import { Card } from '@/components/ui/card';
import { Users } from 'lucide-react';

export function SlideTeam() {
  return (
    <PitchSlide slideNumber={8} title="Time" subtitle="Fundador dedicado">
      <div className="flex flex-col items-center justify-center h-full space-y-8">
        <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center"><Users className="w-16 h-16 text-primary" /></div>
        <div className="text-center max-w-2xl">
          <h3 className="text-2xl font-bold mb-4">Solo Founder</h3>
          <p className="text-lg text-muted-foreground mb-6">Desenvolvedor full-stack com experiência em segurança, 800-1200 horas dedicadas ao CyberShield.</p>
          <div className="grid grid-cols-3 gap-4">
            {[['5+','Anos XP Dev'],['1000+','Horas no Projeto'],['100%','Dedicação']].map(([v,l],i) => <Card key={i} className="p-4 text-center"><p className="text-2xl font-bold text-primary">{v}</p><p className="text-sm text-muted-foreground">{l}</p></Card>)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full max-w-xl">
          <Card className="p-4"><h4 className="font-bold mb-2">Competências</h4><p className="text-sm text-muted-foreground">React, TypeScript, Supabase, PowerShell, Segurança, IA</p></Card>
          <Card className="p-4"><h4 className="font-bold mb-2">Hiring Plan</h4><p className="text-sm text-muted-foreground">Vendas (Q2), DevOps (Q3), Suporte (Q4)</p></Card>
        </div>
      </div>
    </PitchSlide>
  );
}
